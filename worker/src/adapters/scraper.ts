// ============================================================
// worker/src/adapters/scraper.ts
// Regulatory Document Scraper — static HTML fetcher + keyword matcher.
//
// DESIGN:
//   - Uses native Node.js fetch (Node 18+) — no node-fetch dependency.
//   - Uses cheerio for DOM parsing — no headless browser needed.
//     Rule: if a page requires JavaScript to load its content, it is out
//     of scope for this adapter. Use the Playwright adapter instead.
//   - SHA-256 hash per page content — alerts only fire on change.
//   - 1 request per second per domain (rate limiter built-in).
//   - No auth, no cookies, no login sessions — public pages only.
//     (PT law: automated access to non-public government portals is a
//      legal grey area; this adapter intentionally stays in the clear.)
//
// USAGE:
//   import { scrapeForKeywords, scrapeBatch } from "../adapters/scraper";
//
//   const result = await scrapeForKeywords({
//     url: "https://cm-lisboa.pt/municipio/plano-diretor-municipal",
//     keywords: ["uso do solo", "zonamento", "alteração"],
//     entityId: "sub_abc123",
//   });
// ============================================================

import crypto from "crypto";
import { load as cheerioLoad } from "cheerio";
import { logger } from "../logger";

const log = logger.child({ module: "adapter.scraper" });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScrapeTarget {
  /** Fully qualified HTTPS URL to fetch. No login required. */
  url: string;
  /** Lowercase keyword strings to search for in the page text. */
  keywords: string[];
  /**
   * Caller-supplied ID to correlate the result back to the subscription row.
   * Typically the ScrapeSubscription.id.
   */
  entityId: string;
  /**
   * Optional CSS selector to narrow the scrape to a specific page region.
   * If omitted, the full <body> text is used.
   * Examples: "article.content", "#main-content", ".noticia"
   */
  selector?: string;
}

export interface ScrapeResult {
  /** Echoed from ScrapeTarget */
  entityId: string;
  url: string;
  /** SHA-256 hex digest of the extracted text content (normalised). */
  contentHash: string;
  /** Keywords from the target list that were found in the page text. */
  matchedKeywords: string[];
  /** true if matchedKeywords.length > 0 */
  hasMatch: boolean;
  /**
   * Short excerpt of page text surrounding first matched keyword.
   * Null if no match or if extraction failed.
   */
  excerpt: string | null;
  /** true if the fetch and parse succeeded. false means `error` is set. */
  ok: boolean;
  error?: string;
  scrapedAt: Date;
}

// ---------------------------------------------------------------------------
// Per-domain rate limiter
// Enforces a minimum interval between requests to the same hostname.
// Maps hostname → timestamp of last request.
// ---------------------------------------------------------------------------
const _lastRequestTime = new Map<string, number>();
const RATE_LIMIT_MS = 1000; // 1 request per second per domain

async function rateLimitedFetch(url: string): Promise<Response> {
  const { hostname } = new URL(url);
  const lastTime = _lastRequestTime.get(hostname) ?? 0;
  const elapsed = Date.now() - lastTime;

  if (elapsed < RATE_LIMIT_MS) {
    const wait = RATE_LIMIT_MS - elapsed;
    log.debug({ hostname, waitMs: wait }, "Rate limiting — waiting before request");
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  _lastRequestTime.set(hostname, Date.now());

  const response = await fetch(url, {
    headers: {
      // Polite bot header — helps admins identify scraper traffic
      "User-Agent": "FoundryRegDocScraperBot/1.0 (+https://foundry.local/bot)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    },
    // 15 second timeout — static HTML pages should respond well under this
    signal: AbortSignal.timeout(15_000),
  });

  return response;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extracts normalised visible text from an HTML string.
 * Strips script, style, and noscript elements before extracting.
 */
function extractText(html: string, selector?: string): string {
  const $ = cheerioLoad(html);

  // Remove non-visible elements
  $("script, style, noscript, head, meta, link").remove();

  const root = selector ? $(selector) : $("body");

  // Collapse whitespace and normalise to lowercase for matching
  return root.text().replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Finds an excerpt of ~200 characters around the first matched keyword.
 */
function buildExcerpt(text: string, keyword: string): string {
  const idx = text.indexOf(keyword);
  if (idx === -1) return "";

  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + keyword.length + 120);
  const excerpt = text.slice(start, end).trim();

  return (start > 0 ? "…" : "") + excerpt + (end < text.length ? "…" : "");
}

/**
 * Computes a SHA-256 hex digest of the given text.
 */
function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Fetches a single URL and checks for keyword matches in the page text.
 * Returns a ScrapeResult regardless of outcome — never throws.
 */
export async function scrapeForKeywords(target: ScrapeTarget): Promise<ScrapeResult> {
  const { url, keywords, entityId, selector } = target;
  const scrapedAt = new Date();

  log.debug({ entityId, url }, "Scraping URL");

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      const error = `HTTP ${response.status} ${response.statusText}`;
      log.warn({ entityId, url, status: response.status }, "Scrape HTTP error");
      return {
        entityId, url,
        contentHash: "",
        matchedKeywords: [],
        hasMatch: false,
        excerpt: null,
        ok: false,
        error,
        scrapedAt,
      };
    }

    const html = await response.text();
    const text = extractText(html, selector);
    const contentHash = hashContent(text);

    // Check each keyword (already lowercased in extractText output)
    const matchedKeywords = keywords
      .map((k) => k.toLowerCase())
      .filter((k) => text.includes(k));

    const hasMatch = matchedKeywords.length > 0;
    const excerpt = hasMatch ? buildExcerpt(text, matchedKeywords[0]) : null;

    log.info(
      {
        event: "scraper.result",
        entityId,
        url,
        hasMatch,
        matchedKeywords,
        contentHash: contentHash.slice(0, 12) + "…",
      },
      hasMatch ? "Keyword match detected" : "No match"
    );

    return {
      entityId, url, contentHash, matchedKeywords, hasMatch, excerpt, ok: true, scrapedAt,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ entityId, url, err }, "Scrape failed");
    return {
      entityId, url,
      contentHash: "",
      matchedKeywords: [],
      hasMatch: false,
      excerpt: null,
      ok: false,
      error,
      scrapedAt,
    };
  }
}

/**
 * Scrapes a batch of targets sequentially (not parallel).
 * The per-domain rate limiter handles timing automatically.
 *
 * For the AL Zoning Monitor: pass all active ScrapeSubscriptions here.
 * The worker loops over DB records and builds the targets array.
 */
export async function scrapeBatch(targets: ScrapeTarget[]): Promise<ScrapeResult[]> {
  log.info({ count: targets.length }, "Starting scrape batch");
  const results: ScrapeResult[] = [];

  for (const target of targets) {
    const result = await scrapeForKeywords(target);
    results.push(result);
  }

  const hits = results.filter((r) => r.hasMatch).length;
  const errors = results.filter((r) => !r.ok).length;

  log.info(
    { event: "scraper.batch_complete", total: results.length, hits, errors },
    "Scrape batch complete"
  );

  return results;
}
