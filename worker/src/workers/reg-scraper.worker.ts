// ============================================================
// worker/src/workers/reg-scraper.worker.ts
// BullMQ worker — Regulatory Document Scraper (RegDocScraper).
//
// JOB TYPES:
//   1. SCRAPE_ONE  — scrape a single ScrapeSubscription by id.
//      Enqueued by: user saving a new subscription (immediate first scan),
//      or manual re-trigger from admin panel.
//
//   2. SCRAPE_ALL  — load ALL active subscriptions from Postgres and
//      run a full batch. Enqueued by: a BullMQ repeatable job (cron).
//      The worker itself registers the repeatable job on startup.
//
// FLOW (per subscription):
//   1. Fetch current page text via scraper adapter
//   2. Compute SHA-256 hash
//   3. Compare with last known hash in ScrapeSubscription.lastHash
//      (stored in the subscription.keywords JSON — using a sidecar field)
//   4. If hash changed AND keywords matched → create ScrapeAlert
//   5. Dispatch NOTIFY job (email + optional SMS) if alert is new
//   6. Store new hash in the DB
//
// CHANGE DETECTION STRATEGY:
//   The last seen content hash is stored on the ScrapeSubscription row
//   in a dedicated `lastHash` + `lastScrapedAt` column pair.
//   Alert = hash changed AND at least one keyword found.
//   Hash changed but no keyword = silent update (logged, not alerted).

// CONCURRENCY:
//   Sequential within SCRAPE_ALL (rate limiter in adapter handles timing).
//   SCRAPE_ONE jobs can run concurrently at 3.
// ============================================================

