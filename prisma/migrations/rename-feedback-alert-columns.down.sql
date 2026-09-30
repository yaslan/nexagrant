-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- rename-feedback-alert-columns.down.sql — rollback
--
-- Restores the two vendor-named columns and replays the archived delivery ids
-- from the SystemAlert row written by the up migration, so the rollback is
-- lossless. NOT destructive: no table or row is dropped, only the archive row
-- is removed once it has been replayed.
--
-- Idempotent: guarded on information_schema and on the archive row existing, so
-- a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Feedback' AND column_name = 'alertId') THEN
    ALTER TABLE "Feedback" RENAME COLUMN "alertId" TO "sentryEventId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Feedback' AND column_name = 'alertStatus') THEN
    ALTER TABLE "Feedback" RENAME COLUMN "alertStatus" TO "sentryStatus";
  END IF;
END $$;

-- Replay the archive, then drop it.
DO $$
DECLARE rows_json jsonb;
BEGIN
  SELECT "meta" -> 'rows' INTO rows_json
    FROM "SystemAlert" WHERE "id" = 'feedback-migration-alert-columns';

  IF rows_json IS NOT NULL THEN
    UPDATE "Feedback" f
       SET "sentryEventId" = a."eventId",
           "sentryStatus"  = a."status"
      FROM jsonb_to_recordset(rows_json) AS a("id" text, "eventId" text, "status" text)
     WHERE f."id" = a."id";

    DELETE FROM "SystemAlert" WHERE "id" = 'feedback-migration-alert-columns';
  END IF;
END $$;

-- Rows the new code wrote have no legacy counterpart; clear the new vocabulary
-- so the restored columns only ever hold sent | skipped | failed. 'failed' is
-- deliberately NOT in this list — it is valid in both vocabularies, and a
-- replayed legacy row may legitimately carry it.
UPDATE "Feedback"
   SET "sentryStatus" = NULL, "sentryEventId" = NULL
 WHERE "sentryStatus" IN ('recorded', 'legacy');
