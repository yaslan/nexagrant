-- ─────────────────────────────────────────────────────────────────────────────
-- add-decision-log-reactivate.sql — NG-241 / TASK-MWMDWXZ79GUI2 (decision K-584158 = A)
--
-- Purpose: a withdrawn opportunity can be reactivated, back to the status it was withdrawn
-- from (ACTIVE or SUBMITTED). That return is a decision with a reason like the withdrawal, so:
--   • DecisionKind gets 'REACTIVATE' (the one writer: src/lib/k5-pipeline/withdrawal.ts);
--   • DecisionLog gets "fromStatus" / "toStatus" ("OppStatus", nullable): the status before and
--     after the decision. The reactivation reads "fromStatus" of the latest WITHDRAW row. Rows
--     written before this file have NULL there; the writer then returns to ACTIVE.
--
-- Additive: one enum value, two nullable columns. No row is updated (no backfill), no column
-- or policy is changed. "DecisionLog" keeps its tenant_isolation policy from
-- add-project-idea-decision-log.sql; RLS is per row, so new columns need nothing.
-- Idempotent: ADD VALUE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS. A second run, or a run after
-- `prisma db push`, changes nothing. (The new enum value is not used in this file, so the
-- "cannot use a value added in the same transaction" rule does not bite.)
-- Rollback: add-decision-log-reactivate.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE "DecisionKind" ADD VALUE IF NOT EXISTS 'REACTIVATE';

ALTER TABLE "DecisionLog" ADD COLUMN IF NOT EXISTS "fromStatus" "OppStatus";
ALTER TABLE "DecisionLog" ADD COLUMN IF NOT EXISTS "toStatus" "OppStatus";
