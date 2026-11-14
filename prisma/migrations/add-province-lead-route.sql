-- ─────────────────────────────────────────────────────────────────────────────
-- add-province-lead-route.sql — NG-167 (M18 · il → danışmanlık kuruluşu eşlemesi)
--
-- Purpose (patron kararı): a lead from the readiness scorecard goes to the consultancy
-- tenant that serves the visitor's province. "ProvinceLeadRoute" is that map:
-- province → target tenant. It is PLATFORM data managed by the platform admin, not
-- tenant business data: its column is `targetTenantId` (the receiver), deliberately not `tenantId`: it owns nothing.
--
-- RLS decision (explicit): ON, one policy `system_scope` (same standing as
-- ExpertFounderCounter). A tenant user — even the target tenant's — reads 0 rows and
-- cannot insert: the map says which other consultancies serve which provinces. Only code
-- inside withSystemScope() (platform-admin console, the lead forwarder) reaches it.
-- The table is listed in scripts/rls-models.ts SYSTEM_WIDE + SYSTEM_SCOPE_POLICY, so it
-- is not subject to the tenant_isolation gate (it has no tenantId, only a target).
--
-- Invariant: a province maps to at most ONE ACTIVE tenant (partial unique index); a
-- tenant may serve many provinces. Province spelling = TR_PROVINCES (CHECK below,
-- pinned by src/lib/leads/province-route.test.ts).
--
-- PublicLead (SYSTEM_WIDE, no RLS) gets four nullable columns recording the routing
-- outcome: routeStatus 'routed' | 'unmatched', routeReason, routedTenantId, routedAt.
-- 'unmatched' is the platform-admin worklist; nothing is forwarded for those.
--
-- Additive + idempotent: IF NOT EXISTS, constraints/policies dropped and re-added by
-- name. No existing row is touched.
-- Rollback: prisma/migrations/add-province-lead-route.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProvinceLeadRoute" (
    "id"        TEXT NOT NULL,
    "province"  TEXT NOT NULL,
    "targetTenantId" TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProvinceLeadRoute_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProvinceLeadRoute_targetTenantId_fkey') THEN
    ALTER TABLE "ProvinceLeadRoute" ADD CONSTRAINT "ProvinceLeadRoute_targetTenantId_fkey"
      FOREIGN KEY ("targetTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ProvinceLeadRoute" DROP CONSTRAINT IF EXISTS "ProvinceLeadRoute_province_check";
ALTER TABLE "ProvinceLeadRoute" ADD CONSTRAINT "ProvinceLeadRoute_province_check" CHECK (
  "province" IN (
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya',
    'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir',
    'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis',
    'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
    'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan',
    'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
    'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş',
    'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis',
    'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya',
    'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
    'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya',
    'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas',
    'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van',
    'Yalova', 'Yozgat', 'Zonguldak'
  )
);

-- One ACTIVE tenant per province. Inactive rows are history and may repeat.
CREATE UNIQUE INDEX IF NOT EXISTS "ProvinceLeadRoute_province_active_key"
  ON "ProvinceLeadRoute" ("province") WHERE "active";
CREATE INDEX IF NOT EXISTS "ProvinceLeadRoute_targetTenantId_idx" ON "ProvinceLeadRoute" ("targetTenantId");

-- Routing outcome on the lead.
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "routeStatus"     TEXT;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "routeReason"     TEXT;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "routedTenantId"  TEXT;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "routedAt"        TIMESTAMP(3);
ALTER TABLE "PublicLead" DROP CONSTRAINT IF EXISTS "PublicLead_routeStatus_check";
ALTER TABLE "PublicLead" ADD CONSTRAINT "PublicLead_routeStatus_check"
  CHECK ("routeStatus" IS NULL OR "routeStatus" IN ('routed', 'unmatched'));
CREATE INDEX IF NOT EXISTS "PublicLead_routeStatus_createdAt_idx" ON "PublicLead" ("routeStatus", "createdAt");

-- RLS: system_scope only (see header). Needs prisma/rls.sql's system_scope_open; the
-- same block in prisma/rls.sql creates the policy on `pnpm db:rls` when it ran later.
DO $$
BEGIN
  IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
    ALTER TABLE "ProvinceLeadRoute" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_scope ON "ProvinceLeadRoute";
    CREATE POLICY system_scope ON "ProvinceLeadRoute"
      USING ((SELECT public.system_scope_open('"ProvinceLeadRoute"'::regclass)))
      WITH CHECK ((SELECT public.system_scope_open('"ProvinceLeadRoute"'::regclass)));
  ELSE
    RAISE NOTICE 'add-province-lead-route: system_scope_open missing (rls.sql not yet applied); RLS left as it is';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProvinceLeadRoute" TO fabrika_app;
  END IF;
END $$;
