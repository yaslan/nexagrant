-- ─────────────────────────────────────────────────────────────────────────────
-- drop-evidence-reminder.sql — TASK-MUXVOWBNIIQKD (FB-NOTIF-1)
--
-- The EvidenceReminder table has no writer and no reader in src/. The expiry
-- notification (ADR-0011 §2.2, evidence-expiring) uses the Notification row's
-- dedupeKey as its only state, so the reminder table is dead schema that still
-- holds recipientEmails, personal data with no purpose. Decision K-4959 (A):
-- the model stayed in place until this dedicated removal card.
--
-- DESTRUCTIVE: every row in EvidenceReminder is dropped with the table. The DO
-- block below counts the rows first and raises instead of dropping when any
-- exist, unless the operator opts in for this one session. scripts/apply-migrations.sh
-- runs psql, which passes PGOPTIONS to the server, so:
--   PGOPTIONS='-c app.allow_evidence_reminder_drop=on' DATABASE_URL=... \
--     scripts/apply-migrations.sh
-- The count sees every tenant's rows: the table FORCEs row level security, so
-- the block turns FORCE off first (it needs ownership, as the DROP does).
--
-- Idempotent: when the table is already gone the whole block is skipped, so a
-- second run exits 0. Dropping the table drops its policies and indexes with it.
--
-- Rollback: prisma/migrations/drop-evidence-reminder.down.sql (recreates the
-- empty table; the rows are not recoverable from here).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('"EvidenceReminder"') IS NULL THEN
    RAISE NOTICE 'EvidenceReminder already absent, nothing to drop';
    RETURN;
  END IF;

  ALTER TABLE "EvidenceReminder" NO FORCE ROW LEVEL SECURITY;
  SELECT count(*) INTO n FROM "EvidenceReminder";

  IF n > 0 AND current_setting('app.allow_evidence_reminder_drop', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'EvidenceReminder holds % row(s); refusing to drop without app.allow_evidence_reminder_drop=on', n
      USING HINT = 'Back up or export the rows first, then rerun with PGOPTIONS=''-c app.allow_evidence_reminder_drop=on''.';
  END IF;

  RAISE NOTICE 'dropping EvidenceReminder with % row(s)', n;
  DROP POLICY IF EXISTS tenant_isolation ON "EvidenceReminder";
  DROP POLICY IF EXISTS system_scope ON "EvidenceReminder";
  DROP TABLE "EvidenceReminder";
END $$;

COMMIT;
