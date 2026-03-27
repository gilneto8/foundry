# Outbound Engine

Isolated lead generation stack. Scrapes Portuguese Google Maps directories for real estate agencies, restaurants, and transport fleets, and persists deduplicated results to its own PostgreSQL database.

**Completely separate from the main Foundry app** — own Docker network, own Postgres, no shared code or volumes.

---

## Stack

| Component | Technology |
|---|---|
| Scraper | Python 3.12 (Alpine) |
| Storage | PostgreSQL 16 (dedicated instance) |
| Scheduling | Alpine `crond` (inside the container) |
| Orchestration | Docker Compose (standalone) |

---

## Quick Start

```bash
# 1. Copy env file and fill in a strong DB password
cp .env.example .env

# 2. Run the scraper once (for testing — exits after a single run)
RUN_MODE=once docker compose run --rm scraper

# 3. Check what was scraped
docker compose exec db psql -U outbound -d outbound -c "SELECT count(*), category FROM leads GROUP BY category;"

# 4. Start the full stack in scheduled mode (cron, daily at 03:00)
docker compose up -d
```

---

## Configuration

All settings live in `.env` (copy from `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `OUTBOUND_DB_USER` | `outbound` | PostgreSQL user |
| `OUTBOUND_DB_PASSWORD` | — | **Change this in production** |
| `OUTBOUND_DB_NAME` | `outbound` | Database name |
| `RUN_MODE` | `cron` | `cron` = scheduled daily, `once` = single run and exit |
| `TARGETS` | `real_estate,restaurants,transport` | Comma-separated categories to scrape |
| `REGION` | `Portugal` | Geographic scope |
| `MAX_RESULTS` | `100` | Max leads per city per category |
| `REQUEST_DELAY` | `3` | Seconds between requests (be polite) |
| `CRON_SCHEDULE` | `0 3 * * *` | Cron expression — default is daily at 03:00 |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

---

## Run Modes

### One-off run (development / first test)

```bash
RUN_MODE=once docker compose run --rm scraper
```

This builds the image if needed, runs the scraper against all configured `TARGETS`, and exits. Useful to verify your setup before switching to scheduled mode.

### Scheduled mode (production)

```bash
docker compose up -d
docker compose logs -f scraper   # follow logs
```

Runs `crond` inside the container. Cron output goes to stdout → Docker json-file driver → your existing Promtail pipeline picks it up automatically as `{app="outbound_scraper"}`.

---

## Querying the Data

The Postgres instance is exposed on `127.0.0.1:4901` for host-side access:

```bash
# Connect from the host
psql -h 127.0.0.1 -p 4901 -U outbound -d outbound

# Or via Docker
docker compose exec db psql -U outbound -d outbound
```

**Common queries:**

```sql
-- Total leads by category
SELECT category, count(*) FROM leads GROUP BY category ORDER BY count DESC;

-- Uncontacted leads in Lisbon with a website
SELECT name, phone, website, address
FROM leads
WHERE city = 'Lisboa'
  AND contacted = FALSE
  AND website IS NOT NULL
ORDER BY rating DESC NULLS LAST
LIMIT 50;

-- Mark a lead as contacted
UPDATE leads SET contacted = TRUE, contacted_at = NOW() WHERE id = 42;

-- Scrape run history
SELECT target, query, results_found, results_new, status, started_at
FROM scrape_runs
ORDER BY started_at DESC
LIMIT 20;

-- Today's new leads
SELECT * FROM leads WHERE scraped_at > NOW() - INTERVAL '24 hours';
```

---

## Adding a New Category

1. **Add the search query** to `CATEGORY_QUERIES` in `src/scraper.py`:

    ```python
    CATEGORY_QUERIES = {
        "real_estate":  "agências imobiliárias em {city} Portugal",
        "restaurants":  "restaurantes em {city} Portugal",
        "transport":    "empresas de transporte em {city} Portugal",
        "pharmacies":   "farmácias em {city} Portugal",   # ← new
    }
    ```

2. **Add it to `TARGETS`** in your `.env`:

    ```bash
    TARGETS=real_estate,restaurants,transport,pharmacies
    ```

That's it. The schema, upsert, and run logging are category-agnostic.

---

## Adding or Removing Cities

Edit `PT_CITIES` in `src/scraper.py`. The list is a simple Python array — add, remove, or reorder as needed. The scraper processes them top-to-bottom on each run.

---

## Upgrading the Scraping Method

The default approach (plain HTTP + BeautifulSoup) is a starting point. Google Maps renders most data via JavaScript, so yields from static HTML are limited. When you need more volume or richer data, upgrade in this order:

| Option | Cost | Quality | Notes |
|---|---|---|---|
| **Current** (static HTML) | Free | Low | Good for prototyping and small volumes |
| **Playwright** (headless browser) | Free | High | See `worker/src/adapters/playwright.ts` for the pattern. Add `playwright` to `requirements.txt` and inject `withPage()` into `_scrape_query()`. |
| **SerpAPI** `/maps` endpoint | ~$50/5k queries | High | Zero maintenance — API handles rendering. Drop-in replacement for the `requests.get()` call. |
| **Google Places API** (official) | ~$0.017/request | Very high | Structured data, no parsing needed. Requires a GCP billing account. |

---

## File Structure

```
outbound/
  docker-compose.yml      Standalone compose — own Postgres, own network
  Dockerfile              python:3.12-alpine
  entrypoint.sh           Routes RUN_MODE=once vs cron
  requirements.txt        Python dependencies
  .env.example            Environment template — copy to .env
  init.sql                DB schema (leads + scrape_runs) — runs on first start
  src/
    main.py               Entry — reads env, loops over targets
    db.py                 Connection, upsert (ON CONFLICT DO NOTHING), run log
    scraper.py            City sweep, search queries, HTML parsing
```

---

## Teardown

To wipe this stack cleanly (stops containers, removes images, keeps the data volume unless you explicitly remove it):

```bash
docker compose down

# To also delete all scraped data:
docker compose down -v   # removes the outbound_postgres_data volume
```

For a full VPS teardown including a DB snapshot, use the main repo's kill switch:

```bash
# From the repo root
./scripts/teardown.sh outbound_scraper outbound outbound 4901
```
