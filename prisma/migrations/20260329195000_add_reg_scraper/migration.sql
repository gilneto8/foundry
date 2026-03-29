-- ============================================================
-- Migration: add_reg_scraper
-- Adds the scrape_subscriptions and scrape_alerts tables
-- for the RegDocScraper module.
--
-- scrape_subscriptions: one row per URL being monitored.
--   keywords: JSON array of strings stored as TEXT.
--   lastHash: SHA-256 of the previous scrape — change detection.
--
-- scrape_alerts: one row per detected change + keyword hit.
--   One subscription can produce many alerts over time.
-- ============================================================

CREATE TABLE "scrape_subscriptions" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "url"           TEXT NOT NULL,
    "keywords"      TEXT NOT NULL,
    "selector"      TEXT,
    "label"         TEXT,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "lastHash"      TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scrape_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scrape_subscriptions_userId_idx" ON "scrape_subscriptions"("userId");
CREATE INDEX "scrape_subscriptions_active_idx" ON "scrape_subscriptions"("active");

ALTER TABLE "scrape_subscriptions"
    ADD CONSTRAINT "scrape_subscriptions_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------

CREATE TABLE "scrape_alerts" (
    "id"              TEXT NOT NULL,
    "subscriptionId"  TEXT NOT NULL,
    "contentHash"     TEXT NOT NULL,
    "matchedKeywords" TEXT NOT NULL,
    "excerpt"         TEXT,
    "notified"        BOOLEAN NOT NULL DEFAULT false,
    "detectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scrape_alerts_subscriptionId_idx" ON "scrape_alerts"("subscriptionId");
CREATE INDEX "scrape_alerts_detectedAt_idx" ON "scrape_alerts"("detectedAt");

ALTER TABLE "scrape_alerts"
    ADD CONSTRAINT "scrape_alerts_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId")
    REFERENCES "scrape_subscriptions"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
