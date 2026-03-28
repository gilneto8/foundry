// ============================================================
// worker/src/workers/email.worker.ts
// BullMQ worker — SMTP email delivery.
//
// DESIGN:
//   - Receives a pre-rendered EmailPayload from the Next.js app.
//   - HTML is already a string; no React dependency required here.
//   - 5 retry attempts with exponential backoff (2s, 4s, 8s, 16s, 32s).
//   - On full exhaustion the job is moved to EMAIL_DLQ for manual review.
//   - Concurrency is kept low (2) since SMTP connections are stateful.
//
// DLQ ACCESS:
//   - Use Bull Board at /admin/queues to inspect, retry, or discard.
//   - Or use the Redis CLI: ZRANGE bull:email_dlq:failed 0 -1 WITHSCORES
//   - Or run: npx tsx scripts/retry-dlq-emails.ts
// ============================================================

import { Worker, Queue, type Job, type ConnectionOptions } from "bullmq";
import nodemailer, { type Transporter } from "nodemailer";
import { QUEUES } from "../queues";
import { logger } from "../logger";

const log = logger.child({ module: "email-worker" });

// ---------------------------------------------------------------------------
// EmailPayload — must mirror src/lib/email.ts in the Next.js app
// ---------------------------------------------------------------------------
export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

// ---------------------------------------------------------------------------
// Nodemailer transporter — shared across all jobs in this worker process
// ---------------------------------------------------------------------------
let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "[email-worker] Missing SMTP config. Set SMTP_HOST, SMTP_USER, SMTP_PASS in your environment."
    );
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

function getFrom(override?: string): string {
  const from = override ?? process.env.SMTP_FROM;
  if (!from) {
    throw new Error(
      "[email-worker] No sender address. Set SMTP_FROM or pass `from` in the payload."
    );
  }
  return from;
}

// ---------------------------------------------------------------------------
// DLQ Queue reference — used to move exhausted jobs here manually if needed.
// BullMQ's worker `removeOnFail: false` keeps failed jobs in email_send;
// we also actively enqueue a copy in email_dlq from the `failed` event
// so operators have a clean, dedicated view in Bull Board.
// ---------------------------------------------------------------------------
let _dlq: Queue | null = null;

function getDlq(connection: ConnectionOptions): Queue {
  if (_dlq) return _dlq;
  _dlq = new Queue(QUEUES.EMAIL_DLQ, { connection });
  return _dlq;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createEmailWorker(connection: ConnectionOptions) {
  const worker = new Worker<EmailPayload>(
    QUEUES.EMAIL_SEND,
    async (job: Job<EmailPayload>) => {
      const { to, subject, html, text, replyTo, from: fromOverride } = job.data;
      const transporter = getTransporter();
      const from = getFrom(fromOverride);

      log.info(
        { jobId: job.id, subject, attemptsMade: job.attemptsMade },
        "Processing email job"
      );

      await transporter.sendMail({
        from,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
        text,
        replyTo,
      });
    },
    {
      connection,
      concurrency: 2,
      // Keep last 100 completed jobs visible in Bull Board
      removeOnComplete: { count: 100 },
      // Do NOT auto-remove failed jobs — they must be reviewed in the DLQ
      // BullMQ accepts { count: 0 } to mean "keep all failed jobs"
      removeOnFail: { count: 0 },
    }
  );

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------
  worker.on("completed", (job) => {
    log.info(
      { event: "email.delivered", jobId: job.id, subject: job.data.subject },
      "Email delivered successfully"
    );
  });

  worker.on("failed", (job, err) => {
    if (!job) return;

    const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);

    log.error(
      {
        event: "email.failed",
        jobId: job.id,
        subject: job.data.subject,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        exhausted: isExhausted,
        err,
      },
      isExhausted ? "Email job exhausted — moving to DLQ" : "Email job failed — will retry"
    );

    // On full exhaustion: copy the job payload into the DLQ queue.
    // This gives Bull Board a clean, dedicated view of dead emails.
    if (isExhausted) {
      const dlq = getDlq(connection);
      dlq
        .add(
          QUEUES.EMAIL_DLQ,
          {
            ...job.data,
            _dlq: {
              originalJobId: job.id,
              failedReason: job.failedReason,
              exhaustedAt: new Date().toISOString(),
            },
          },
          {
            // DLQ jobs do not retry automatically — operator must retry manually.
            attempts: 1,
            removeOnComplete: { count: 0 },
            removeOnFail: { count: 0 },
          }
        )
        .catch((dlqErr) => {
          log.error({ dlqErr, originalJobId: job.id }, "Failed to write to email DLQ");
        });
    }
  });

  worker.on("error", (err) => {
    log.error({ event: "email.worker_error", err }, "Email worker encountered an error");
  });

  return worker;
}
