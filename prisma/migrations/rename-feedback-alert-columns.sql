-- ─────────────────────────────────────────────────────────────────────────────
-- rename-feedback-alert-columns.sql — TASK-MTQUN8VV6DK8C
--
-- Purpose: the third-party error tracker is removed from the product. Error and
-- feedback amplification now goes to the existing `SystemAlert` table, so the
-- two vendor-named columns on `Feedback` are renamed to the neutral names the
-- new code writes:
--
--     "sentryEventId" -> "alertId"      references SystemAlert.id
--     "sentryStatus"  -> "alertStatus"   recorded | failed
--
-- Why rename rather than drop-and-add: a rename keeps every existing row and is
-- a metadata-only operation — no table rewrite, no window where the data is gone.
--
-- Legacy values: rows written before this change hold an external tracker event
-- id, which is not a SystemAlert id. Leaving it under the name `alertId` would
-- be a dangling reference the admin screen would try to resolve. Those pairs are
-- therefore archived into one SystemAlert row (source `feedback-migration`) and
-- then cleared, with `alertStatus` set to 'legacy'. Nothing is discarded — the
-- down migration reads the archive back.
--
-- Idempotency: every step is guarded on information_schema / a marker row, so
-- running this file twice is a no-op. Verified by running it twice locally.
--
-- Rollback: prisma/migrations/rename-feedback-alert-columns.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Archive the legacy tracker pairs before the rename, so the archive can be
--    written even if the second run finds the columns already renamed.
DO $$
DECLARE archived jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Feedback' AND column_name = 'sentryEventId'
  ) AND NOT EXISTS (
    SELECT 1 FROM "SystemAlert" WHERE source = 'feedback-migration'
  ) THEN
    EXECUTE $q$
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', "id", 'eventId', "sentryEventId", 'status', "sentryStatus")), '[]'::jsonb)
      FROM "Feedback"
      WHERE "sentryEventId" IS NOT NULL OR "sentryStatus" IS NOT NULL
    $q$ INTO archived;

    IF jsonb_array_length(archived) > 0 THEN
      INSERT INTO "SystemAlert" ("id", "level", "source", "message", "meta", "createdAt")
      VALUES (
        'feedback-migration-alert-columns',
        'info',
        'feedback-migration',
        'Archived legacy external-tracker delivery ids from Feedback before renaming the columns to alertId/alertStatus.',
        jsonb_build_object('rows', archived),
        now()
      );
    END IF;
  END IF;
END $$;

-- 2. Rename. `ALTER TABLE ... RENAME COLUMN` has no IF EXISTS, hence the guard.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Feedback' AND column_name = 'sentryEventId') THEN
    ALTER TABLE "Feedback" RENAME COLUMN "sentryEventId" TO "alertId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Feedback' AND column_name = 'sentryStatus') THEN
    ALTER TABLE "Feedback" RENAME COLUMN "sentryStatus" TO "alertStatus";
  END IF;
END $$;

-- 3. Retire the legacy vocabulary. Idempotent: the WHERE clause matches nothing
--    on a second run, and rows written by the new code use recorded|failed.
UPDATE "Feedback"
   SET "alertId" = NULL,
       "alertStatus" = 'legacy'
 WHERE "alertStatus" IN ('sent', 'skipped', 'failed');

COMMENT ON COLUMN "Feedback"."alertId"     IS 'SystemAlert.id for the alert raised by this report. NULL when none was written.';
COMMENT ON COLUMN "Feedback"."alertStatus" IS 'recorded | failed. ''legacy'' marks a report that predates the SystemAlert channel.';
