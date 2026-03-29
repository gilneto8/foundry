// ============================================================
// src/lib/receipt.ts
// DocumentReceipt issuer — Next.js server side.
//
// DESIGN:
//   The "cryptographic" stamp in the DocStamper relies on a
//   two-phase write:
//
//   Phase 1 (THIS FILE — runs in a Server Action):
//     Create a DocumentReceipt row with issuedAt = now().
//     This is the legally significant timestamp. It is
//     recorded BEFORE Playwright launches, so it cannot be
//     backdated or forged by the rendering process.
//
//   Phase 2 (worker/src/adapters/stamper.ts — runs in worker):
//     After the PDF renders, update the receipt row with
//     contentHash (SHA-256 of PDF bytes) and storagePath.
//
//   The receiptId is passed through the BullMQ job payload,
//   linking the two phases together.
//
// USAGE (in a Server Action):
//   import { issueReceipt } from "@/lib/receipt";
//   import { enqueue, QUEUES } from "@/lib/queue";
//
//   const receipt = await issueReceipt({
//     userId,
//     documentType: "TACIT_APPROVAL_DECLARATION",
//     entityRef: `${municipalityCode}:${submissionRef}`,
//   });
//
//   await enqueue(QUEUES.STAMPED_PDF, {
//     receiptId: receipt.id,
//     htmlTemplate: renderedHtml,
//     metadata: { ... },
//   });
// ============================================================

import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "receipt" });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IssueReceiptInput {
  userId: string;
  /**
   * Machine-readable document type identifier.
   * Use a screaming-snake constant so it's queryable.
   * e.g. "TACIT_APPROVAL_DECLARATION" | "TECHNICIAN_LIABILITY_SHIELD"
   */
  documentType: string;
  /**
   * Human-readable + queryable external reference.
   * Should uniquely identify the business entity being documented.
   * Convention: "<domain>:<id>", e.g. "1106:LX-2026-00123"
   */
  entityRef: string;
}

export interface ReceiptRecord {
  id: string;
  userId: string;
  documentType: string;
  entityRef: string;
  /** The legally significant timestamp — set at issueReceipt() call time. */
  issuedAt: Date;
  /** null until the worker completes rendering and calls finaliseReceipt(). */
  contentHash: string | null;
  storagePath: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Phase 1 — Issue receipt (call from Server Action BEFORE enqueuing the job)
// ---------------------------------------------------------------------------

/**
 * Creates a DocumentReceipt row in the database with issuedAt = now().
 *
 * Call this BEFORE enqueuing the stamped PDF job. The returned receiptId
 * must be passed in the job payload so the worker can complete Phase 2.
 *
 * @throws if the DB write fails — do not enqueue the job if this throws.
 */
export async function issueReceipt(input: IssueReceiptInput): Promise<ReceiptRecord> {
  const issuedAt = new Date(); // Captured now — this is the legal timestamp

  const receipt = await db.documentReceipt.create({
    data: {
      userId: input.userId,
      documentType: input.documentType,
      entityRef: input.entityRef,
      issuedAt,
      // contentHash and storagePath are null until Phase 2 completes
    },
  });

  log.info(
    {
      event: "receipt.issued",
      receiptId: receipt.id,
      documentType: input.documentType,
      entityRef: input.entityRef,
      issuedAt: issuedAt.toISOString(),
    },
    "Document receipt issued"
  );

  return receipt as ReceiptRecord;
}

// ---------------------------------------------------------------------------
// Phase 2 — Finalise receipt (called from the worker after rendering)
// This is also exported from here so the worker can import it via a
// shared type contract, even though the actual DB write happens in the worker
// using its own Prisma client instance.
// ---------------------------------------------------------------------------

/**
 * Input shape for finalising a receipt after PDF rendering completes.
 * The worker uses this type with its own Prisma client.
 */
export interface FinaliseReceiptInput {
  receiptId: string;
  /** SHA-256 hex digest of the rendered PDF bytes. */
  contentHash: string;
  /** Storage path — local filesystem path or S3 key. */
  storagePath: string;
}

// ---------------------------------------------------------------------------
// Queries — for dashboard display
// ---------------------------------------------------------------------------

/**
 * Fetch all receipts for a user, ordered newest first.
 */
export async function getReceiptsForUser(userId: string): Promise<ReceiptRecord[]> {
  const receipts = await db.documentReceipt.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
  });
  return receipts as ReceiptRecord[];
}

/**
 * Fetch a single receipt by ID, scoped to a user (prevents ID enumeration).
 */
export async function getReceiptById(
  receiptId: string,
  userId: string
): Promise<ReceiptRecord | null> {
  const receipt = await db.documentReceipt.findFirst({
    where: { id: receiptId, userId },
  });
  return receipt as ReceiptRecord | null;
}

/**
 * Returns true if a receipt has been fully stamped (PDF rendered + hash stored).
 */
export function isReceiptComplete(receipt: ReceiptRecord): boolean {
  return receipt.contentHash !== null && receipt.storagePath !== null;
}
