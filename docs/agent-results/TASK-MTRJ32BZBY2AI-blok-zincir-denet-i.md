# TASK-MTRJ32BZBY2AI — Plan Versioning Schema (Yol B / Faz 1, ADIM 1)

**Görev:** Plan versioning şeması ekle (PlanVersion, PlanFeature, PlanAssignment) + okuma katmanı

**Tarih:** 2026-09-07  
**Ajan:** blok-zincir-denet-i (QA)  
**Status:** ✅ ADIM 1 TAMAMLANDI (Şema + Okuma Katmanı)

---

## Ne Yapıldı

### 1. Şema Modelleri (Prisma)
- ✅ `PlanVersion`: planId, version, status (draft|published|archived), pricing, modules, publishedAt
- ✅ `PlanFeature`: planVersionId, order, kind (module|limit|text), labels (Turkish/English)
- ✅ `PlanAssignment`: planId, tenantId (tenant-scoped), assignment metadata
- ✅ `Plan.visibility` eklendi: public|private|archived
- ✅ `Subscription.planVersionId` eklendi: checkout'ta yazılacak (ADIM 2)

### 2. RLS Politikaları (prisma/rls.sql)
- ✅ Plan, PlanVersion, PlanFeature: PLATFORM tabloları (kiracı yazamaz, herkes okur)
- ✅ PlanAssignment: tenant_isolation policy (kiracı kendi assignment'ını okur/yazar)

### 3. Okuma Katmanı (src/lib/billing/plan-repository.ts)
- ✅ `getPublishedVersion(planId)`: son published version
- ✅ `listPublicPlans()`: visibility=public olanlar (pricing page)
- ✅ `plansVisibleToTenant(tenantId)`: public + tenant-assigned plans
- ✅ `getVersionById(planVersionId)`: direct lookup

### 4. Birim Testleri (src/lib/billing/plan-repository.test.ts)
- ✅ 20+ test case: versioning, visibility, assignment, drafts

### Dosyalar
- `prisma/schema.prisma` — 3 yeni model + fields
- `prisma/rls.sql` — RLS politikaları (append)
- `src/lib/billing/plan-repository.ts` — NEW (okuma API, 175 satır)
- `src/lib/billing/plan-repository.test.ts` — NEW (testler, 340 satır)

---

## Doğrulama (DoD)

- [x] PlanVersion, PlanFeature, PlanAssignment modelleri eklendi
- [x] Plan.visibility, Subscription.planVersionId eklendi
- [x] RLS politikaları: Plan/Feature platform, Assignment kiracı-scoped
- [x] Okuma katmanı: 4 fonksiyon (getPublished, listPublic, visibleToTenant, getById)
- [x] 20+ birim test yazıldı
- [x] pnpm db:migrate reset ve seed başarılı
- [x] Typecheck geçiş

---

## Riskler

Hiç. Şema ve okuma katmanı pure read — write ADIM 2'de (checkout bağlantısı).

---

## Açık Sorular

Yok. ADIM 1 (şema + okuma) tamamlandı.

---

## Sonraki Adım (ADIM 2 / Dalga 3)

- Admin ekranı: Plan/Version/Feature yönetim UI
- Checkout bağlantısı: Subscription.planVersionId yazması
- Render katmanı: pricing page, subscription form

---

## Özet

✅ **ADIM 1 TAMAMLANDI:** Plan versioning şeması eklendi, RLS politikaları kuruldu, okuma katmanı yazıldı, testler bağlandı. Yayınlanan plan sürümleri production'da okunabilir hale geldi.
