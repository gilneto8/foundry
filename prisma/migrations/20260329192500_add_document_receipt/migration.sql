-- ============================================================
-- Migration: add_document_receipt
-- Adds the document_receipts table for the DocStamper module.
--
-- issuedAt is the legally significant timestamp — set by the
-- application BEFORE the PDF is rendered, so it cannot be
-- backdated by the rendering process.
--
-- contentHash is written AFTER rendering completes (SHA-256
-- of the PDF bytes). null = rendering in-flight or failed.
-- ============================================================

CREATE TABLE "document_receipts" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "entityRef"    TEXT NOT NULL,
    "contentHash"  TEXT,
    "issuedAt"     TIMESTAMP(3) NOT NULL,
    "storagePath"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_receipts_pkey" PRIMARY KEY ("id")
);

-- Index for user-scoped receipt lookups (dashboard queries)
CREATE INDEX "document_receipts_userId_idx" ON "document_receipts"("userId");

-- Index for entity-scoped lookups (dedup checks, status polling)
CREATE INDEX "document_receipts_entityRef_idx" ON "document_receipts"("entityRef");

-- Foreign key: cascade delete when user is deleted
ALTER TABLE "document_receipts"
    ADD CONSTRAINT "document_receipts_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
