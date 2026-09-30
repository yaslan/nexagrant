-- Included by every rollback file in prisma/migrations (`\ir`), before anything
-- else runs. TASK-MUOGMUUAWFEQX (İNCELEME-115 Ö-2).
--
-- Rollback files run through scripts/apply-migrations.sh --down <file>, never
-- plain psql. The script checks the role and the policies first, and runs the
-- file with `app.system_scope = 'on'` for its session, as it does forward files.
-- Without that session the schema owner (not superuser, not BYPASSRLS) sees no
-- tenant rows under FORCE ROW LEVEL SECURITY: a rollback backfill updates zero
-- rows and exits 0. rename-feedback-alert-columns.down.sql then also deleted
-- its archive without replaying it, a permanent loss (measured).
--
-- The script also sets `fabrika.migration_down`, so a hand-written
-- `-c "SET app.system_scope = 'on'"` alone still stops here: the checks the
-- script runs around the file are the point.
--
-- The caller must have `\set ON_ERROR_STOP on` before the `\ir`, or psql would
-- print this error and carry on.

DO $$ BEGIN
  IF current_setting('fabrika.migration_down', true) IS DISTINCT FROM 'on'
     OR current_setting('app.system_scope', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'rollback files run with scripts/apply-migrations.sh --down <file>, not plain psql'
      USING HINT = 'Without its app.system_scope session the file sees no tenant rows under FORCE RLS. docs/RELEASE_CHECKLIST.md §3.2.';
  END IF;
END $$;
