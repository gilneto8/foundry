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
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
