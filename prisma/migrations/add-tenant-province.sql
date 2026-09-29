-- ─────────────────────────────────────────────────────────────────────────────
-- add-tenant-province.sql — TASK-MULV3JXS1AW5X (FB KAMU, il kırılımı)
--
-- Purpose: the agency funnel (B2) and the regional report (B3) break numbers
-- down by province, and the province was stored nowhere: Tenant had only
-- `country`. LEED-FB decision (2026-09-29): a nullable column, not a key in
-- Tenant.settings.
--
-- Value: the province NAME exactly as src/lib/readiness/provinces.ts
-- (TR_PROVINCES) spells it — 'İstanbul', 'Şanlıurfa' — not the plate code.
-- The scorecard (`?il=Samsun` in its share link) and the public-sector catalogue
-- (`turkeyRegions`) already use those names, so one dictionary serves all three
-- and nothing has to translate between a code and a name. The CHECK below holds
-- the same 81 names; src/lib/province.test.ts fails if the two lists
-- ever drift apart.
--
-- NULL means "not given": the question is optional at registration and is only
-- asked for Turkish organisations. A non-TR tenant always has NULL here.
--
-- KVKK: a province is a property of the organisation, not of a person — no
-- personal data is added. Tenant is a system-wide table outside
-- tenant_isolation (it has no tenantId column; scripts/rls-models.ts), so no
-- policy is needed or added.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the constraint is dropped and
-- re-added by name. Running it twice changes nothing. No existing row is
-- touched (every row starts at NULL, which the CHECK allows).
--
-- Rollback: prisma/migrations/add-tenant-province.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "province" text;

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_province_check";
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_province_check" CHECK (
  "province" IS NULL OR "province" IN (
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

COMMENT ON COLUMN "Tenant"."province" IS 'Turkish province of the organisation, spelled as TR_PROVINCES (src/lib/readiness/provinces.ts). NULL = not given / not in Türkiye. Organisation data, not personal data. TASK-MULV3JXS1AW5X.';
