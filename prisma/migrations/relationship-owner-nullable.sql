-- ─────────────────────────────────────────────────────────────────────────────
-- relationship-owner-nullable.sql — KVKK md.7 · GDPR art.17 (right to erasure)
--
-- Purpose: `Relationship.ownerUserId` was NOT NULL, so `DELETE FROM "User"`
-- could not reach it and the id of an erased person survived their erasure in
-- every relationship they were the focal point of. The column carries no
-- foreign key, so nothing cascaded it either.
--
-- Why detach rather than retain (A4 decision, option C, 2026-09-08): this
-- column is a work assignment ("internal focal point"), not a record. No
-- integrity rule depends on it — the only structure over it is
-- `@@index([tenantId, ownerUserId])` — and the external party is held in
-- separate columns (`counterpartName`, `counterpartEmail`), which are the
-- tenant's own data and stay. The sibling case `DualApprovalStep.actorUserId`
-- was decided the other way and is retained: there the id is a signature and a
-- unique constraint depends on it. See docs/legal/processing-register.md §12.
--
-- After this, NULL means "unassigned — needs a new focal point". The purge job
-- (`src/lib/inngest/jobs/users-scheduled-deletion.ts`) sets it.
--
-- Idempotency: `DROP NOT NULL` on a column that is already nullable is a no-op
-- in Postgres, so re-running this file is safe. Purely permissive — no column
-- is dropped or retyped and no existing row is touched.
--
-- Rollback: prisma/migrations/relationship-owner-nullable.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" DROP NOT NULL;

COMMENT ON COLUMN "Relationship"."ownerUserId" IS 'Internal focal point (User.id, no FK). NULL = unassigned. Detached by the KVKK/GDPR purge: a work assignment has no retention basis once the person is erased (A4 option C, 2026-09-08).';
