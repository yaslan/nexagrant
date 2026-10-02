---
hüküm: ONAY — hedef 5 spec 30 passed / 0 failed / 1 skipped (opt-in canlı embedding testi); purge "null kısıt hatası" bir hata değil, spec'in bilerek ürettiği P2011
tip: E2E test düzeltmesi (kök neden: spec oturum kimliği + yanlış giriş URL'i)
platform: mac (macOS / Darwin 27.0.0, zsh, Playwright chromium, Postgres localhost:5433/fonbridge_e2e)
---

# TASK-MUR373CLEV3MB tur 3 — fe-fb

## 1. Ne yapıldı

### Lider hipotezi doğrulandı → TUTMADI
- E2E DB'de `\d "Relationship"`: `ownerUserId | text | | |` → **zaten nullable**. `relationship-owner-nullable.sql` uygulanmış.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` (DATABASE_URL = fonbridge_e2e) → `-- This is an empty migration.` E2E DB kolon/nullability düzeyinde şemayla birebir; **eksik el-yazımı migration yok**.
- CI zinciri zaten tam: `.github/workflows/ci.yml:101-107` → `prisma db push → db:rls-role → scripts/apply-migrations.sh ×2 → db:rls → db:seed`. Kurulacak eksik adım yok.
- Null kısıt hatasının gerçek kaynağı: `tests/e2e/purge-failure-alert-console.spec.ts:71` testin kendisi `ALTER … "ownerUserId" SET NOT NULL` yapıyor, `purgeDueUsers()`'ın **başarısız olmasını** (`failedCount === 1`) bekliyor, `finally`'de `DROP NOT NULL` ile geri alıyor. Logdaki `NullConstraintViolation / P2011` testin ürettiği beklenen hata; test ekranda P2011'i arıyor. Bu spec ilk koşuda da **geçiyordu**.

### Gerçek kök neden 1 — oturum token'ı DB'de olmayan kullanıcı için basılıyor (7 kırmızı)
- 4 spec (`plan-storefront`, `plan-entitlement-from-version`, `admin-documents-upload`, `admin-plan-editor`) JWT'yi `id: 'demo-user-admin'` ile basıyordu. Bu id'yi hiçbir seed oluşturmamış (`git log -S "'demo-user-admin'" -- prisma src scripts` boş). Seed'deki platform yöneticisi `demo-user-superadmin` (aynı e-posta `admin@yasinaslan.com.tr`, `isPlatformAdmin=t`, demo-tenant `TENANT_OWNER`; `prisma/seed-tenant-workspace.ts:65`, `db:seed` → `prisma/seed.ts:390`).
- `d57f13f1` (2026-09-30, "jwt callback re-reads role and tenant on every request") sonrası callback üyeliği DB'den çözüyor → var olmayan kullanıcı = kiracısız oturum. Ekran görüntüsü: "Henüz bir çalışma alanınız yok"; API çağrıları 401. Spec'ler bu commit'ten önce (07–29.09) yazılmış.
- Düzeltme: 4 spec'te `'demo-user-admin'` → `'demo-user-superadmin'`. Tek assertion değişikliği `admin-plan-editor.spec.ts:277` audit `actorId` beklentisi (aynı kullanıcıyı adlandırıyor). Fixture/assert gevşetilmedi, global-setup'a dokunulmadı.

### Gerçek kök neden 2 — `/tr/admin` hiç var olmamış sayfa (1 kırmızı)
- `admin-documents-upload.spec.ts:108` `page.goto('/tr/admin')` → 404 (ekran görüntüsü "Sayfa Bulunamadı", admin menüsü yok). `src/app/[locale]/admin/page.tsx` ne bugün ne spec'in girdiği `935ef391`'de var; doğuştan kırık adım.
- Ürünün admin giriş noktası `SidebarNav.tsx:40-42` → `/${locale}/admin/modules`; `/admin` köküne link veren yer yok.
- Düzeltme: spec `/tr/admin/modules`'a gidip yine admin menüsündeki "Belgeler (K6 RAG)" linkine tıklıyor; "menüden bağlı" kanıtı aynen korunuyor.

### Tur 2 raporunun düzeltilmesi
`-fe-fb-2.md` "demo-tenant aboneliği/fixture eksik" diyordu — **yanlış**. E2E DB'de `Subscription demo-tenant|ACTIVE`, 7 Plan, 11 User, 11 Membership var. Kırmızıların nedeni yukarıdaki kimlik uyuşmazlığıydı.

## 2. Kanıt

Koşu komutu (üç koşuda aynı):
```
cd /Users/macbook/alan/FONBRIDGE-wt-fefb-plan-e2e
export E2E_PORT=3101 E2E_DATABASE_URL=postgresql://fabrika:fabrika@localhost:5433/fonbridge_e2e
pnpm exec playwright test tests/e2e/plan-storefront.spec.ts tests/e2e/plan-entitlement-from-version.spec.ts \
  tests/e2e/admin-documents-upload.spec.ts tests/e2e/purge-failure-alert-console.spec.ts [tests/e2e/admin-plan-editor.spec.ts] --reporter=line
```

| Koşu | Kapsam | Sonuç |
|---|---|---|
| 1 — baz (HEAD 4e7a7151) | 4 hedef spec, 18 test (admin-plan-editor hariç) | `8 failed · 1 skipped · 7 passed (2.3m)` — purge **geçti** |
| 2 — kimlik düzeltmesi | +admin-plan-editor, 31 test | `1 failed · 1 skipped · 29 passed (1.6m)` — kalan: admin-documents-upload:107 (`/tr/admin` 404) |
| 3 — URL düzeltmesi | 31 test | `1 skipped · 30 passed (1.4m)`, exit=0 |

Baz koşu kırmızıları (koşu 1):
```
admin-documents-upload.spec.ts:107   locator.click timeout — getByRole('link', /Belgeler \(K6 RAG\)/)
plan-entitlement-from-version:121     getByTestId('settings-metric-seats') not found
plan-storefront.spec.ts:121          getByRole('button', { name: 'Aylık' }) not found
plan-storefront.spec.ts:158          Expected: 200  Received: 401
plan-storefront.spec.ts:207          getByTestId('settings-plan-card-pro') not found
plan-storefront.spec.ts:219          Expected: 400  Received: 401
plan-storefront.spec.ts:235          Expected: 200  Received: 401
plan-storefront.spec.ts:260          getByTestId('settings-plan-card-basic') not found
```

- Atlanan tek test: `admin-documents-upload.spec.ts:153` — `test.skip(process.env.E2E_LIVE_EMBED !== '1', 'spends OpenAI embedding calls…')`; bilinçli opt-in, maliyet nedeniyle koşulmadı.
- Purge spec gerçekten koştu (atlanmadı): koşu 3'te `test-artifacts/TASK-MTTOUDNQ97X83-screenshots/06-alerts-console.png` ve `07-alert-detail.png` 17:58'de yeniden yazıldı; logda beklenen `[users-scheduled-deletion] failed for user purge-alert-s-…` + `NullConstraintViolation` bir kez.
- Hedef sayılar (istenen kırılım): plan-storefront 10/10 (baz koşudaki 6 kırmızının tümü dahil), plan-entitlement 3/3, admin-documents-upload 3 passed + 1 opt-in skip, purge-failure-alert-console 1/1, admin-plan-editor 13/13 (aynı kimlik hatası, ek). Toplam 31 = 30 passed + 1 skipped.
- `pnpm exec eslint <4 spec>` → exit 0 · `pnpm exec tsc --noEmit -p .` → exit 0.
- E2E DB doğrulama:
```
\d "Relationship" → ownerUserId | text |  |  |         (nullable)
prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- This is an empty migration.
```

## 3. Değişen dosyalar
- `tests/e2e/plan-storefront.spec.ts`, `tests/e2e/plan-entitlement-from-version.spec.ts`, `tests/e2e/admin-plan-editor.spec.ts` — oturum kimliği `demo-user-superadmin`
- `tests/e2e/admin-documents-upload.spec.ts` — oturum kimliği + giriş URL'i `/tr/admin/modules`
- `docs/agent-results/TASK-MUR373CLEV3MB-fe-fb.md`, `-fe-fb-2.md` (önceki turlar, bu turda commit'lendi), `-fe-fb-3.md` (bu rapor)

Commit'ler (dal `fe-fb/plan-e2e-red`):
- `56aa5b28` test(e2e): plan/admin specs sign in as the seeded platform admin
- rapor commit'i: aşağıdaki "Sonraki adım"da SHA

Ürün koduna, `global-setup.ts`'e, fixture'lara, CI'a dokunulmadı.

## 4. Riskler
- Düşük. Değişiklik yalnız E2E spec'lerinin kullandığı test kimliği ve bir giriş URL'i. Seed `demo-user-superadmin`'i her CI koşusunda `db:seed` ile yazıyor.
- Purge spec yerel DB'de kolon kısıtını geçici değiştiriyor (spec'in kendi tasarımı; `finally` geri alıyor). Koşu ortasında süreç öldürülürse kolon NOT NULL kalabilir → sonraki koşuda `\d "Relationship"` ile kontrol edilmeli.
- Tam E2E süiti bu turda koşulmadı; yalnız hedef 5 spec (31 test).

## 5. Açık sorular
- `/admin` kökü 404. Platform yöneticisi adresi elle yazınca boş 404 görüyor; `/admin` → `/admin/modules` yönlendirmesi ürün kararı (bu turun kapsamı dışında, ayrı kart önerilir).
- `4e7a7151`'deki `playwright.config.ts` değişikliği (`process.env.DATABASE_URL = E2E_DATABASE_URL`) yerinde bırakıldı; bu turun kırmızılarıyla ilgisi yok.

## 6. Sonraki adım
- crw incelemesi → `fe-fb/plan-e2e-red` dev'e merge.
- İsteğe bağlı: `/admin` index yönlendirmesi için kart.

Platform: mac'te doğrulandı. Değişiklik platforma bağlı kod yolu içermiyor (test kimliği dizgisi + URL); Linux CI'da aynı seed ve aynı spec'ler koşar. Windows koşulamadı (bu makinede yok); kod yolu platformdan bağımsız.
