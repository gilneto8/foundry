"""
outbound/src/main.py
Entrypoint for the outbound scraper.
Reads TARGETS env var, runs each scraper, persists results to PostgreSQL.
"""

import os
import logging
from db import get_connection
from scraper import scrape_category

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"outbound-scraper","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger(__name__)


def main():
    targets_raw = os.getenv("TARGETS", "real_estate,restaurants,transport")
    targets = [t.strip() for t in targets_raw.split(",") if t.strip()]
    region = os.getenv("REGION", "Portugal")
    max_results = int(os.getenv("MAX_RESULTS", "100"))
    delay = float(os.getenv("REQUEST_DELAY", "3"))

    log.info(f"Starting scrape run — targets={targets} region={region} max={max_results}")

    conn = get_connection()
    try:
        for target in targets:
            log.info(f"Scraping category={target}")
            try:
                scrape_category(
                    conn=conn,
                    category=target,
                    region=region,
                    max_results=max_results,
                    delay=delay,
                )
            except Exception as e:
                log.error(f"category={target} failed: {e}", exc_info=True)
    finally:
        conn.close()

    log.info("Scrape run complete")


if __name__ == "__main__":
    main()
