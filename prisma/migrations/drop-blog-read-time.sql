-- ─────────────────────────────────────────────────────────────────────────────
-- drop-blog-read-time.sql — TASK-MVDVCQW3GI94J (FO-87)
--
-- Purpose: the contract step after blog-read-minutes.sql (FO-84). The read time
-- has been "readMinutes" since FO-84; the free-text "readTime" was kept only
-- for rollback and is no longer written or read. This file drops it and makes
-- "readMinutes" NOT NULL, so the code's NULL fallback for the deploy window
-- (readMinutesOf in src/lib/blog.ts) is gone too.
--
-- After this file:
--   * "readMinutes" INTEGER NOT NULL, 1–120 (CHECK BlogPost_readMinutes_range,
--     unchanged).
--   * "readTime" no longer exists.
--
-- NULL minutes: the file STOPS (RAISE EXCEPTION) instead of filling them. The
-- fill lives in one place, blog-read-minutes.sql, which runs just before this
-- file in apply-order.txt and fills every NULL row from "readTime" / the
-- content; a NULL left here means a pre-FO-84 writer is still running. Stop
-- it, run blog-read-minutes.sql again, then this file. A second copy of the
-- backfill here could drift from the first.
--
-- Deploy order (the reverse of FO-84): code first, then this file. Code from
-- before this task selects "readTime" and fails once the column is gone.
--
-- RLS: untouched. "BlogPost" is platform content with no tenantId, listed in
-- SYSTEM_WIDE in scripts/rls-models.ts; RLS stays disabled (add-blog-post.sql).
--
-- Idempotent: one DO block (one transaction). SET NOT NULL is a no-op on a
-- NOT NULL column and the drop runs only while "readTime" exists, so a second
-- run, or a database `prisma db push` built from the new schema, is a no-op.
--
-- Rollback: prisma/migrations/drop-blog-read-time.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM "BlogPost" WHERE "readMinutes" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'BlogPost has % row(s) without "readMinutes"; refusing to set NOT NULL', n
      USING HINT = 'Run prisma/migrations/blog-read-minutes.sql again (idempotent backfill), then this file.';
  END IF;

  ALTER TABLE "BlogPost" ALTER COLUMN "readMinutes" SET NOT NULL;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'BlogPost' AND column_name = 'readTime'
  ) THEN
    ALTER TABLE "BlogPost" DROP COLUMN "readTime";
  END IF;
END $$;
