-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- add-blog-post.down.sql — rollback for add-blog-post.sql
--
-- LOSSY: every blog post, including the ones admins wrote through /admin/blog,
-- is dropped. Roll the application code back in the same deploy (to before
-- AKTAR-MURBCJ0A-1), or the public blog pages and the admin editor fail.
--
-- Idempotent: DROP TABLE IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "BlogPost";
