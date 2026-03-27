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
import { logger } from "../logger";

const log = logger.child({ module: "example" });

export function createExampleWorker(connection: ConnectionOptions) {
  const worker = new Worker(
    QUEUES.EXAMPLE,
    async (job: Job) => {
      log.info({ jobId: job.id }, "Processing job");

      // Simulate async work — replace with real logic
      await new Promise((resolve) => setTimeout(resolve, 500));

      return { success: true };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => log.info({ jobId: job.id }, "Job completed"));
  worker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, err }, "Job failed")
  );

  return worker;
}
