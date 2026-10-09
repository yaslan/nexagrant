-- ─────────────────────────────────────────────────────────────────────────────
-- hash-bearer-tokens.sql — TASK-MULQLL2T8ZJX4 (ROADMAP open decision #12 §8.3)
--
-- Purpose: `ApplicationPart.magicToken` (the consortium partner portal link)
-- and `Invitation.token` (the invite link) were stored as plain text. Whoever
-- could read the database — a backup, a dump, a read-only replica — could open
-- every partner portal and accept every pending invitation. They now follow
-- the `ApiKey.keyHash` pattern: only SHA-256(raw token) as lowercase hex is
-- stored (src/lib/secret-token.ts), in new columns
-- `ApplicationPart.magicTokenHash` and `Invitation.tokenHash`, and the plain
-- columns are dropped.
--
-- Existing rows: HASHED IN PLACE, not invalidated. `sha256(convert_to(t,
-- 'UTF8'))` in Postgres is byte-for-byte what `createHash('sha256').update(t,
-- 'utf8')` gives in Node, so every partner link and invite link already handed
-- out keeps working after this file runs. Invalidating them instead would buy
-- nothing against a leak that already happened (whoever copied a plain token
-- before today still holds it either way — rotate the link in the UI for that)
-- and would break links sent to beta partners.
--
-- Idempotency: every step is guarded on the columns that exist.
--   * Old database (plain column present): add hash column, backfill, drop the
--     plain column — in one transaction, so no half-migrated state is visible.
--   * Database built by `prisma db push` from the new schema (CI, fresh setup):
--     the plain columns never existed; the file is a no-op.
--   * Second run: same as the fresh case.
-- RLS: untouched. Both tables stay in prisma/rls.sql's tenant-isolated list;
-- the policies key on "tenantId", which this file does not touch.
--
-- Rollback: prisma/migrations/hash-bearer-tokens.down.sql (LOSSY — read it).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ApplicationPart.magicToken → magicTokenHash (nullable, unique)
ALTER TABLE "ApplicationPart" ADD COLUMN IF NOT EXISTS "magicTokenHash" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'ApplicationPart' AND column_name = 'magicToken'
  ) THEN
    UPDATE "ApplicationPart"
       SET "magicTokenHash" = encode(sha256(convert_to("magicToken", 'UTF8')), 'hex')
     WHERE "magicToken" IS NOT NULL AND "magicTokenHash" IS NULL;
    ALTER TABLE "ApplicationPart" DROP COLUMN "magicToken";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ApplicationPart_magicTokenHash_key"
  ON "ApplicationPart" ("magicTokenHash");

-- Invitation.token → tokenHash (NOT NULL, unique)
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Invitation' AND column_name = 'token'
  ) THEN
    UPDATE "Invitation"
       SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
     WHERE "tokenHash" IS NULL;
    ALTER TABLE "Invitation" DROP COLUMN "token";
  END IF;
END $$;

ALTER TABLE "Invitation" ALTER COLUMN "tokenHash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_tokenHash_key"
  ON "Invitation" ("tokenHash");

COMMENT ON COLUMN "ApplicationPart"."magicTokenHash" IS 'SHA-256 hex of the partner portal token. The raw token is shown once and never stored (TASK-MULQLL2T8ZJX4).';
COMMENT ON COLUMN "Invitation"."tokenHash" IS 'SHA-256 hex of the invite link token. The raw token is shown once and never stored (TASK-MULQLL2T8ZJX4).';

COMMIT;
