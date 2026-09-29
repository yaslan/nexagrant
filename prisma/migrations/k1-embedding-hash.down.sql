-- ─────────────────────────────────────────────────────────────────────────────
-- k1-embedding-hash.down.sql — rollback for k1-embedding-hash.sql
--
-- Lossless for the vectors themselves (the "embedding" columns stay). Without
-- the hash the job cannot tell a current vector from a stale one, so code that
-- still knows the column would fail on it: roll the application code back in
-- the same deploy (to before TASK-MUN7C48UHPOGI, where no embedding job exists).
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Topic" DROP COLUMN IF EXISTS "embeddingHash";
ALTER TABLE "TenantProfile" DROP COLUMN IF EXISTS "embeddingHash";
