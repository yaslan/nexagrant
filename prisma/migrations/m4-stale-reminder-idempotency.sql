-- ─────────────────────────────────────────────────────────────────────────────
-- m4-stale-reminder-idempotency.sql — TASK-MULQL2NYKRGJX (İNCELEME-51 B-1, B-2)
--
-- Purpose: two fixes to the daily `m4-stale-relationships` digest.
--
--   B-1 "one digest per user per day" held only while the run finished: the
--   rows were stamped after every mail had gone, so a worker killed mid-run
--   (deploy SIGTERM, OOM) re-sent the same digest on retry. The job now claims
--   the user's day on each of their memberships BEFORE it sends
--   ("staleDigestOn" = today, a compare-and-set), stamps right after the mail
--   is accepted, and gives the claim back only when the send is rejected. A
--   crash can therefore cost one day's digest, never send a second one.
--
--   B-2 a relationship was due again only when "lastContactAt" was later than
--   "staleRemindedAt". A contact entered after the reminder but dated before
--   it ("I called them last week") silenced the relationship for good. The
--   stamp now records WHICH contact it was about ("staleRemindedContactAt");
--   any other "lastContactAt" is a new stale period, whatever its date.
--
-- After this file:
--   * "Membership"."staleDigestOn" (DATE, NULL) — the UTC day this member's
--     digest was claimed; NULL: never.
--   * "Relationship"."staleRemindedContactAt" (TIMESTAMP(3), NULL) — the
--     "lastContactAt" the last reminder named; NULL: never reminded.
--
-- Backfill (runs once; re-running changes nothing, see the NULL guards):
--   * staleRemindedContactAt = lastContactAt where the existing stamp was
--     placed while THIS contact was already stale ("staleRemindedAt" >=
--     "lastContactAt" + 60 days) — the job only stamps stale rows, so such a
--     stamp was about this contact. A stamp less than 60 days after the
--     current contact belongs to an earlier one: that is exactly the B-2 row,
--     left NULL so it is reminded when its contact goes stale.
--   * staleDigestOn = the member's latest stamp day, so a digest sent earlier
--     on the day of the deploy is not sent a second time.
--
-- RLS: untouched. Both tables stay in prisma/rls.sql's tenant-isolated list;
-- the policies key on "tenantId", which this file does not touch.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; each UPDATE only fills NULLs.
--
-- Rollback: prisma/migrations/m4-stale-reminder-idempotency.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "staleDigestOn" DATE;
ALTER TABLE "Relationship" ADD COLUMN IF NOT EXISTS "staleRemindedContactAt" TIMESTAMP(3);

UPDATE "Relationship"
   SET "staleRemindedContactAt" = "lastContactAt"
 WHERE "staleRemindedContactAt" IS NULL
   AND "staleRemindedAt" IS NOT NULL
   AND "lastContactAt" IS NOT NULL
   AND "staleRemindedAt" >= "lastContactAt" + INTERVAL '60 days';

UPDATE "Membership" m
   SET "staleDigestOn" = s.day
  FROM (
    SELECT "tenantId", "ownerUserId", max("staleRemindedAt")::date AS day
      FROM "Relationship"
     WHERE "ownerUserId" IS NOT NULL AND "staleRemindedAt" IS NOT NULL
     GROUP BY "tenantId", "ownerUserId"
  ) s
 WHERE m."staleDigestOn" IS NULL
   AND m."tenantId" = s."tenantId"
   AND m."userId" = s."ownerUserId";
