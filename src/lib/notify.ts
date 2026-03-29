// ============================================================
// src/lib/notify.ts
// Unified notification enqueue interface — Next.js server side.
//
// USAGE:
//   import { notify } from "@/lib/notify";
//
//   // Send an email alert
//   await notify({
//     channel: "email",
//     to: "user@example.com",
//     subject: "Alerta: Prazo de deferimento tácito em 10 dias úteis",
//     html: renderedHtml,
//   });
//
//   // Send an SMS alert
//   await notify({
//     channel: "sms",
//     to: "+351912345678",
//     body: "AlertaAT: O seu prazo de deferimento tácito expira em 10 dias úteis.",
//   });
//
//   // Send to multiple channels at once
//   await notify([
//     { channel: "email", to: user.email, subject: "...", html: "..." },
//     { channel: "sms",   to: user.phone, body: "..." },
//   ]);
//
// DESIGN:
//   - Accepts a single payload or an array (multi-channel at once).
//   - Each payload becomes an independent BullMQ job — they succeed/fail
//     and retry independently.
//   - Retry: 5 attempts with exponential backoff (default). Override per-call.
//   - NOT for transactional email (Stripe, auth) — use enqueueEmail() from
//     src/lib/email.ts instead. This is for event-driven business alerts.
// ============================================================

import "server-only";
import { Queue } from "bullmq";
import { QUEUES } from "@/lib/queue";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "notify" });

// ---------------------------------------------------------------------------
// Payload types — re-exported so callers don't need two imports
// ---------------------------------------------------------------------------

export interface EmailNotificationPayload {
  channel: "email";
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

export interface SmsNotificationPayload {
  channel: "sms";
  /** E.164 format: +351912345678 */
  to: string;
  /** Plain text only. Max 160 chars per SMS segment. */
  body: string;
}

export type NotifyPayload = EmailNotificationPayload | SmsNotificationPayload;

// ---------------------------------------------------------------------------
// BullMQ queue — lazily instantiated (SSR/edge safe)
// ---------------------------------------------------------------------------
let _notifyQueue: Queue | null = null;

function getNotifyQueue(): Queue {
  if (_notifyQueue) return _notifyQueue;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("[notify] REDIS_URL is not set.");

  const parsed = new URL(url);
  _notifyQueue = new Queue(QUEUES.NOTIFY, {
    connection: {
      host: parsed.hostname,
      port: parseInt(parsed.port || "6379", 10),
      password: parsed.password || undefined,
    },
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 0 },
    },
  });

  return _notifyQueue;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueues one or more notifications for async delivery via BullMQ.
 * Each channel gets its own independent job.
 */
export async function notify(
  payload: NotifyPayload | NotifyPayload[]
): Promise<void> {
  const queue = getNotifyQueue();
  const payloads = Array.isArray(payload) ? payload : [payload];

  await Promise.all(
    payloads.map((p) =>
      queue
        .add(QUEUES.NOTIFY, p, {
          jobId: undefined, // Let BullMQ generate unique IDs
        })
        .then(() => {
          log.info(
            { event: "notify.enqueued", channel: p.channel },
            "Notification enqueued"
          );
        })
    )
  );
}

/**
 * Enqueues a single email notification. Syntactic sugar over notify().
 */
export function notifyEmail(payload: Omit<EmailNotificationPayload, "channel">): Promise<void> {
  return notify({ ...payload, channel: "email" });
}

/**
 * Enqueues a single SMS notification. Syntactic sugar over notify().
 */
export function notifySms(payload: Omit<SmsNotificationPayload, "channel">): Promise<void> {
  return notify({ ...payload, channel: "sms" });
}
