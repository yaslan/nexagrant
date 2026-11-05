-- ─────────────────────────────────────────────────────────────────────────────
-- add-pic-lookup-budget.sql — FO-389 (PIC question: shared daily budget)
--
-- Purpose: the profile form answers "is this PIC already held by another
-- account?", and the CORDIS list of PICs is public, so the answer tells who our
-- customers are (FO-386). A per-user limit is beaten by opening accounts. This
-- table holds ONE number per UTC day: how many such questions accounts with no
-- agency invitation, no pilot and no paid plan have asked between them. Past the
-- ceiling (PIC_UNSOLICITED_LOOKUPS_PER_DAY, src/lib/pic.ts) they all get the
-- same refusal, whatever PIC was asked. Invited, pilot and paid tenants never
-- touch it.
--
-- Shape: global like PlatformSetting: no tenantId, no policy, SYSTEM_WIDE in
-- scripts/rls-models.ts, RLS DISABLEd right after CREATE (Supabase ensure_rls;
-- CHECK 4c). It holds a count and a date, no tenant or personal data. It lives in
-- the database, so a restart does not reset it and N processes share one count.
--
-- Written only by src/lib/pic-budget.ts, in one atomic upsert:
--   INSERT … ON CONFLICT (day) DO UPDATE SET count = count + 1 WHERE count < ceiling
-- Rows are tiny (one per day) and kept as a record of how hard the oracle was
-- pushed; the app role cannot DELETE them.
--
-- Idempotent: IF NOT EXISTS, DISABLE RLS, guarded GRANT.
-- Rollback: add-pic-lookup-budget.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PicLookupBudget" (
  "day"       TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PicLookupBudget_pkey" PRIMARY KEY ("day")
);
ALTER TABLE "PicLookupBudget" DISABLE ROW LEVEL SECURITY;  -- policy-less by design (rls-models.ts SYSTEM_WIDE)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "PicLookupBudget" TO fabrika_app;
    -- Default privileges hand DELETE at CREATE TABLE; a deleted day would reset the count.
    REVOKE DELETE, TRUNCATE ON "PicLookupBudget" FROM fabrika_app;
  END IF;
END $$;
