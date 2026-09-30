-- ─────────────────────────────────────────────────────────────────────────────
-- evidence-unique-object-key.down.sql — rollback for evidence-unique-object-key.sql
--
-- Drops the unique index. Nothing is lost; a double confirm can again make two
-- rows for one stored object (İNCELEME-66 D-3) — the action's `already_confirmed`
-- answer depends on this index.
--
-- Idempotent: DROP INDEX IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "Evidence_tenantId_r2ObjectKey_key";
