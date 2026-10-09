# TASK-MUTYFGWYY5CS5 — E2E Test Selector Fixes for PR #33

**hüküm:** PASS — All 5 E2E tests now pass. Selectors fixed to recognize Turkish locale paths.

## Ne yapıldı

PR #33'ün E2E test'leri (settings-modules-access-control.spec.ts) Türkçe locale altında 3 test fail ediyordu. Sebep: CSS selector'ları İngilizce path'leri arıyordu (/settings/profile, /settings/modules) ama `getWorkspaceRoute('tr')` Türkçe path'ler üretiyordu (/ayarlar/profil, /ayarlar/moduller).

### Düzeltilen sorunlar

1. **href selector'ları**: `a[href*="/settings/profile"]` → `a[href*="ayarlar/profil"], a[href*="settings/profile"]` (her test'te)
2. **page.goto() path'leri**: 
   - `/tr/default/settings/profile` → `/tr/default/dashboard` (test 1)
   - `/tr/default/settings/modules` → `/tr/default/ayarlar/moduller` (test 2, 4)
   - `/tr/default/dashboard` → `/tr/default/panel` (test 3, 5 — Türkçe route)
3. **waitForURL regex**: `/\/settings\/(profile|ayarlar\/profil)/` → `/(settings\/profile|ayarlar\/profil)/` (test 5)
4. **User menu button selector**: `div.relative` custom traversal kaldırılıp `getByRole('button').last()` kullanıldı

### Test sonuçları (lokal)

```
Running 5 tests using 1 worker

✓ 1: MEMBER user: Settings link goes to profile, no Modules link in user menu (1.8s)
✓ 2: MEMBER user: accessing /settings/modules directly shows Access Denied (827ms)
✓ 3: TENANT_OWNER user: Settings link goes to modules, Modules link visible in user menu (748ms)
✓ 4: TENANT_OWNER user: /settings/modules page loads successfully (587ms)
✓ 5: mobile 390px: MEMBER user Settings link goes to profile (1.4s)

5 passed (8.8s)
```

## Doğrulama

Tüm test criteria korundu:
- MEMBER → Settings link profile'a, module menu link yok ✓
- MEMBER direct /modules access → "Erişim Reddedildi" ✓
- OWNER → Settings link modules'a, module menu link var ✓
- OWNER /modules page → access granted ✓
- Mobile MEMBER → Settings → profile ✓

Hiçbir test weakened olmadı; yalnız selector'ları both locale'ler support eder hale getirildi.

## Değişen dosyalar

- `tests/e2e/settings-modules-access-control.spec.ts`: 13 insertions, 13 deletions

## Riskler

**Düşük risk.** Selector'lar artık her iki locale'i de destekliyor. Türkçe test fixture'ları kendi locale'lerinde route'ları arar, İngilizce path'ler test'te direkt navigate'de kullanılmıyor. Diğer locale'ler (en, etc.) test'lerde run edilmiyorsa, risk yok.

## Sonraki adım

- PR #33 CI'ı kontrol et, tüm pipeline'lar (lighthouse-a11y dahil) yeşil olduktan sonra dev'e merge et
- Bulunmuş spec'ler farklı locale'ler için run ediliyorsa, fixture'ları parametrize et

## Platform beyanı

**macOS 14.6.1** —  test lokal `pnpm exec playwright test` ile run edildi. E2E'ler Chromium tarayıcısında, Database'i PostgreSQL 16 + pgvector (Docker 5433) kullanıyor. Spec'teki path'ler getWorkspaceRoute çıkışı kullanıyor; tüm platform'larda route'lar aynı.
