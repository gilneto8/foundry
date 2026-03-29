// ============================================================
// worker/src/queues.ts
// Shared queue name registry — single source of truth.
// Import this in both the Next.js app (lib/queue.ts)
// and the worker to avoid typo-based bugs.
// ============================================================

export const QUEUES = {
  /** Generic example queue — replace with your domain names */
  EXAMPLE: "example",
  /** PDF generation via headless Chromium — plugged into the Playwright adapter */
  PDF_GENERATE: "pdf_generate",
  /** Stripe webhook events — signature-verified by the route handler, processed here */
  STRIPE_WEBHOOK: "stripe_webhook",
  /** Transactional & marketing emails — pre-rendered HTML sent via Nodemailer/SMTP */
  EMAIL_SEND: "email_send",
  /** Dead-letter queue — exhausted email jobs land here after all retry attempts fail */
  EMAIL_DLQ: "email_dlq",
  /** Stamped PDF — HTML string rendered via Playwright with a DB-backed timestamp receipt */
  STAMPED_PDF: "stamped_pdf",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
