// ============================================================
// worker/src/workers/notification.worker.ts
// BullMQ worker — multi-channel notification dispatch.
//
// RESPONSIBILITIES:
//   - Processes jobs from the NOTIFY queue
//   - Routes to the correct channel adapter (email / sms / ...)
//   - Retries with backoff on transient failures (network, SMTP, Vonage)
//   - Dead-letters exhausted notifications with full context preserved
//
// WHAT THIS IS NOT:
//   - This is NOT for transactional emails (welcome, password reset,
//     Stripe receipts). Those stay on EMAIL_SEND via email.worker.ts.
//   - This is for ALERT-type messages triggered by business events:
//       • "Deadline warning: 10 business days remaining"
//       • "Tacit approval eligible as of <date>"
//       • "Regulatory document updated: <municipality>"
//
// CONCURRENCY:
//   5 concurrent notification jobs — safe since there's no shared resource
//   (each send is an independent HTTP/SMTP call). SMS is fire-and-forget;
//   email may share the SMTP connection pool but Nodemailer handles that.
// ============================================================

import { Worker, Queue, type Job, type ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";
import { dispatchNotification, type NotificationPayload } from "../adapters/notification";
import { logger } from "../logger";

const log = logger.child({ module: "notification-worker" });

// Dead-letter queue for exhausted notifications
let _dlq: Queue | null = null;
function getDlq(connection: ConnectionOptions): Queue {
  if (_dlq) return _dlq;
  _dlq = new Queue(`${QUEUES.NOTIFY}_dlq`, { connection });
  return _dlq;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createNotificationWorker(connection: ConnectionOptions) {
  const worker = new Worker<NotificationPayload>(
    QUEUES.NOTIFY,
    async (job: Job<NotificationPayload>) => {
      log.info(
        {
          jobId: job.id,
          channel: job.data.channel,
          attempt: job.attemptsMade + 1,
        },
        "Processing notification job"
      );

      await dispatchNotification(job.data);
    },
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 0 },
    }
  );

  worker.on("completed", (job) => {
    log.info(
      { event: "notification.delivered", jobId: job.id, channel: job.data.channel },
      "Notification delivered"
    );
  });

  worker.on("failed", (job, err) => {
    if (!job) return;

    const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);

    log.error(
      {
        event: "notification.failed",
        jobId: job.id,
        channel: job.data.channel,
        attemptsMade: job.attemptsMade,
        exhausted: isExhausted,
        err,
      },
      isExhausted ? "Notification exhausted — moving to DLQ" : "Notification failed — will retry"
    );

    if (isExhausted) {
      getDlq(connection)
        .add(
          `${QUEUES.NOTIFY}_dlq`,
          {
            ...job.data,
            _dlq: {
              originalJobId: job.id,
              failedReason: job.failedReason,
              exhaustedAt: new Date().toISOString(),
            },
          },
          { attempts: 1, removeOnComplete: { count: 0 }, removeOnFail: { count: 0 } }
        )
        .catch((dlqErr) =>
          log.error({ dlqErr, originalJobId: job.id }, "Failed to write to notification DLQ")
        );
    }
  });

  worker.on("error", (err) => {
    log.error({ event: "notification.worker_error", err }, "Notification worker error");
  });

  return worker;
}
