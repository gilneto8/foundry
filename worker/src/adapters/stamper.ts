// ============================================================
// worker/src/adapters/stamper.ts
// DocStamper — renders an HTML string to a cryptographically-
// timestamped PDF.
//
// DESIGN:
//   This adapter wraps the existing Playwright adapter.
//   It accepts an HTML string (pre-rendered by the caller)
//   instead of a URL — no internal route or running Next.js
//   server is required.
//
//   The "cryptographic" stamp is a two-part audit chain:
//     1. issuedAt  — recorded in PostgreSQL BEFORE this runs
//                    (issued by src/lib/receipt.ts Phase 1)
//     2. contentHash — SHA-256 of the PDF bytes, written here
//                    and saved back to the DocumentReceipt row
//
//   Together they prove: "this document was created at exactly
//   this moment and its content has not changed since."
//
// USAGE (from stamped-pdf.worker.ts):
//   const result = await generateStampedDocument({
//     htmlContent: "<html>...</html>",
//     metadata: { documentType, entityRef, issuedAt, issuedBy },
//     options: { format: "A4" },
//   });
//   // result.pdfBuffer  — raw bytes to save/stream
//   // result.contentHash — write back to DocumentReceipt.contentHash
// ============================================================

import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { withPage } from "./playwright";
import { logger } from "../logger";

const log = logger.child({ module: "stamper" });

// ---------------------------------------------------------------------------
// Storage directory for stamped PDFs.
// In production this will be a mounted volume. Configurable via env var.
// ---------------------------------------------------------------------------
const STORAGE_DIR = process.env.STAMPED_PDF_DIR ?? "/tmp/stamped-pdfs";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StampedDocumentMetadata {
  /** Machine-readable document type, e.g. "TACIT_APPROVAL_DECLARATION" */
  documentType: string;
  /** External reference, e.g. "1106:LX-2026-00123" */
  entityRef: string;
  /**
   * The issuedAt timestamp from the DocumentReceipt row.
   * Embedded in the PDF footer for human-readable audit trail.
   */
  issuedAt: Date;
  /** Application identifier, e.g. "tacit-approval-pt" */
  issuedBy: string;
}

export interface StampedDocumentInput {
  /**
   * Fully rendered HTML string.
   * The caller is responsible for rendering templates — this adapter
   * only handles PDF generation and signing. No data fetching occurs here.
   */
  htmlContent: string;
  metadata: StampedDocumentMetadata;
  /** Passed through to the Playwright adapter. A4 by default. */
  options?: {
    format?: "A4" | "Letter" | "A3";
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
  };
}

export interface StampedDocumentOutput {
  /** Raw PDF bytes. */
  pdfBuffer: Buffer;
  /** SHA-256 hex digest of pdfBuffer. Write this to DocumentReceipt.contentHash. */
  contentHash: string;
  /** Absolute path to the saved PDF on disk. Write to DocumentReceipt.storagePath. */
  storagePath: string;
  /** Echoed from input metadata for convenience. */
  issuedAt: Date;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Renders an HTML string to a PDF via headless Chromium, computes a SHA-256
 * content hash, saves the file to disk, and returns the result.
 *
 * Call this from the stamped-pdf.worker.ts BullMQ processor.
 * The receiptId from the job payload must be used to finalise the DB record.
 */
export async function generateStampedDocument(
  input: StampedDocumentInput
): Promise<StampedDocumentOutput> {
  const { htmlContent, metadata, options } = input;

  log.info(
    {
      event: "stamper.start",
      documentType: metadata.documentType,
      entityRef: metadata.entityRef,
      issuedAt: metadata.issuedAt.toISOString(),
    },
    "Generating stamped document"
  );

  // Inject the audit footer into the HTML before rendering.
  // This embeds the issuedAt timestamp visibly in the document itself.
  const stampedHtml = injectAuditFooter(htmlContent, metadata);

  // Render via the existing Playwright adapter.
  // withPage opens a fresh isolated context, loads HTML directly
  // (no URL navigation needed), and closes the context on exit.
  const pdfBuffer = await withPage(async (page) => {
    await page.setContent(stampedHtml, { waitUntil: "networkidle" });

    const pdf = await page.pdf({
      format: options?.format ?? "A4",
      printBackground: true,
      margin: options?.margin ?? { top: "1.5cm", bottom: "2cm", left: "1.5cm", right: "1.5cm" },
    });

    return Buffer.from(pdf);
  });

  // Compute SHA-256 of the rendered PDF bytes
  const contentHash = crypto
    .createHash("sha256")
    .update(pdfBuffer)
    .digest("hex");

  // Persist to disk
  const storagePath = await savePdf(pdfBuffer, metadata);

  log.info(
    {
      event: "stamper.complete",
      documentType: metadata.documentType,
      entityRef: metadata.entityRef,
      contentHash,
      storagePath,
      bytes: pdfBuffer.byteLength,
    },
    "Stamped document generated"
  );

  return {
    pdfBuffer,
    contentHash,
    storagePath,
    issuedAt: metadata.issuedAt,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Injects an audit trail footer into the HTML document before rendering.
 * Inserted just before </body> so it appears on the last page.
 */
function injectAuditFooter(html: string, metadata: StampedDocumentMetadata): string {
  const footer = `
    <div style="
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px 24px;
      font-family: monospace;
      font-size: 9px;
      color: #666;
      border-top: 1px solid #ddd;
      background: white;
    ">
      <strong>Documento gerado por ${metadata.issuedBy}</strong> |
      Tipo: ${metadata.documentType} |
      Ref: ${metadata.entityRef} |
      Data/hora de emissão: ${metadata.issuedAt.toISOString().replace("T", " ").replace("Z", " UTC")}
      <br/>
      Este documento foi gerado automaticamente por sistema certificado.
      A data/hora de emissão está registada na base de dados do sistema.
    </div>
  `.trim();

  // Insert before </body> if present, otherwise append
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}\n</body>`);
  }
  return html + footer;
}

/**
 * Saves a PDF buffer to the configured storage directory.
 * Creates a subdirectory per documentType for easy browsing.
 * Filename: <entityRef (sanitised)>_<timestamp>.pdf
 */
async function savePdf(buffer: Buffer, metadata: StampedDocumentMetadata): Promise<string> {
  // Sanitise entityRef for use as a filename component
  const safeRef = metadata.entityRef.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
  const timestamp = metadata.issuedAt.toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  const filename = `${safeRef}_${timestamp}.pdf`;

  const dir = path.join(STORAGE_DIR, metadata.documentType);
  await fs.mkdir(dir, { recursive: true });

  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, buffer);

  return fullPath;
}
