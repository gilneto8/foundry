// ============================================================
// worker/src/worker.ts
// BullMQ Worker — background job processor for the Foundry.
//
// To add a new job type:
//  1. Add the queue name to worker/src/queues.ts
//  2. Add a new Worker instance below, pointing at that queue
//  3. Add the corresponding Queue + enqueue helper in src/lib/queue.ts
// ============================================================

import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { QUEUES } from "./queues";

const connection = getRedisConnection();

// ------------------------------------------------------------------
// Example Worker
// Replace "example" logic with real domain processing.
// ------------------------------------------------------------------
const exampleWorker = new Worker(
  QUEUES.EXAMPLE,
  async (job: Job) => {
    console.log(`[worker] Processing job ${job.id} from queue "${QUEUES.EXAMPLE}"`);
    console.log(`[worker] Payload:`, job.data);

    // Simulate async work (replace with real logic: PDF gen, email, etc.)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`[worker] Job ${job.id} completed.`);
    return { success: true };
  },
  {
    connection,
    concurrency: 5, // Max 5 concurrent jobs — tune per VPS RAM budget
  }
);

exampleWorker.on("completed", (job) => {
  console.log(`[worker] ✓ ${job.id} completed`);
});

exampleWorker.on("failed", (job, err) => {
  console.error(`[worker] ✗ ${job?.id} failed:`, err.message);
});

console.log(
  `[worker] 🚀 Foundry Worker started. Listening on queues: ${Object.values(QUEUES).join(", ")}`
);

// Graceful shutdown
async function shutdown() {
  console.log("[worker] Shutting down gracefully...");
  await exampleWorker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
