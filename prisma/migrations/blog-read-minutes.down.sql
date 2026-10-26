-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- blog-read-minutes.down.sql — rollback for blog-read-minutes.sql
--
-- Lossy only in wording: "readTime" is rewritten from "readMinutes" for every
-- row that has minutes, because the minutes are the current value (a row
-- written after the forward file has no "readTime" at all; one edited after it
-- has a stale one). The text is Turkish, the site's default locale, in the
-- launch posts' wording ("5 dk okuma"); an original English "5 min read" comes
-- back as "5 dk okuma".
--
-- Roll the application code back in the same deploy (to before
-- TASK-MVDSY96TB1EPM): code that knows "readMinutes" fails without it.
--
-- Order: if drop-blog-read-time.sql (FO-87) has run, roll it back first with
-- drop-blog-read-time.down.sql — it brings "readTime" back. Without "readTime"
-- this file stops (RAISE below) before changing anything.
--
-- Idempotent: every step checks for the column / constraint first.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'BlogPost' AND column_name = 'readTime'
  ) THEN
    RAISE EXCEPTION 'BlogPost has no "readTime" column; drop-blog-read-time.sql (FO-87) has run'
      USING HINT = 'Run scripts/apply-migrations.sh --down drop-blog-read-time.down.sql first, then this file.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'BlogPost' AND column_name = 'readMinutes'
  ) THEN
    UPDATE "BlogPost"
    SET "readTime" = "readMinutes" || ' dk okuma'
    WHERE "readMinutes" IS NOT NULL;
  END IF;
END $$;

-- A row without minutes was written by pre-task code, which always wrote "readTime".
ALTER TABLE "BlogPost" ALTER COLUMN "readTime" SET NOT NULL;
ALTER TABLE "BlogPost" DROP CONSTRAINT IF EXISTS "BlogPost_readMinutes_range";
ALTER TABLE "BlogPost" DROP COLUMN IF EXISTS "readMinutes";
