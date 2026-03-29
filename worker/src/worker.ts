// ============================================================
// worker/src/worker.ts
// Foundry Worker — main entry point.
//
// This file is intentionally thin. Each worker type lives in
// its own file under worker/src/workers/. Add a new job type
// by creating a new file there and importing it here.
//
// To add a new worker:
//  1. Create worker/src/workers/my-thing.worker.ts
//     that exports createMyThingWorker(connection)
//  2. Add the queue name to worker/src/queues.ts
//  3. Import and register it below (boot + shutdown)
// ============================================================

import "dotenv/config";
import { logger } from "./logger";
import { getRedisConnection } from "./connection";
import { QUEUES } from "./queues";

// Workers
import { createExampleWorker } from "./workers/example.worker";
import { createPdfWorker, closeBrowser } from "./workers/pdf.worker";
import { createStripeWebhookWorker } from "./workers/stripe-webhook.worker";
import { createEmailWorker } from "./workers/email.worker";
import { createStampedPdfWorker } from "./workers/stamped-pdf.worker";
import { createNotificationWorker } from "./workers/notification.worker";
import { createRegScraperWorker } from "./workers/reg-scraper.worker";

const connection = getRedisConnection();

// Boot all workers
const workers = [
  createExampleWorker(connection),
  createPdfWorker(connection),
  createStripeWebhookWorker(connection),
  createEmailWorker(connection),
  createStampedPdfWorker(connection),
  createNotificationWorker(connection),
  createRegScraperWorker(connection),
];

logger.info(
  { queues: Object.values(QUEUES) },
  "🚀 Foundry Worker started"
);

// ---------------------------------------------------------------------------
// Graceful shutdown — closes all workers cleanly on SIGTERM/SIGINT.
// This gives in-flight jobs time to finish before the container exits.
// ---------------------------------------------------------------------------
async function shutdown() {
  logger.info("Shutting down gracefully...");

  // Close all BullMQ workers (stops picking up new jobs)
  await Promise.all(workers.map((w) => w.close()));

  // Close the Playwright browser if it was used
  await closeBrowser();

  logger.info("Worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);


