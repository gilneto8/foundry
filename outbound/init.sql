-- ============================================================
-- outbound/init.sql
-- Schema for the outbound leads database.
-- Runs automatically on first container start via
-- /docker-entrypoint-initdb.d/.
-- ============================================================

-- Core leads table — one row per business found
CREATE TABLE IF NOT EXISTS leads (
    id              SERIAL PRIMARY KEY,

    -- Business identity
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,           -- real_estate | restaurant | transport
    phone           TEXT,
    email           TEXT,
    website         TEXT,

    -- Location
    address         TEXT,
    city            TEXT,
    region          TEXT DEFAULT 'Portugal',
    latitude        NUMERIC(10, 7),
    longitude       NUMERIC(10, 7),

    -- Google Maps metadata
    google_maps_url TEXT,
    place_id        TEXT UNIQUE,             -- Google Place ID — deduplication key
    rating          NUMERIC(2, 1),
    review_count    INTEGER,

    -- Scraper metadata
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    source_query    TEXT,                    -- The search query that found this lead

    -- Outreach tracking (fill in manually or via a future CRM integration)
    contacted       BOOLEAN DEFAULT FALSE,
    contacted_at    TIMESTAMPTZ,
    notes           TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_leads_category   ON leads (category);
CREATE INDEX IF NOT EXISTS idx_leads_city       ON leads (city);
CREATE INDEX IF NOT EXISTS idx_leads_contacted  ON leads (contacted);
CREATE INDEX IF NOT EXISTS idx_leads_scraped_at ON leads (scraped_at DESC);

-- Scraper run log — one row per execution
CREATE TABLE IF NOT EXISTS scrape_runs (
    id              SERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    target          TEXT NOT NULL,           -- Which category was scraped
    query           TEXT NOT NULL,           -- Exact search string used
    results_found   INTEGER DEFAULT 0,
    results_new     INTEGER DEFAULT 0,       -- Net new (post-dedup)
    status          TEXT DEFAULT 'running',  -- running | completed | failed
    error           TEXT                     -- Error message if status = failed
);

CREATE INDEX IF NOT EXISTS idx_runs_target ON scrape_runs (target);
CREATE INDEX IF NOT EXISTS idx_runs_status ON scrape_runs (status);
