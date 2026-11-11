-- ─────────────────────────────────────────────────────────────────────────────
-- auditevent-immutable.sql — NG-40 (denetim değişmezliği, §18.3)
--
-- Purpose: the audit trail must be append-only for the application. The app
-- role fabrika_app held UPDATE, DELETE and TRUNCATE on "AuditEvent" (the blanket
-- grant of prisma/rls-app-role.sql step 3), so any code path with the app
-- connection could rewrite or erase history. After this file fabrika_app has
-- SELECT and INSERT on the table and nothing else.
--
-- The one legitimate rewrite is KVKK erasure: users-scheduled-deletion.ts used
-- to `updateMany({ actorId: userId } -> null)`. That now goes through
-- audit_detach_actor(), a SECURITY DEFINER function that can do exactly one
-- thing: set "actorId" to NULL on rows naming a user whose erasure request is
-- at least 30 days old (the grace period, enforced here as well as in the job).
-- It cannot change type/target/data/createdAt, cannot touch another user's
-- rows, and cannot delete.
--
-- Tenant hard-delete keeps working: the "AuditEvent_tenantId_fkey" ON DELETE
-- CASCADE action runs with the privileges of the table owner, not fabrika_app.
--
-- Re-run caveat: prisma/rls-app-role.sql step 3 re-grants DML on ALL TABLES;
-- its step 3d repeats this REVOKE right after, so re-running it does not undo
-- this file.
--
-- Idempotent: CREATE OR REPLACE / REVOKE / GRANT, guarded by a role check so a
-- database without fabrika_app still migrates.
-- Rollback: prisma/migrations/auditevent-immutable.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_detach_actor(p_user text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  scope_was text := current_setting('app.system_scope', true);
  n integer;
BEGIN
  IF p_user IS NULL OR btrim(p_user) = '' THEN
    RAISE EXCEPTION 'audit_detach_actor: user is required' USING ERRCODE = '22004';
  END IF;
  -- Only a person whose erasure grace period (30 days, the same as
  -- DEFAULT_GRACE_PERIOD_DAYS in users-scheduled-deletion.ts) has run out can be
  -- detached (NG-40 sec F5). The floor is enforced here, not only in the job: a
  -- caller holding the app connection cannot cut attributions early.
  IF NOT EXISTS (
    SELECT 1 FROM "User"
     WHERE "id" = p_user
       AND "deletionRequestedAt" IS NOT NULL
       AND "deletionRequestedAt" <= now() - interval '30 days'
  ) THEN
    RAISE EXCEPTION 'audit_detach_actor: user % has no erasure whose 30-day grace period has ended', p_user USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.system_scope', 'on', true);
  UPDATE "AuditEvent" SET "actorId" = NULL WHERE "actorId" = p_user;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.system_scope', coalesce(scope_was, ''), true);
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_detach_actor(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM fabrika_app';
    EXECUTE 'GRANT SELECT, INSERT ON "AuditEvent" TO fabrika_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.audit_detach_actor(text) TO fabrika_app';
  END IF;
END $$;
