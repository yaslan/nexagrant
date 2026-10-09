-- ─────────────────────────────────────────────────────────────────────────────
-- m4-stale-digest-user-claim.sql — TASK-MUNVW60JPR1I9 (İNCELEME-69 D-1, D-3)
--
-- Purpose: the daily `m4-stale-relationships` digest claims the user's day on
-- the USER row instead of on each of their memberships.
--
--   D-1 The claim sat on "Membership"."staleDigestOn". A membership is hard
--   deleted (a member removed, or the tenant deleted: onDelete Cascade), and
--   the day's claim went with it. A second run the same day (a retry, a job
--   added by hand) then found no claim and sent a second digest — measured
--   live with graphile-worker + mailpit, both for a removed member and for a
--   deleted tenant. One CAS on "User"."staleDigestOn" does not depend on any
--   membership. It also closes İNCELEME-56 R-1 (two runs over disjoint tenants
--   could both stand down and the user got no digest that day): both runs now
--   race for the same row, and exactly one wins.
--
--   D-3 "Membership" had no index that starts with "userId" (only the unique
--   ("tenantId", "userId")), so every by-user read scanned that index whole,
--   and deleting a user had to find its memberships (onDelete Cascade) the same
--   way. The claim no longer reads Membership by user, but those readers stay:
--   the GDPR export and erasure, account deletion, the session's membership lookup.
--
-- After this file:
--   * "User"."staleDigestOn" (DATE, NULL) — the UTC day this user's digest was
--     claimed; NULL: never.
--   * "Membership_userId_idx" on "Membership" ("userId").
--   * "Membership"."staleDigestOn" is left in place, no longer read or written
--     by the code; the previous release still uses it, so it goes in a later
--     file once this one is live everywhere.
--
-- Backfill (runs once; re-running changes nothing): "User"."staleDigestOn" =
-- the latest day claimed on any of the user's memberships, so a digest sent by
-- the previous release earlier on the day of the deploy is not sent again.
-- "Membership" is FORCE ROW LEVEL SECURITY, under which even its owner reads
-- ZERO rows without a tenant (the prod migrate role is the owner and is not
-- BYPASSRLS), so the block turns FORCE off for its own transaction and puts it
-- back — only if it was on — before it ends. A raise rolls both back.
--
-- Locks: CREATE INDEX (not CONCURRENTLY) holds a SHARE lock on "Membership"
-- while it builds, and the backfill's ALTER TABLE an ACCESS EXCLUSIVE lock for
-- its own short transaction: writes to Membership (joins, role changes) wait
-- for both. Membership is small (one row per member per tenant).
--
-- RLS: policies untouched. "User" carries none; "Membership" keeps its
-- tenant_isolation and system_scope policies and, after the block, its FORCE.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and the
-- UPDATE only raises a NULL or an earlier day.
--
-- Rollback: prisma/migrations/m4-stale-digest-user-claim.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staleDigestOn" DATE;

CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership" ("userId");

DO $$
DECLARE
  forced boolean;
BEGIN
  SELECT relforcerowsecurity INTO forced FROM pg_class WHERE oid = '"Membership"'::regclass;
  IF forced THEN
    ALTER TABLE "Membership" NO FORCE ROW LEVEL SECURITY;
  END IF;

  UPDATE "User" u
     SET "staleDigestOn" = m.day
    FROM (
      SELECT "userId", max("staleDigestOn") AS day
        FROM "Membership"
       WHERE "staleDigestOn" IS NOT NULL
       GROUP BY "userId"
    ) m
   WHERE u.id = m."userId"
     AND (u."staleDigestOn" IS NULL OR u."staleDigestOn" < m.day);

  IF forced THEN
    ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
  END IF;
END
$$;
