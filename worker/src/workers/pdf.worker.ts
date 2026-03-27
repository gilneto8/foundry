// ============================================================
// worker/src/workers/pdf.worker.ts
//
// PDF generation worker — powered by the Playwright adapter.
//
// JOB PAYLOAD (PdfJobData):
//   url      - The URL to render to PDF (must be reachable from the container)
//   options  - Optional PDF rendering options (format, margins, etc.)
//   metadata - Optional caller-defined metadata passed through to the result
//
// JOB RESULT (PdfJobResult):
//   pdf      - The raw PDF as a base64-encoded string
//   size     - File size in bytes
//   metadata - Echoed back from the job payload
//
// CONCURRENCY:
//   Capped at 1 by default. Chromium instances are memory-heavy (~150-300MB
//   per browser context). On a 16GB VPS with multiple apps, this is the
//   safe default. Increase only after benchmarking your specific workload.
//
// TO REMOVE (if your product doesn't need PDFs):
//   1. Delete this file
//   2. Remove PDF_GENERATE from worker/src/queues.ts
//   3. Remove the Playwright adapter import and installation
//   4. Switch the Dockerfile back to Alpine (remove Chromium deps)
// ============================================================

import { Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { QUEUES } from "../queues";
import { generatePdf, closeBrowser, type PdfOptions } from "../adapters/playwright";

// ---------------------------------------------------------------------------
// Typed job payload — what callers must provide when enqueuing
// ---------------------------------------------------------------------------
export interface PdfJobData {
  /** Fully qualified URL to render. Must be reachable from within the worker container. */
  url: string;
  /** Playwright PDF options (format, margins, etc.) */
  options?: PdfOptions;
  /** Pass-through metadata — returned in the result for caller correlation */
  metadata?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Typed job result — what the worker returns on success
// ---------------------------------------------------------------------------
export interface PdfJobResult {
  /** Raw PDF encoded as base64 — store or stream as needed */
  pdf: string;
  /** File size in bytes */
  size: number;
  /** Echoed from job payload */
  metadata?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createPdfWorker(connection: ConnectionOptions) {
  const worker = new Worker<PdfJobData, PdfJobResult>(
    QUEUES.PDF_GENERATE,
    async (job: Job<PdfJobData, PdfJobResult>) => {
      const { url, options, metadata } = job.data;

      console.log(`[pdf] Job ${job.id} — rendering: ${url}`);

      // Plug in the adapter — pure function, zero BullMQ knowledge
      const pdfBuffer = await generatePdf(url, options);

      console.log(`[pdf] Job ${job.id} — done (${pdfBuffer.byteLength} bytes)`);

      return {
        pdf: pdfBuffer.toString("base64"),
        size: pdfBuffer.byteLength,
        metadata,
      };
    },
    {
      connection,
      // ⚠️ Task 2.2.3: Strict concurrency limit.
      // Chromium is expensive: ~150-300MB RAM per context on load.
      // On a 16GB VPS running multiple services, 1 concurrent PDF job is the
      // safe default. Increase with caution and benchmark first.
      concurrency: 1,
      // Limit total running jobs in this queue to prevent OOM
      limiter: {
        max: 5,       // Max 5 jobs processed per duration window
        duration: 10_000, // 10 seconds
      },
    }
  );

  worker.on("completed", (job, result) =>
    console.log(`[pdf] ✓ ${job.id} — ${result.size} bytes`)
  );

  worker.on("failed", (job, err) =>
    console.error(`[pdf] ✗ ${job?.id} — ${err.message}`)
  );

  return worker;
}

// Export the closeBrowser so worker.ts can call it during shutdown
export { closeBrowser };
