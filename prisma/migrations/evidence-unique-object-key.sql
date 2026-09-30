-- ─────────────────────────────────────────────────────────────────────────────
-- evidence-unique-object-key.sql — TASK-MUNTTZ94LJWBC (İNCELEME-66 D-3)
--
-- Purpose: an uploaded evidence file could be confirmed twice under the same
-- object key. Two "Evidence" rows then named one stored object, and deleting
-- either row removed the file the other still pointed at.
-- confirmEvidenceUploadAction now inserts the row before it copies the upload
-- to its final key; this index makes the second insert fail (P2002), also when
-- two confirms run at the same time, and the action answers
-- `already_confirmed`.
--
-- After this file:
--   * UNIQUE index "Evidence_tenantId_r2ObjectKey_key" on
--     ("tenantId", "r2ObjectKey") — the name `prisma db push` gives
--     @@unique([tenantId, r2ObjectKey]), so the two agree. NULL keys (rows
--     without a file) stay unrestricted: NULLs are distinct in Postgres.
--
-- Existing duplicates: this file does NOT merge or delete rows. When a tenant
-- already has two rows with one key, it stops with an error that names how
-- many keys are affected; decide per pair which row keeps the key (the other's
-- "r2ObjectKey" set to NULL keeps its metadata and claim links) and run again.
--
-- RLS: untouched; "Evidence" stays in prisma/rls.sql's tenant-isolated list.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS; the duplicate check reads only.
--
-- Rollback: prisma/migrations/evidence-unique-object-key.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  dup integer;
BEGIN
  SELECT count(*) INTO dup
    FROM (
      SELECT 1
        FROM "Evidence"
       WHERE "r2ObjectKey" IS NOT NULL
       GROUP BY "tenantId", "r2ObjectKey"
      HAVING count(*) > 1
    ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'evidence-unique-object-key: % object key(s) are recorded by more than one "Evidence" row of the same tenant; resolve them first (see this file''s header)', dup;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "Evidence_tenantId_r2ObjectKey_key"
  ON "Evidence" ("tenantId", "r2ObjectKey");
