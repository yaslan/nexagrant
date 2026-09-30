-- ─────────────────────────────────────────────────────────────────────────────
-- m4-stale-digest-user-claim.down.sql — rollback for m4-stale-digest-user-claim.sql
--
-- LOSSY: drops the per-user claim. Roll the application back to the previous
-- release in the same deploy: code that reads "User"."staleDigestOn" fails
-- without it. The previous release claims on "Membership"."staleDigestOn",
-- which the forward file left in place, so it resumes with its old behaviour
-- (and İNCELEME-69 D-1). Claims made by this release on the day of the
-- rollback are not copied back to the memberships: a user mailed earlier that
-- day by this release can get a second digest from the previous one.
--
-- The index goes too; nothing but this file's reasoning depends on it.
--
-- Idempotent: DROP ... IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "Membership_userId_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "staleDigestOn";
