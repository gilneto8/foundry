// ============================================================
// worker/src/workers/example.worker.ts
//
// Example BullMQ worker — replace with your domain logic.
// This is a no-op placeholder to illustrate the pattern.
// Safe to delete once you have real queues.
// ============================================================

import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";

export function createExampleWorker(connection: ConnectionOptions) {
  const worker = new Worker(
    QUEUES.EXAMPLE,
    async (job: Job) => {
      console.log(`[example] Processing job ${job.id}`);
      console.log(`[example] Payload:`, job.data);

      // Simulate async work — replace with real logic
      await new Promise((resolve) => setTimeout(resolve, 500));

      return { success: true };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => console.log(`[example] ✓ ${job.id}`));
  worker.on("failed", (job, err) =>
    console.error(`[example] ✗ ${job?.id} — ${err.message}`)
  );

  return worker;
}
