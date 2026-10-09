---
hüküm: ONAY
tip: E2E test fix — session user minting
platform: macOS 27.0.0 / zsh / Playwright chromium
---

# TASK-MUR373CLEV3MB İnceleme — crw2-fb

## 1. Ne İncelendi

Commit 56aa5b28 ("test(e2e): plan/admin specs sign in as the seeded platform admin") — 4 E2E spec'te session user ID ve 1 URL değişikliği.

**Raporlar:**
- docs/agent-results/TASK-MUR373CLEV3MB-fe-fb-2.md — Prisma SQL fix (4e7a7151)
- docs/agent-results/TASK-MUR373CLEV3MB-fe-fb-3.md — fe-fb'nin tur 3 iması: 30 passed / 0 failed / 1 skipped

## 2. Doğrulama

### İddia: 30 passed / 0 failed / 1 skipped
**DOĞRULANMIŞ** ✓
```
Running 31 tests
[31/31] [chromium] › tests/e2e/purge-failure-alert-console.spec.ts:96:7 
1 skipped
30 passed (38.4s)
Exit: 0
```

Hedef spec'ler:
- plan-storefront.spec.ts: 10 passed ✓
- plan-entitlement-from-version.spec.ts: 3 passed ✓
- admin-documents-upload.spec.ts: 3 passed + 1 skipped ✓
- purge-failure-alert-console.spec.ts: 1 passed ✓
- admin-plan-editor.spec.ts: 13 passed ✓

Atlanan test: `admin-documents-upload.spec.ts:153` — bilinçli opt-in (E2E_LIVE_EMBED=1 gerekli, OpenAI maliyeti).

### İddia: P2011 spec'in bilerek ürettiği hata

**DOĞRULANMIŞ** ✓

`tests/e2e/purge-failure-alert-console.spec.ts` kodu:
- Satır 71: `ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" SET NOT NULL` ← spec yapıyor
- Satır 73: `await purgeDueUsers()` ← null kısıt hatası üretmesi bekleniyor
- Satır 74: `expect(out.failedCount).toBe(1)` ← failure bekleniyor
- Satır 76: `DROP NOT NULL` ← geri alıyor

Test çıktısı:
```
[users-scheduled-deletion] failed for user purge-alert-s-…: 
PrismaClientKnownRequestError: Null constraint violation
code: 'P2011'
```

Kolon tanımı (E2E DB doğrulaması):
```sql
\d "Relationship" → ownerUserId | text | nullable ✓
prisma migrate diff → empty migration (schema sync'i)
```

Sonuç: P2011 spec'in bilerek dizaynı. Hata değil.

### İddia: Session user 'demo-user-admin' → 'demo-user-superadmin'

**DOĞRULANMIŞ** ✓

Değişen spec'ler:
- plan-storefront.spec.ts:51
- plan-entitlement-from-version.spec.ts:57, 67
- admin-plan-editor.spec.ts:30, 277 (assertion güncelleme)
- admin-documents-upload.spec.ts:27

**Kök Neden:** d57f13f1'den sonra JWT callback DB'den re-read yapıyor. 'demo-user-admin' seed'de asla oluşturulmadığı için kiracısız oturum → 401.

**Düzeltme Kanıtı:**
```bash
$ grep -r "demo-user-superadmin\|demo-user-admin" prisma/
prisma/seed-tenant-workspace.ts:  id: 'demo-user-superadmin',
```

Seeded demo-user-superadmin:
- User: `isPlatformAdmin: true` ✓
- Membership: `tenantId='demo-tenant', role='TENANT_OWNER'` ✓
- Subscription: `status='ACTIVE'` ✓

Test JWT token vs seeded data:
```
Token: { sub: 'demo-user-superadmin', role: 'SUPER_ADMIN', isPlatformAdmin: true }
DB: User.isPlatformAdmin=true, Membership.role='TENANT_OWNER'
Session: JWT callback her request'te DB'den re-read (d57f13f1)
```

Sonuç: Hem platform admin hem tenant owner yetkisine sahip, testler platform admin access'i doğru test ediyor.

### İddia: /tr/admin URL eksik

**DOĞRULANMIŞ** ✓

`admin-documents-upload.spec.ts:108` değişiklik:
```diff
- await page.goto('/tr/admin');  // 404, no page
+ await page.goto('/tr/admin/modules');  // valid, admin menu shows
```

Sonraki step: `getByRole('link', { name: /Belgeler \(K6 RAG\)/ })` — menü linki click ediliyor. Navigasyon yolu korunuyor.

Uygulama sonuç kodu:
- `/tr/admin` → 404 (sayfa yok)
- `/tr/admin/modules` → admin menu page (valid)
- Sidebar link: `/${locale}/admin/modules` (ürün kodu SidebarNav.tsx:40-42)

Test amacı: K6 RAG documents screen render ve accessible olması. URL değişikliği sadece erişim yolunu düzeltiyor.

### İddia: Test Weakening yok

**DOĞRULANMIŞ** ✓

Scan: test.only, test.skip (bilinçli olan hariç), test.setTimeout, assertion weakening

Bulgu: `admin-documents-upload.spec.ts:154` — `test.setTimeout(120_000)` (upload timeout, legitimate).

Hiçbir assertion gevşetilmedi. admin-plan-editor.spec.ts:277 actorId beklentisi kullanıcı adını güncelliyor (strength korunuyor).

## 3. Değişen Dosyalar

- `tests/e2e/admin-documents-upload.spec.ts` — session ID, URL
- `tests/e2e/admin-plan-editor.spec.ts` — session ID, assertion
- `tests/e2e/plan-entitlement-from-version.spec.ts` — session ID (2 yerde)
- `tests/e2e/plan-storefront.spec.ts` — session ID

Ürün kodu, global-setup, CI, seed: dokunulmadı.

## 4. Riskler

**Risk Seviyesi: Düşük**

- Değişiklik: test kimliği ve giriş URL'i (E2E scope)
- Seeded user var: ✓ demo-user-superadmin seed'leniyor (db:seed)
- Rollback: basit (user ID ve URL değişikliği, reversible)
- Prod etki: yok (test-only)

**Kenar Durum (Purge Spec)**
- Spec kolon NOT NULL→DROP NOT NULL geçişi yapıyor
- Süreç öldürülürse kolon NOT NULL kalabilir → sonraki koşuda `\d "Relationship"` kontrol yeterli
- Çalıştığımızda geri alındı ✓

## 5. Sonraki Adım

- ✓ Tests: 30 passed / 0 failed / 1 skipped (doğrulandı)
- ✓ P2011: intentional (doğrulandı)
- ✓ Seed: demo-user-superadmin exists (doğrulandı)
- ✓ No weakening (doğrulandı)

**Karar: ONAY — fe-fb/plan-e2e-red dev'e merge ✓**

---
Platform: macOS / Darwin 27.0.0, Playwright chromium, Postgres localhost:5433/fonbridge_e2e — tüm hedef testler koştu ve geçti. Değişiklik platformdan bağımsız (test kimliği dizgisi + URL).
