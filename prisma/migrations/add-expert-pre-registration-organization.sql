-- ─────────────────────────────────────────────────────────────────────────────
-- add-expert-pre-registration-organization.sql — TASK-MVBLMIJW293GW (FO-25)
--
-- Purpose: the expert form asks for "Kurum" (the organisation the expert works
-- for), required by the API from FO-25 on (K-516717). The column is added
-- nullable: rows written before this change keep NULL, nothing is backfilled,
-- and the application enforces "required" on new submissions only.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, so a second run is a no-op, and a
-- database built by `prisma db push` first already has the column.
--
-- Rollback: prisma/migrations/add-expert-pre-registration-organization.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ExpertPreRegistration" ADD COLUMN IF NOT EXISTS "organization" TEXT;
