---
hüküm: ONAY — /tr/admin ve /en/admin platform admini /admin/modules'a yönlendiriyor; yeni e2e spec 3/3 (×3 tekrar 9/9) yeşil, RED kanıtlı
tip: feature/UX (ürün kararı: seçenek 1, 02.10.2026)
platform: mac (macOS / Darwin 27.0.0, Playwright chromium, next dev :3101, Postgres :5433/fonbridge_e2e)
---

# TASK-MURBM059EDSQY — /admin kökü yönlendirmesi (fe-fb)

## 1. Ne yapıldı
- Karar: seçenek 1 (yönlendirme). Kararı kullanıcı 02.10.2026'da bu oturumda verdi ("Seçenek 1, yönlendirmeyi uygula").
- `src/app/[locale]/admin/page.tsx` (yeni): `redirect(\`/${locale}/admin/modules\`)`. Yetki kontrolü tekrar edilmedi, `layout.tsx`'teki `isPlatformAdminSession` + `notFound()` olduğu gibi kullanılıyor.
- `tests/e2e/admin-root-redirect.spec.ts` (yeni), 3 test:
  1. Platform admin (`demo-user-superadmin`): `/tr/admin` → `/tr/admin/modules`. Admin menüsü görünüyor; "Belgeler (K6 RAG)" tıklanınca `/tr/admin/documents`'a gidiliyor. `/en/admin` → `/en/admin/modules`, "Documents (K6 RAG)" görünüyor.
  2. Kiracı üyesi (`demo-user-alice`, PIPELINE_MANAGER): `maxRedirects:0` isteği **404 ve `Location` başlığı yok**. Tarayıcıda URL `/tr/admin`'de kalıyor, ekranda "Sayfa Bulunamadı".
  3. Oturumsuz istek: `/tr/admin` durum kodu `/tr/admin/modules` ile aynı, `Location` başlığı `/admin/modules` içermiyor.

## 2. Kanıt
Komut: `E2E_PORT=3101 E2E_DATABASE_URL=postgresql://fabrika:fabrika@localhost:5433/fonbridge_e2e pnpm exec playwright test tests/e2e/admin-root-redirect.spec.ts --reporter=line`

| Koşu | Sonuç |
|---|---|
| RED: page.tsx yokken | `1 failed · 2 passed`. Admin testi: `Expected pattern: /\/tr\/admin\/modules$/ · Received string: "http://localhost:3101/tr/admin"` |
| GREEN | `3 passed (8.5s)` |
| GREEN `--repeat-each=3` (son hâl) | `9 passed (14.4s)` |
| Mutant: page'e ikinci bir admin guard'ı eklenmiş sürüm | `3 passed`. Guard sonucu değiştirmiyor, layout'un `notFound()`'u redirect'ten önce yanıt veriyor. Bu yüzden guard eklenmedi. |

- `pnpm exec eslint <2 dosya>` → 0 · `pnpm exec tsc --noEmit -p .` → 0 · `pnpm i18n:check` → "✅ i18n check passed" (yeni kullanıcı metni yok).
- Ekran görüntüleri: `test-artifacts/TASK-MURBM059EDSQY-screenshots/01-admin-tr.png` (Modül Yönetimi + Yönetim menüsü), `02-admin-en.png`, `03-member-404.png` ("Sayfa Bulunamadı"). Hepsi göz ile kontrol edildi.

## 3. Değişen dosyalar
- `src/app/[locale]/admin/page.tsx` (yeni)
- `tests/e2e/admin-root-redirect.spec.ts` (yeni)
- Commit `07c8d4e0`, dal `fe-fb/admin-root-redirect` (dev `542e64d8` üstünde). Layout, proxy.ts ve SidebarNav'a dokunulmadı.

## 4. Riskler
- Yetki sırası Next'in davranışına bağlı: layout'taki `notFound()` page'deki redirect'ten önce yanıt veriyor. Next yükseltmesinde bu değişirse üye testi (404 + `Location` yok) kırmızıya döner; davranış testle kilitli.
- Bu dalda `admin-documents-upload.spec.ts` ile `admin-plan-editor.spec.ts` hâlâ `demo-user-admin` kullanıyor. Onların düzeltmesi `fe-fb/plan-e2e-red` dalında (`56aa5b28`, TASK-MUR373CLEV3MB). İki dal aynı dosyalara dokunmuyor, merge çakışması beklenmiyor.

## 5. Açık sorular
Yok.

## 6. Sonraki adım
crw incelemesi → `fe-fb/admin-root-redirect` dev'e merge.

Platform: mac'te doğrulandı. Değişiklik sunucu tarafı bir Next rotası; platforma bağlı kod yolu yok, Linux CI aynı spec'i koşar. Windows koşulamadı (bu makinede yok).
