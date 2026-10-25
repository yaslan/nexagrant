-- ─────────────────────────────────────────────────────────────────────────────
-- blog-read-minutes.sql — TASK-MVDSY96TB1EPM (FO-84)
--
-- Purpose: a post's read time was free text in the writing admin's language
-- ("5 dk", "5 min read", "3 dk okuma"), so a post written in the Turkish admin
-- showed "5 dk" on /en/blog/... too. The read time is now a number of minutes,
-- "readMinutes", and every page formats it in the reader's locale
-- (messages blog.readMinutes).
--
-- After this file:
--   * "readMinutes" (INTEGER, NULL) — minutes, 1–120 (CHECK below). Filled for
--     every existing row by the backfill. NULL only for a row written by code
--     from before this task after the file ran (deploy window); the pages
--     estimate from the content for such a row, and a second run fills it.
--   * "readTime" stays (rollback safety) but is no longer written by the
--     application, so its NOT NULL is dropped. A follow-up drops the column.
--
-- Backfill: the first integer in "readTime" when it is 1–120; otherwise (no
-- number, 0, out of range) the minutes are estimated from "content" the way
-- src/lib/blog-read-time.ts estimateReadMinutes counts words (link/image
-- targets, HTML tags and ordered-list markers are not words; 200 words a
-- minute, rounded), at least 1 and at most 120.
--
-- RLS: untouched. "BlogPost" is platform content with no tenantId, listed in
-- SYSTEM_WIDE in scripts/rls-models.ts; RLS stays disabled (add-blog-post.sql).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, the CHECK added only when missing, the
-- backfill only touches rows whose "readMinutes" is NULL, DROP NOT NULL is a
-- no-op the second time.
--
-- Rollback: prisma/migrations/blog-read-minutes.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "readMinutes" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BlogPost_readMinutes_range' AND conrelid = '"BlogPost"'::regclass
  ) THEN
    ALTER TABLE "BlogPost"
      ADD CONSTRAINT "BlogPost_readMinutes_range" CHECK ("readMinutes" BETWEEN 1 AND 120);
  END IF;
END $$;

ALTER TABLE "BlogPost" ALTER COLUMN "readTime" DROP NOT NULL;

WITH parsed AS (
  SELECT
    "id",
    substring("readTime" FROM '[0-9]+') AS digits,
    (
      SELECT count(*)
      FROM regexp_split_to_table(
        regexp_replace(
          regexp_replace(
            regexp_replace("content", '!?\[([^\]]*)\]\([^)]*\)', '\1', 'g'),
            '<[^>]+>', ' ', 'g'),
          '^\s*[0-9]+[.)]\s+', ' ', 'gn'),
        '\s+') AS token
      WHERE token ~ '[[:alnum:]]'
    ) AS words
  FROM "BlogPost"
  WHERE "readMinutes" IS NULL
)
UPDATE "BlogPost" AS b
SET "readMinutes" = CASE
  -- Nested so the cast never sees more than three digits (no integer overflow).
  WHEN p.digits IS NOT NULL AND length(p.digits) <= 3 THEN
    CASE WHEN p.digits::int BETWEEN 1 AND 120 THEN p.digits::int
         ELSE LEAST(120, GREATEST(1, round(p.words / 200.0)::int)) END
  ELSE LEAST(120, GREATEST(1, round(p.words / 200.0)::int))
END
FROM parsed AS p
WHERE b."id" = p."id";
