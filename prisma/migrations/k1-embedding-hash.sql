-- ─────────────────────────────────────────────────────────────────────────────
-- k1-embedding-hash.sql — TASK-MUN7C48UHPOGI (K1 embedding doldurma)
--
-- Purpose: the `k1-embeddings` job fills "Topic".embedding and
-- "TenantProfile".embedding. To stay idempotent it must know whether a stored
-- vector was made from the text the row carries today, without calling the
-- provider again. It stores a sha256 of that text (plus the model it went to).
--
-- After this file:
--   * "Topic"."embeddingHash"         TEXT NULL — NULL: never embedded by the job.
--   * "TenantProfile"."embeddingHash" TEXT NULL — same.
--   * No existing row is changed. A vector that is present with a NULL hash is
--     re-embedded once, because nothing says which text it came from.
--
-- RLS: untouched. "TenantProfile" stays in prisma/rls.sql's tenant-isolated
-- list (policies key on "tenantId"); "Topic" is the shared catalogue.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Rollback: prisma/migrations/k1-embedding-hash.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "embeddingHash" TEXT;
ALTER TABLE "TenantProfile" ADD COLUMN IF NOT EXISTS "embeddingHash" TEXT;
