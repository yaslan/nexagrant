-- Run with scripts/apply-migrations.sh --down <this file>; plain psql stops here (İNCELEME-115 Ö-2).
\set ON_ERROR_STOP on
\ir ../migration-down-guard.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- hash-bearer-tokens.down.sql — rollback for hash-bearer-tokens.sql
--
-- LOSSY. A hash cannot be turned back into the token, so the plain columns come
-- back holding the HASH, not the original token. Consequence after rollback:
--   * every partner portal link and every pending invite link issued so far
--     stops working (the URL carries the raw token, the column now holds its
--     hash) — rotate the portal links and re-send the invitations;
--   * the application code must be rolled back in the same deploy (it reads
--     the *Hash columns, which this file drops).
-- It restores the schema, not the credentials. Run it only together with a
-- code rollback to before TASK-MULQLL2T8ZJX4.
--
-- Idempotent: guarded on the columns that exist, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE "ApplicationPart" ADD COLUMN IF NOT EXISTS "magicToken" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'ApplicationPart' AND column_name = 'magicTokenHash'
  ) THEN
    UPDATE "ApplicationPart" SET "magicToken" = "magicTokenHash"
     WHERE "magicTokenHash" IS NOT NULL AND "magicToken" IS NULL;
    ALTER TABLE "ApplicationPart" DROP COLUMN "magicTokenHash";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ApplicationPart_magicToken_key" ON "ApplicationPart" ("magicToken");

ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "token" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Invitation' AND column_name = 'tokenHash'
  ) THEN
    UPDATE "Invitation" SET "token" = "tokenHash" WHERE "token" IS NULL;
    ALTER TABLE "Invitation" DROP COLUMN "tokenHash";
  END IF;
END $$;

ALTER TABLE "Invitation" ALTER COLUMN "token" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation" ("token");

COMMIT;
