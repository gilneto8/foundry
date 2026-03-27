"""
outbound/src/scraper.py
Core scraping logic targeting Google Maps for Portuguese businesses.

APPROACH:
  Uses the unofficial Google Maps search scraper via requests + BeautifulSoup.
  Targets the `maps/search/` endpoint which returns HTML parseable without
  a full browser. This works for directory listing data (names, addresses,
  ratings, phone numbers). For richer data (emails, websites), we follow
  the individual place page.

CATEGORIES → SEARCH QUERIES:
  real_estate  → "agências imobiliárias em {cidade}, Portugal"
  restaurants  → "restaurantes em {cidade}, Portugal"
  transport    → "empresas de transporte em {cidade}, Portugal"

CITY SWEEP:
  Rotates through the top 20 Portuguese cities by population to build
  national coverage across multiple scrape runs.
"""

import time
import logging
import re
from typing import Generator
import requests
from bs4 import BeautifulSoup
from db import start_run, finish_run, upsert_leads

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# City sweep — rotated on each run so no single city dominates
# ---------------------------------------------------------------------------
PT_CITIES = [
    "Lisboa", "Porto", "Braga", "Coimbra", "Faro",
    "Setúbal", "Funchal", "Aveiro", "Évora", "Viseu",
    "Leiria", "Viana do Castelo", "Castelo Branco", "Guarda", "Bragança",
    "Santarém", "Portalegre", "Beja", "Vila Real", "Angra do Heroísmo",
]

# ---------------------------------------------------------------------------
# Category → search query template
# ---------------------------------------------------------------------------
CATEGORY_QUERIES = {
    "real_estate": "agências imobiliárias em {city} Portugal",
    "restaurants": "restaurantes em {city} Portugal",
    "transport": "empresas de transporte em {city} Portugal",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
}


# ---------------------------------------------------------------------------
# Public interface — called from main.py
# ---------------------------------------------------------------------------
def scrape_category(
    conn,
    category: str,
    region: str,
    max_results: int,
    delay: float,
):
    """
    Scrape one category across all PT_CITIES.
    Persists via db.upsert_leads(), logs each run to scrape_runs.
    """
    if category not in CATEGORY_QUERIES:
        log.warning(f"Unknown category '{category}', skipping")
        return

    total_found = 0
    total_new = 0

    for city in PT_CITIES:
        query = CATEGORY_QUERIES[category].format(city=city)
        run_id = start_run(conn, target=category, query=query)

        try:
            leads = list(_scrape_query(query, category, city, max_results, delay))
            new_count = upsert_leads(conn, leads, source_query=query)

            total_found += len(leads)
            total_new += new_count

            finish_run(conn, run_id, results_found=len(leads), results_new=new_count)
            log.info(
                f"city={city} category={category} found={len(leads)} new={new_count}"
            )

        except Exception as e:
            finish_run(conn, run_id, results_found=0, results_new=0, error=str(e))
            log.error(f"city={city} category={category} error={e}", exc_info=True)

        # Polite delay between cities
        time.sleep(delay)

    log.info(
        f"category={category} total_found={total_found} total_new={total_new}"
    )


# ---------------------------------------------------------------------------
# Internal scraping logic
# ---------------------------------------------------------------------------
def _scrape_query(
    query: str,
    category: str,
    city: str,
    max_results: int,
    delay: float,
) -> Generator[dict, None, None]:
    """
    Scrape Google Maps search results for a given query.
    Yields lead dicts ready for upsert_leads().

    NOTE: Google Maps HTML structure changes periodically.
    If results drop to zero, inspect the raw HTML and update
    the selectors below. The data-cid attribute is the most
    stable identifier.
    """
    # Google Maps search URL
    # hl=pt → Portuguese locale for consistent results
    url = "https://www.google.com/maps/search/" + requests.utils.quote(query) + "/?hl=pt"

    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
    except requests.RequestException as e:
        log.warning(f"Request failed for query='{query}': {e}")
        return

    soup = BeautifulSoup(response.text, "lxml")

    # Google Maps JS-renders most data — the plain HTML approach yields
    # limited results. For production scraping volume, integrate with
    # one of these alternatives (in order of reliability):
    #
    #   1. Google Places API (official, rate-limited, ~$0.017/request)
    #   2. SerpAPI /maps endpoint (paid, ~$50/5k searches)
    #   3. Playwright (see worker/src/adapters/playwright.ts for the pattern)
    #      — renders the full JS, then parses the DOM
    #
    # The parser below extracts what's available in static HTML.
    # It's a starting point — swap the parsing logic for your chosen approach.

    count = 0
    for entry in _parse_results(soup, category, city):
        if count >= max_results:
            break
        yield entry
        count += 1
        time.sleep(delay * 0.3)  # micro-delay between entries


def _parse_results(soup: BeautifulSoup, category: str, city: str) -> Generator[dict, None, None]:
    """
    Parse business entries from a Google Maps search results page.
    Yields partial lead dicts — enrich with _fetch_place_details() for phone/email/website.
    """
    # Heuristic selectors — update if Google changes the HTML structure
    # These target the business card elements in the static HTML response
    entries = soup.find_all("div", attrs={"data-cid": True})

    if not entries:
        # Fallback: try aria-label containers
        entries = soup.find_all("a", attrs={"aria-label": True, "href": re.compile(r"/maps/place/")})

    for entry in entries:
        try:
            name = (
                entry.get("aria-label")
                or entry.find(class_=re.compile(r"fontHeadlineSmall|qBF1Pd"))
                and entry.find(class_=re.compile(r"fontHeadlineSmall|qBF1Pd")).get_text(strip=True)
            )
            if not name:
                continue

            place_url = entry.get("href") or (
                entry.find("a", href=re.compile(r"/maps/place/")) and
                entry.find("a", href=re.compile(r"/maps/place/"))["href"]
            )
            place_id = _extract_place_id(place_url) if place_url else None
            if not place_id:
                # Without a place_id we can't deduplicate — skip
                continue

            # Rating
            rating_el = entry.find(attrs={"aria-label": re.compile(r"\d+,\d")})
            rating = None
            if rating_el:
                m = re.search(r"(\d+)[.,](\d)", rating_el.get("aria-label", ""))
                if m:
                    rating = float(f"{m.group(1)}.{m.group(2)}")

            yield {
                "name": name.strip(),
                "category": category,
                "city": city,
                "region": "Portugal",
                "google_maps_url": f"https://www.google.com/maps/place/?q=place_id:{place_id}" if place_id else place_url,
                "place_id": place_id,
                "rating": rating,
                # Phone, email, website, address require a second request
                # to the individual place page — see _fetch_place_details()
                "phone": None,
                "email": None,
                "website": None,
                "address": None,
                "latitude": None,
                "longitude": None,
                "review_count": None,
            }

        except Exception as e:
            log.debug(f"Skipping entry due to parse error: {e}")
            continue


def _extract_place_id(url: str) -> str | None:
    """Extract Google Place ID from a maps URL."""
    if not url:
        return None
    # Format: ...place/.../@lat,lng,zoom/data=...0x<hex>...
    m = re.search(r"place_id:([A-Za-z0-9_-]+)", url)
    if m:
        return m.group(1)
    # Alternative: data-cid attribute
    m = re.search(r"data-cid=(\d+)", url)
    if m:
        return f"cid:{m.group(1)}"
    return None
