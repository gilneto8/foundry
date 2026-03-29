// ============================================================
// worker/src/workers/stamped-pdf.worker.ts
// BullMQ worker — processes STAMPED_PDF queue jobs.
//
// JOB PAYLOAD (StampedPdfJobData):
//   receiptId    - The DocumentReceipt.id from Phase 1 (src/lib/receipt.ts).
//                  Used to finalise the receipt after rendering.
//   htmlContent  - Fully rendered HTML string to be converted to PDF.
//   metadata     - Document metadata — echoed into the PDF audit footer.
//   options      - Optional PDF rendering overrides (format, margins).
//
// FLOW:
//   1. App Server Action calls issueReceipt() → gets receiptId
//   2. App enqueues this job with receiptId + htmlContent
//   3. This worker renders the PDF via stamper.ts
//   4. Updates DocumentReceipt with contentHash + storagePath (Phase 2)
//   5. Returns the storagePath for downstream use (e.g. email delivery)
//
// CONCURRENCY:
//   Shares the Playwright browser with pdf.worker.ts.
//   Capped at concurrency: 1 (same reasoning as PDF worker — Chromium RAM).
// ============================================================

import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";
import { generateStampedDocument, type StampedDocumentMetadata } from "../adapters/stamper";
import { db } from "../db";
import { logger } from "../logger";

const log = logger.child({ module: "stamped-pdf" });

// ---------------------------------------------------------------------------
// Typed job payload
// ---------------------------------------------------------------------------
export interface StampedPdfJobData {
  /** DocumentReceipt.id — created by src/lib/receipt.ts before this job was enqueued. */
  receiptId: string;
  /** Fully rendered HTML string. Template rendering happens in the Server Action. */
  htmlContent: string;
  /** Document metadata — used for the audit footer and logging. */
  metadata: {
    documentType: string;
    entityRef: string;
    /** ISO string — will be parsed back to Date inside the processor. */
    issuedAt: string;
    issuedBy: string;
  };
  options?: {
    format?: "A4" | "Letter" | "A3";
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
  };
}

// ---------------------------------------------------------------------------
// Typed job result
// ---------------------------------------------------------------------------
export interface StampedPdfJobResult {
  receiptId: string;
  contentHash: string;
  storagePath: string;
  bytes: number;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createStampedPdfWorker(connection: ConnectionOptions) {
  const worker = new Worker<StampedPdfJobData, StampedPdfJobResult>(
    QUEUES.STAMPED_PDF,
    async (job: Job<StampedPdfJobData, StampedPdfJobResult>) => {
      const { receiptId, htmlContent, metadata, options } = job.data;

      log.info(
        {
          jobId: job.id,
          receiptId,
          documentType: metadata.documentType,
          entityRef: metadata.entityRef,
        },
        "Processing stamped PDF job"
      );

      // Reconstruct the Date from the ISO string in the job payload
      const stampedMetadata: StampedDocumentMetadata = {
        ...metadata,
        issuedAt: new Date(metadata.issuedAt),
      };

      // Phase 2a: Render the PDF + compute hash
      const result = await generateStampedDocument({
        htmlContent,
        metadata: stampedMetadata,
        options,
      });

      // Phase 2b: Finalise the DocumentReceipt with the hash + storage path
      await db.documentReceipt.update({
        where: { id: receiptId },
        data: {
          contentHash: result.contentHash,
          storagePath: result.storagePath,
        },
      });

      log.info(
        {
          event: "stamped_pdf.finalised",
          jobId: job.id,
          receiptId,
          contentHash: result.contentHash,
          storagePath: result.storagePath,
          bytes: result.pdfBuffer.byteLength,
        },
        "DocumentReceipt finalised"
      );

      return {
        receiptId,
        contentHash: result.contentHash,
        storagePath: result.storagePath,
        bytes: result.pdfBuffer.byteLength,
      };
    },
    {
      connection,
      // Same concurrency limit as pdf.worker.ts — Chromium RAM constraint
      concurrency: 1,
      limiter: {
        max: 5,
        duration: 10_000,
      },
    }
  );

  worker.on("completed", (job, result) =>
    log.info(
      {
        jobId: job.id,
        receiptId: result.receiptId,
        bytes: result.bytes,
      },
      "Stamped PDF job completed"
    )
  );

  worker.on("failed", async (job, err) => {
    log.error(
      { jobId: job?.id, receiptId: job?.data?.receiptId, err },
      "Stamped PDF job failed"
    );

    // If the job fails at Phase 2b (after rendering), the DocumentReceipt
    // remains incomplete (contentHash = null). This is intentional —
    // the receipt row serves as evidence that a generation was attempted.
    // The job will be retried from scratch on the next attempt.
  });

  return worker;
}
