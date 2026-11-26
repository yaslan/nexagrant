-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- Rollback of add-consortium-seat-member-stage.sql (NG-364).
--
-- Deploy the code rollback FIRST: the G1 gate, the member-stage action and the invite/confirm
-- actions read and write these columns, so with them gone those paths fail.
--
-- DESTRUCTIVE for the stage and letter-of-intent records only: the four columns are dropped with
-- their data (copy them out first if they are to be kept). Seats, their status and organisations
-- are untouched. Idempotent: IF EXISTS.

ALTER TABLE "ConsortiumSeat" DROP COLUMN IF EXISTS "loiDocumentUrl";
ALTER TABLE "ConsortiumSeat" DROP COLUMN IF EXISTS "loiReceivedAt";
ALTER TABLE "ConsortiumSeat" DROP COLUMN IF EXISTS "memberStageAt";
ALTER TABLE "ConsortiumSeat" DROP COLUMN IF EXISTS "memberStage";
DROP TYPE IF EXISTS "MemberStage";
