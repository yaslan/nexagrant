-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- drop-blog-read-time.down.sql — rollback for drop-blog-read-time.sql
--
-- Back to the FO-84 schema: "readTime" TEXT (nullable), "readMinutes" nullable,
-- the CHECK kept. "readTime" comes back from the minutes in Turkish, the site's
-- default locale, in the launch posts' wording ("5 dk okuma"), as
-- blog-read-minutes.down.sql writes it; the original text is not recoverable.
--
-- Order: this file first, then roll the code back (to before
-- TASK-MVDVCQW3GI94J). FO-84 code selects "readTime" and fails without it;
-- this task's code runs on the restored schema too (it never writes
-- "readTime", and every row keeps its minutes).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, the fill only touches rows whose
-- "readTime" is NULL, DROP NOT NULL is a no-op the second time.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "readTime" TEXT;

UPDATE "BlogPost"
SET "readTime" = "readMinutes" || ' dk okuma'
WHERE "readTime" IS NULL AND "readMinutes" IS NOT NULL;

ALTER TABLE "BlogPost" ALTER COLUMN "readMinutes" DROP NOT NULL;
