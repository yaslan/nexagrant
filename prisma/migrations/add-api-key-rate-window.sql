-- ─────────────────────────────────────────────────────────────────────────────
-- add-api-key-rate-window.sql — TASK-MUN80XIW5NPV1 (security scan O-4)
--
-- Purpose: the API keys screen promises 1,000 requests a minute per key, and
-- nothing enforced it. src/lib/api-auth.ts now counts every /api/v1 request in
-- a fixed one-minute window held on the key's own row and answers 429 with
-- Retry-After over the limit. One UPDATE ... RETURNING both counts and reads,
-- so concurrent requests serialise on the row lock.
--
--   "rateWindowStartedAt"  when the current window began (NULL = never used)
--   "rateWindowCount"      requests counted in that window
--
-- RLS: no change. "ApiKey" is already in the tenant_isolation loop of
-- prisma/rls.sql, and the counter is written under withTenant(keyRecord.tenantId).
--
-- Rollback: prisma/migrations/add-api-key-rate-window.down.sql
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "rateWindowStartedAt" TIMESTAMP(3);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "rateWindowCount" INTEGER NOT NULL DEFAULT 0;

COMMIT;
