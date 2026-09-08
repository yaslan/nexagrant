-- ─────────────────────────────────────────────────────────────────────────────
-- relationship-owner-nullable.down.sql — rollback for
-- relationship-owner-nullable.sql
--
-- DESTRUCTIVE AND MAY FAIL. Restoring NOT NULL is rejected by Postgres while
-- any row holds NULL, and every such row is a relationship whose focal point
-- was erased. Check before running:
--   SELECT count(*) FROM "Relationship" WHERE "ownerUserId" IS NULL;
-- A non-zero count means this rollback cannot proceed without either assigning
-- those relationships a live user or deleting the rows. Do NOT resolve it by
-- writing the erased id back — it was removed on an erasure request.
--
-- The compliance consequence of rolling back: the purge can no longer detach
-- the focal point, so an erased person's id starts surviving erasure again.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" SET NOT NULL;

COMMENT ON COLUMN "Relationship"."ownerUserId" IS NULL;
