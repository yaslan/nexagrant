-- ─────────────────────────────────────────────────────────────────────────────
-- ai-usage-log-ref-id.sql — NG-387 (NG-202 B3): the delivery marker of a credit reservation
--
-- Purpose: an M18 action reserves its price as a `usage:M18` CreditLedger row before the model
-- call (src/modules/m18/server/ai-credits.ts). A delivered action writes no refund (the
-- reservation is the charge); an action whose process died writes none either. The
-- `ai-reservation-orphans` job (src/lib/ai/reservation-orphans.ts) tells the two apart by this
-- column: generateCompletion writes the reservation's refId into the AiUsageLog row of a
-- complete answer.
--
-- After this file:
--   * "AiUsageLog"."refId" (TEXT, NULL) — NULL on every existing row.
--   * "AiUsageLog_tenantId_refId_idx"  — the job's per-reservation NOT EXISTS probe.
--   * "AiUsageLog_module_createdAt_idx" — the job's "first marker of the module" read.
--   * No existing row is changed.
--
-- RLS: untouched. "AiUsageLog" stays in prisma/rls.sql's tenant-isolated list; the policies key
-- on "tenantId", which this file does not touch.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
--
-- Rollback: prisma/migrations/ai-usage-log-ref-id.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AiUsageLog" ADD COLUMN IF NOT EXISTS "refId" TEXT;
CREATE INDEX IF NOT EXISTS "AiUsageLog_tenantId_refId_idx" ON "AiUsageLog" ("tenantId", "refId");
CREATE INDEX IF NOT EXISTS "AiUsageLog_module_createdAt_idx" ON "AiUsageLog" ("module", "createdAt");
