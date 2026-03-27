"""
outbound/src/db.py
PostgreSQL connection and persistence helpers.
"""

import os
import logging
import psycopg2
from psycopg2.extras import execute_values

log = logging.getLogger(__name__)


def get_connection():
    """Return a live psycopg2 connection using DATABASE_URL."""
    url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(url)
    conn.autocommit = False
    return conn


def start_run(conn, target: str, query: str) -> int:
    """Insert a new scrape_runs row and return its ID."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO scrape_runs (target, query, status)
            VALUES (%s, %s, 'running')
            RETURNING id
            """,
            (target, query),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    log.debug(f"Started run id={run_id} target={target}")
    return run_id


def finish_run(conn, run_id: int, results_found: int, results_new: int, error: str = None):
    """Mark a scrape_runs row as completed or failed."""
    status = "failed" if error else "completed"
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE scrape_runs
            SET finished_at = NOW(),
                results_found = %s,
                results_new = %s,
                status = %s,
                error = %s
            WHERE id = %s
            """,
            (results_found, results_new, status, error, run_id),
        )
    conn.commit()
    log.debug(f"Finished run id={run_id} status={status} found={results_found} new={results_new}")


def upsert_leads(conn, leads: list[dict], source_query: str) -> int:
    """
    Upsert a list of lead dicts into the leads table.
    Uses place_id as the conflict key — skips duplicates.
    Returns the count of net-new rows inserted.
    """
    if not leads:
        return 0

    rows = [
        (
            lead.get("name"),
            lead.get("category"),
            lead.get("phone"),
            lead.get("email"),
            lead.get("website"),
            lead.get("address"),
            lead.get("city"),
            lead.get("region", "Portugal"),
            lead.get("latitude"),
            lead.get("longitude"),
            lead.get("google_maps_url"),
            lead.get("place_id"),
            lead.get("rating"),
            lead.get("review_count"),
            source_query,
        )
        for lead in leads
    ]

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO leads (
                name, category, phone, email, website,
                address, city, region,
                latitude, longitude,
                google_maps_url, place_id,
                rating, review_count,
                source_query
            ) VALUES %s
            ON CONFLICT (place_id) DO NOTHING
            """,
            rows,
        )
        new_count = cur.rowcount

    conn.commit()
    return new_count
