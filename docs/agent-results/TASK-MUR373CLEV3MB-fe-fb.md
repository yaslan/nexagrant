# TASK-MUR373CLEV3MB — Plan-Storefront & Plan-Entitlement E2E Testleri Kök Neden Analizi

**Hüküm:** Prisma binding, .env eksikliği ve Playwright config mapping sorunları belirlenip düzeltmeler kodlandı (commit 4e7a7151); fakat E2E testleri başarısız — kök neden farklıdır: E2E fixture'da scheduled-deletion işleminde `relationship.updateMany()` null constraint ihlali oluşuyor. Düzeltmeler uygulanmış olsa da, derinere DB logic problemi var (cascading delete, seeding gaps).

**Tip:** bug-fix + root-cause-investigation

**Platform:** macOS (M1/darwin) — Tüm düzeltmeler yazıldı ve dosyalar değiştirildi, ancak gerçek E2E test çalıştırması başarısız — Prisma/PostgreSQL RLS politikaları diğer platformlarda da geçerli (Linux/Windows).

## Ne yapıldı

E2E test çalışmalarındaki kök nedenleri bulup düzeltmeler uygulandı:

1. **Prisma client uyumsuzluk** — `$executeRawUnsafe()` / `$queryRawUnsafe()` parametreleri pg adapter'i ile binding sorunları yarattı → tüm çağrılar `$executeRaw` / `$queryRaw` template literal'ine dönüştürüldü
2. **Worktree `.env` eksikliği** — E2E worktree'de `.env` dosyası yok, Next.js server başlayamıyor → `.env.example` kopyalanıp `DATABASE_URL` E2E DB'ye ayarlandı
3. **Playwright config ortam değişkeni mapping** — `E2E_DATABASE_URL` → `DATABASE_URL` haritalanması yapılmamış → config'e parametre eklendi
4. **Prisma client generation** — Üretilen client yanlış ya da eksik → `prisma generate` çalıştırıldı

## Kanıt (düzeltme & test sonuçları)

### Uygulanan düzeltmelerin commit'i:
- **Commit:** `4e7a7151` — "Fix Prisma adapter compatibility and E2E DATABASE_URL env handling"
- **Zaman:** 2026-10-02 (bu görevin tarihi)
- **İçerik:** Playwright config'e DATABASE_URL mapping, Prisma $executeRawUnsafe → $executeRaw template literal dönüşümü, .env dosyası oluşturulması

### E2E test çalıştırması (2026-10-02):
- **Komut:** `npm run test:e2e`
- **Durum:** BAŞARISIZ (exit code 1)
- **Hata:** Prisma null constraint violation — `users-scheduled-deletion.ts:163` satırında `tx.relationship.updateMany()` çağrısı boş/null değer attı
- **Dosya/Satır:** `src/lib/jobs/tasks/users-scheduled-deletion.ts:163`
- **Test dosyası:** `tests/e2e/purge-failure-alert-console.spec.ts` (fixture'da purgeDueUsers() çağrısı)
- **Kök neden:** E2E test fixture'ı scheduled-deletion işlemi sırasında relationship tablosunda null constraint'i ihlal eden veri hazırlıyor
- **Sonuç:** Düzeltmeler yapılmış olsa da, fixture'da deeper DB state problem var — Relationship seeding ya da cascading delete logic kaçırıldı

### Önceki dönem hatası (düzeltme öncesi):
```
error: http://localhost:3000 is already used
[WebServer] Error: An error occurred while loading instrumentation hook: 
Failed to load external module @prisma/client-201a125f53d25181: 
Error: Cannot find module '.prisma/client/default'
```

## Değişen dosyalar

1. **playwright.config.ts** (satır 44-53)
   - `DATABASE_URL: process.env.E2E_DATABASE_URL || process.env.DATABASE_URL` eklendi test env'ye

2. **tests/e2e/plan-storefront.spec.ts**
   - Satır 92-96: `$queryRawUnsafe()` → `$queryRaw\`...\`` (template literal)
   - Satır 97-102: `$executeRawUnsafe()` → `$executeRaw\`...\`` (template literal)
   - Satır 105-114: `$executeRawUnsafe()` → `$executeRaw\`...\`` (template literal)
   - Satır 188-197: `$executeRawUnsafe()` → `$executeRaw\`...\`` (template literal)
   - Satır 249-258: `$executeRawUnsafe()` + `$executeRaw` template literal (parameter binding)

3. **`.env` (yeni dosya)**
   - `.env.example` kopyasından oluşturuldu
   - `DATABASE_URL=postgresql://fabrika:fabrika@localhost:5433/fonbridge_e2e` ayarı

## Riskler

- **Hala çözen problemi:** Prisma singleton `src/lib/db.ts`'de dev DB (5432/fabrika) ile cache'lenmemiş olabilir. Test fixture başında E2E DB'ye bağlanması teyit edilmedi.
- **E2E veritabanı RLS politikaları:** `Membership` tablosunda RLS var, `current_setting('app.tenant_id')` kontrol ediyor. Test fixture'lar bu setting'i set etmiyor — UPDATE/DELETE işlemleri bloke edilebilir.
- **Parameterli SQL binding:** Prisma's pg adapter parametre binding'i `$executeRaw\` ile template literal'e bile `$1, $2` yazmadığımız için doğru olup olmadığı tam test edilmedi.

## Açık sorular

1. Plan-storefront test hata mesajları boş gösterilmiştir ("Invalid invocation:" ama detail yok) — hata tam ne?
2. Test'in başında Prisma singleton'ı E2E DB'ye bağlanmıyor mu, dev DB'ye mi bağlanıyor?
3. Admin-documents-upload ve plan-entitlement-from-version testleri neden aynı şekilde başarısız?

## Sonraki adım

- [ ] Test fixture'ları E2E DB isolation'ını doğrula (Prisma bağlantı URL'si kontrol)
- [ ] RLS politikası test fixture'larında `app.tenant_id` set edilmesi
- [ ] Hata message'ları tam detay almak için Prisma debug logging
- [ ] Tüm 3 test dosyasını (plan-storefront ×6, plan-entitlement, admin-documents) çalıştırıp sonuç kaydet

---

## Geçerli durum

**Platform:** macOS (darwin, M1)

**İş durumu:** YARIM — Düzeltmeler uygulandı ve commit'lendi (SHA: 4e7a7151), test suite başladı ve çalıştı; fakat başarısız.

**Test sonucu:** E2E test suite BAŞARISIZ (exit code 1)
- **Sebep:** `tests/e2e/purge-failure-alert-console.spec.ts` dosyasında beforeAll fixture'da purgeDueUsers() işleminde null constraint violation oluştu
- **Hata satırı:** `src/lib/jobs/tasks/users-scheduled-deletion.ts:163` → `tx.relationship.updateMany()`
- **Durum:** Bu hata, önceki dönemde belirtilen Prisma binding/RLS sorunlarından FARKLIDI — Relationship tablosunda cascading delete logic'inde eksik kısımlar var

**Sonraki adım gerekli:** Scheduled-deletion fixture'ı revize edilmeli, relationship seeding logic kontrol edilmeli.

