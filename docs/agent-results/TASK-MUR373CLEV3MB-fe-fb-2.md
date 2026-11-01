---
hüküm: Kısmen — Seeding çalışıyor; UI fixture eksik
tip: E2E Test Fix — Prisma Adapter
platform: macOS 27.0.0 / zsh
---

## Ne Yapıldı

E2E plan-storefront test suite seeding hatalarını çözdü (Prisma adapter compatibility & env visibility).

### Bulgu & Düzeltme

**Kök Neden (Tur 1'in Telafisi)**
- Spec'teki `$executeRawUnsafe()` / `$queryRawUnsafe()` → Prisma adapter hatası ("Invalid invocation")
- Playwright runner process'inin DATABASE_URL env'i eski (.env default), E2E_DATABASE_URL override görmüyordu
- `src/lib/db.ts` module load'ında connectionString sabit okunuyor → test-specific DB URL görmüyordu

**Düzeltme**
1. **Prisma SQL template literals** (plan-storefront.spec.ts):
   - `$queryRawUnsafe(...sql, ...params)` → `$queryRaw\`...\`` (template literal)
   - `$executeRawUnsafe(...sql, ...params)` → `$executeRaw\`...\`` (template literal)
   - Parametreler `${variable}` syntax'ı kullanıyor
   - ✓ Prisma 7.10 adapter-pg compliance

2. **ENV visibility fix** (playwright.config.ts):
   - E2E_DATABASE_URL env'i runner process'ine geçmiyordu (webServer'a değil)
   - Fix: `process.env.DATABASE_URL = process.env.E2E_DATABASE_URL` (config load'ında)
   - Spec import edince db.ts doğru connection string okusun
   - ✓ E2E_DATABASE_URL=localhost:5433/fonbridge_e2e runner'a visible

3. **TS Type Annotation** (webServer env):
   - `env: {...} as Record<string, string>` — undefined DATABASE_URL warning fix
   - ✓ typecheck clean

### Kanıt

**BAZ RUN** (değişiklikler öncesi, Prisma SQL hata):
```
Running 17 tests
  PrismaClientKnownRequestError: Invalid `prisma.$executeRawUnsafe()` invocation
  6 failed
    [chromium] › tests/e2e/admin-documents-upload.spec.ts:107
    [chromium] › tests/e2e/admin-documents-upload.spec.ts:128
    [chromium] › tests/e2e/plan-entitlement-from-version.spec.ts:121
    [chromium] › tests/e2e/plan-storefront.spec.ts:116 (public pricing page)
    [chromium] › tests/e2e/plan-storefront.spec.ts:207 (private plan hidden)
    [chromium] › tests/e2e/plan-storefront.spec.ts:273 (assigned tenant)
  1 passed
```

**SONRA RUN** (patch sonrası, Prisma SQL OK; UI fixture eksik):
```
Running 17 tests
  Error: expect(locator).toBeVisible() failed
  Locator: getByTestId('settings-plan-card-basic')
  Expected: visible
  Error: element(s) not found
  
  8 failed
    [chromium] › tests/e2e/admin-documents-upload.spec.ts:107 (element not found)
    [chromium] › tests/e2e/plan-entitlement-from-version.spec.ts:121 (seat count query)
    [chromium] › tests/e2e/plan-storefront.spec.ts:121 (billing panel quotes)
    [chromium] › tests/e2e/plan-storefront.spec.ts:158 (checkout charges)
    [chromium] › tests/e2e/plan-storefront.spec.ts:207 (private plan hidden — UX not data)
    [chromium] › tests/e2e/plan-storefront.spec.ts:219 (cannot buy)
    [chromium] › tests/e2e/plan-storefront.spec.ts:235 (public plans buyable)
    [chromium] › tests/e2e/plan-storefront.spec.ts:260 (assigned tenant sees plan)
  6 passed ← **İlerleme: Seeding SQL artık çalışıyor**
```

**Commit**: `4e7a7151` (fe-fb/plan-e2e-red)
```
$ git log --oneline -1
4e7a7151 Fix Prisma adapter compatibility and E2E DATABASE_URL env handling
```

## Değişen Dosyalar

- `playwright.config.ts` — E2E_DATABASE_URL → process.env override + TS type annotation
- `tests/e2e/plan-storefront.spec.ts` — $queryRaw/$executeRaw template literals + test.skip() removal

## Riskler

**Düşük Risk**
- Template literal migration: syntax tamamdır, Prisma docs compliance
- ENV fix: yalnız E2E context'inde çalışır, prod unaffected

**Açık Noktalar (Kalan Fail'ler)**
1. **Test Fixture Seeding Eksik**: demo-tenant subscription yoksa, plan listing sorgusu boş dönüyor
   - `plan-entitlement-from-version.spec.ts` kontrol: `if (!sub) throw new Error('demo-tenant has no subscription; run pnpm db:seed')`
   - Global setup veya test init'de demo-tenant + subscription created olmalı
   - Tur 1'de de bu sorun vardı; bu tur seeding SQL'i fixed oldu ✓

2. **admin-documents-upload.spec.ts:107 — Element Not Found**
   - admin documents (K6) page render sorunü veya fixture eksik
   - Unrelated to Prisma fix

3. **UI State Timing**: Plan veri yüklendikten sonra card render'ı gecikebiliyor
   - E2E test'ler UI ready signal'ı yerine hard-coded locator bekliyorlar

## Test Adımları

```bash
cd /Users/macbook/alan/FONBRIDGE-wt-fefb-plan-e2e
export E2E_PORT=3101
export E2E_DATABASE_URL=postgresql://fabrika:fabrika@localhost:5433/fonbridge_e2e
pnpm exec playwright test \
  tests/e2e/plan-storefront.spec.ts \
  tests/e2e/plan-entitlement-from-version.spec.ts \
  tests/e2e/admin-documents-upload.spec.ts \
  --reporter=line
```

## Sonraki Adım

1. **Fixture seeding** (bloke): demo-tenant + subscription global setup'ta oluştur
2. **UI element timing**: test'ler hydration guard'ını stronger yapar (toBeVisible vs toHaveCount=0)
3. **admin-documents upload**: türkçe/ingilizce rendering test — fixture veri export'ı kontrol et

---
✓ Build: typecheck clean, lint 0 errors
✓ Önceki tur yapısı (patch structure) validate oldu; tur 2'de seeding SQL'i fix'lenmiş, tur 3'te fixture seeding yapılacak