import { Worker, Queue, type Job, type ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";
import { scrapeBatch, scrapeForKeywords, type ScrapeTarget } from "../adapters/scraper";
import { db } from "../db";
import { logger } from "../logger";
import type { NotificationPayload } from "../adapters/notification";

const log = logger.child({ module: "reg-scraper" });

// ---------------------------------------------------------------------------
// Queue constants
// ---------------------------------------------------------------------------
export const REG_SCRAPER_QUEUE = "reg_scraper" as const;

// Schedule: every 6 hours
const SCRAPE_ALL_CRON = "0 */6 * * *";
const SCRAPE_ALL_JOB_NAME = "scrape_all";

// ---------------------------------------------------------------------------
// Typed job payloads
// ---------------------------------------------------------------------------
export type RegScraperJobData =
  | { type: "SCRAPE_ONE"; subscriptionId: string }
  | { type: "SCRAPE_ALL" };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a JSON keywords string from the DB. Falls back to an empty array
 * if the string is malformed — we never want a parse error to kill a job.
 */
function parseKeywords(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Processes one subscription row: scrape → compare → alert if needed.
 */
async function processSubscription(sub: {
  id: string;
  url: string;
  keywords: string;
  selector: string | null;
  lastHash: string | null;
  userId: string;
}): Promise<void> {
  const keywords = parseKeywords(sub.keywords);
  if (keywords.length === 0) {
    log.warn({ subscriptionId: sub.id }, "Subscription has no keywords — skipping");
    return;
  }

  const target: ScrapeTarget = {
    url: sub.url,
    keywords,
    entityId: sub.id,
    selector: sub.selector ?? undefined,
  };

  const result = await scrapeForKeywords(target);

  // Always update lastScrapedAt, even on failure
  const isNewContent = result.ok && result.contentHash !== sub.lastHash;

  if (!result.ok) {
    log.warn({ subscriptionId: sub.id, error: result.error }, "Scrape failed — skipping update");
    return;
  }

  // Update hash and lastScrapedAt on the subscription row
  await db.scrapeSubscription.update({
    where: { id: sub.id },
    data: {
      lastHash: result.contentHash,
      lastScrapedAt: result.scrapedAt,
    },
  });

  // No content change → done
  if (!isNewContent) {
    log.debug({ subscriptionId: sub.id }, "Content unchanged — no alert");
    return;
  }

  // Content changed but no keyword match → log silently
  if (!result.hasMatch) {
    log.info(
      { subscriptionId: sub.id, url: sub.url },
      "Page content changed but no keyword match"
    );
    return;
  }

  // Content changed + keyword matched → create ScrapeAlert
  const alert = await db.scrapeAlert.create({
    data: {
      subscriptionId: sub.id,
      contentHash: result.contentHash,
      matchedKeywords: JSON.stringify(result.matchedKeywords),
      excerpt: result.excerpt,
      notified: false,
    },
  });

  log.info(
    {
      event: "scrape_alert.created",
      alertId: alert.id,
      subscriptionId: sub.id,
      matchedKeywords: result.matchedKeywords,
    },
    "Scrape alert created"
  );

  // Dispatch notification via NOTIFY queue
  await enqueueAlertNotification(sub.userId, sub.url, result.matchedKeywords, result.excerpt);

  // Mark alert as notified
  await db.scrapeAlert.update({
    where: { id: alert.id },
    data: { notified: true },
  });
}

/**
 * Pushes a notification job to the NOTIFY queue for a detected scrape alert.
 */
let _notifyQueue: Queue<NotificationPayload> | null = null;
function getNotifyQueue(connection: ConnectionOptions): Queue<NotificationPayload> {
  if (_notifyQueue) return _notifyQueue;
  _notifyQueue = new Queue<NotificationPayload>(QUEUES.NOTIFY, { connection });
  return _notifyQueue;
}

async function enqueueAlertNotification(
  userId: string,
  url: string,
  matchedKeywords: string[],
  excerpt: string | null
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user?.email) {
    log.warn({ userId }, "No email on user — cannot dispatch alert notification");
    return;
  }

  const keywordList = matchedKeywords.map((k) => `• ${k}`).join("\n");
  const domain = new URL(url).hostname;

  // Email notification — HTML is minimal but functional
  // The product-level clone will replace this with a proper React Email template
  const html = `
    <h2>Alerta Regulatório Detetado</h2>
    <p>Foram detetadas alterações em <strong>${domain}</strong> que correspondem às suas palavras-chave monitorizadas.</p>
    <h3>Palavras-chave encontradas:</h3>
    <pre>${keywordList}</pre>
    ${excerpt ? `<h3>Excerto relevante:</h3><p><em>${excerpt}</em></p>` : ""}
    <p>URL monitorizada: <a href="${url}">${url}</a></p>
    <hr/>
    <p style="color:#666;font-size:12px;">
      Esta notificação foi enviada automaticamente pelo sistema de monitorização regulatória.
    </p>
  `.trim();

  const notifyQueue = getNotifyQueue({ host: "redis", port: 6379 });
  await notifyQueue.add(QUEUES.NOTIFY, {
    channel: "email",
    to: user.email,
    subject: `Alerta: alteração detetada em ${domain}`,
    html,
  } satisfies NotificationPayload);

  log.info({ userId, email: user.email }, "Alert notification enqueued");
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createRegScraperWorker(connection: ConnectionOptions) {
  const worker = new Worker<RegScraperJobData>(
    REG_SCRAPER_QUEUE,
    async (job: Job<RegScraperJobData>) => {
      if (job.data.type === "SCRAPE_ONE") {
        const { subscriptionId } = job.data;

        log.info({ jobId: job.id, subscriptionId }, "Processing SCRAPE_ONE job");

        const sub = await db.scrapeSubscription.findUnique({
          where: { id: subscriptionId },
          select: {
            id: true, url: true, keywords: true, selector: true,
            lastHash: true, userId: true, active: true,
          },
        });

        if (!sub || !sub.active) {
          log.info({ subscriptionId }, "Subscription not found or inactive — skipping");
          return;
        }

        await processSubscription(sub);

      } else if (job.data.type === "SCRAPE_ALL") {
        log.info({ jobId: job.id }, "Processing SCRAPE_ALL job");

        const subscriptions = await db.scrapeSubscription.findMany({
          where: { active: true },
          select: {
            id: true, url: true, keywords: true, selector: true,
            lastHash: true, userId: true,
          },
        });

        log.info({ count: subscriptions.length }, "Loaded active subscriptions for batch scrape");

        // Sequential — the rate limiter in scraper.ts handles per-domain timing
        for (const sub of subscriptions) {
          try {
            await processSubscription(sub);
          } catch (err) {
            // Don't let one subscription failure abort the whole batch
            log.error({ subscriptionId: sub.id, err }, "Error processing subscription in batch");
          }
        }
      }
    },
    {
      connection,
      concurrency: 3, // SCRAPE_ONE jobs can be concurrent; SCRAPE_ALL is self-throttling
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    }
  );

  // ---------------------------------------------------------------------------
  // Register the SCRAPE_ALL repeatable job
  // ---------------------------------------------------------------------------
  // Run once on worker start so the first scrape doesn't wait 6 hours.
  // The repeatable job fires on the cron schedule thereafter.
  const scraperQueue = new Queue<RegScraperJobData>(REG_SCRAPER_QUEUE, { connection });

  scraperQueue
    .add(
      SCRAPE_ALL_JOB_NAME,
      { type: "SCRAPE_ALL" },
      {
        repeat: { pattern: SCRAPE_ALL_CRON },
        jobId: SCRAPE_ALL_JOB_NAME, // stable ID prevents duplicate registrations on restarts
      }
    )
    .then(() => log.info({ cron: SCRAPE_ALL_CRON }, "SCRAPE_ALL repeatable job registered"))
    .catch((err) => log.error({ err }, "Failed to register SCRAPE_ALL repeatable job"));

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------
  worker.on("completed", (job) =>
    log.info({ jobId: job.id, type: job.data.type }, "RegScraper job completed")
  );

  worker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, type: job?.data.type, err }, "RegScraper job failed")
  );

  worker.on("error", (err) =>
    log.error({ err }, "RegScraper worker error")
  );

  return worker;
}
