-- ─────────────────────────────────────────────────────────────────────────────
-- add-meeting-brief-opportunity.sql — TASK-MULQLQIE3ES6G (ROADMAP open decision #14)
--
-- Purpose: an M9 meeting brief knows which opportunity it was prepared for.
-- Without the column, /opportunities/[id]/briefs listed every brief of the
-- tenant on every opportunity page.
--
-- Shape: "MeetingBrief"."opportunityId" TEXT NULL → "Opportunity"("id"),
-- ON DELETE SET NULL (a brief is the user's own text; it outlives a hard-deleted
-- opportunity and shows up as unlinked), plus an index on
-- ("tenantId", "opportunityId") for the page's two reads (this opportunity's
-- briefs, and the tenant's unlinked ones). Names match what Prisma generates for
-- schema.prisma, so a database built with `prisma db push` and then this file
-- ends up with one constraint and one index, not two.
--
-- Existing rows: untouched. They stay NULL and the page shows them in a separate
-- "not linked to an opportunity" list. No backfill: nothing recorded which
-- opportunity an old brief was for (callTopic was the opportunity *title*, and
-- it was not stored), so any guess would attach a brief to the wrong page.
--
-- Tenancy: the FK does not check tenants — constraint checks run without RLS —
-- so generateMeetingBrief (src/modules/m9/server/actions.ts) refuses an
-- opportunity id outside the session tenant before anything is written. RLS is
-- unchanged: MeetingBrief is already in prisma/rls.sql's tenant_isolation list,
-- and the new column is not a tenant key.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, the constraint is added only when
-- absent by name, CREATE INDEX IF NOT EXISTS. A second run changes nothing.
-- Rollback: add-meeting-brief-opportunity.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "MeetingBrief" ADD COLUMN IF NOT EXISTS "opportunityId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MeetingBrief_opportunityId_fkey') THEN
    ALTER TABLE "MeetingBrief"
      ADD CONSTRAINT "MeetingBrief_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MeetingBrief_tenantId_opportunityId_idx"
  ON "MeetingBrief" ("tenantId", "opportunityId");
