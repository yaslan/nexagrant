-- ─────────────────────────────────────────────────────────────────────────────
-- add-consortium-seat-member-stage.sql — NG-364 (NG-20 F1/F2/F4/F11, K-586296 = B)
--
-- Purpose: the consortium screen shows four member stages (interested → met → letter of intent →
-- confirmed) and G1 asks for the letters of intent (spec §12). SeatStatus cannot tell "interested"
-- from "met" (both are INVITED) and nothing held a letter. Per decision B the seat row carries them:
--
--   memberStage     MemberStage (INTERESTED | MET | LOI | CONFIRMED); NULL = no stage recorded
--   memberStageAt   when the stage last moved
--   loiReceivedAt   when the member's letter of intent arrived
--   loiDocumentUrl  where the letter is kept (https only, checked by the action)
--
-- No new table, SeatStatus unchanged. Existing rows: all four columns NULL, i.e. no stage and no
-- letter. G1 therefore refuses a critical seat without a letter until one is recorded (G1_NO_LOI),
-- but only when `requireLetterOfIntentForCriticalSeats` is on (off by default, owner decision
-- 25.11.2026); with the shipped default these NULLs stop nothing.
--
-- RLS: no new table. ConsortiumSeat already carries tenant_isolation (prisma/rls.sql); the new
-- columns are covered by it.
--
-- Additive and idempotent: the enum is created only if missing (duplicate_object), every column
-- with ADD COLUMN IF NOT EXISTS, all nullable with no default (no table rewrite). A second run
-- changes nothing. Rollback: add-consortium-seat-member-stage.down.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "MemberStage" AS ENUM ('INTERESTED', 'MET', 'LOI', 'CONFIRMED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "ConsortiumSeat" ADD COLUMN IF NOT EXISTS "memberStage" "MemberStage";
ALTER TABLE "ConsortiumSeat" ADD COLUMN IF NOT EXISTS "memberStageAt" TIMESTAMP(3);
ALTER TABLE "ConsortiumSeat" ADD COLUMN IF NOT EXISTS "loiReceivedAt" TIMESTAMP(3);
ALTER TABLE "ConsortiumSeat" ADD COLUMN IF NOT EXISTS "loiDocumentUrl" TEXT;
