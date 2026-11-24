---
version: 3
kart: NG-354
karttaki-id: TASK-MWUDUP9J5IZRM
ajan: qa-gnd
hüküm: YAYINA UYGUN (PR #430 için) — 5/5 tam paket yeşil, pre-push gate yeşil, PR #430 tüm kontroller pass; kırmızı tekrar-üretimi yapılamadı (aşağıya bak)
tip: bug (test kararlılığı, inceleme düzeltmesi)
platform: Linux (WSL2 Ubuntu-24.04, Windows 11 ana makine üzerinden wsl.exe)
dal: task/ng-346
commit: 6e44588f
pr: https://github.com/yaslan/nexagrant/pull/430
---

# NG-354 — PR #430 inceleme düzeltmesi: PublicLead kilidi

## Ne yapıldı

1. **transfer-org-name DDL replay hedefi kanıtlandı (kod okuma):**
   - `tests/transfer-org-name.live.test.ts` içinde `describe.skipIf(!DDL_LOCAL)` bloğu iki migration'ı statement statement replay eder (BEGIN … ROLLBACK).
   - `prisma/migrations/add-province-transfer-org-name.sql` yalnızca `CREATE OR REPLACE FUNCTION` + `REVOKE/GRANT` yapar; okuduğu tablolar `ProvinceLeadRoute` ve `Tenant`. **PublicLead'e dokunmaz.**
   - `prisma/migrations/add-public-lead-transfer-recipient.sql` ise `ALTER TABLE "PublicLead" ADD COLUMN …` ve `DROP/ADD CONSTRAINT "PublicLead_transfer_recipient_check"` çalıştırır. **Hedef tablo PublicLead'dir** (ACCESS EXCLUSIVE kilidi alır).
   - Not: bu, DDL'in hangi tabloya dokunduğunun kaynak kodla kanıtıdır; `pg_locks` ile çalışma zamanı ölçümü yapılmadı.

2. **Kilit kapsamı (PublicLead yazan / sorgulayan live dosyalar, grep ile):**
   - Zaten tutan (PR #430 öncesi): `public-lead`, `public-lead-rls`, `public-lead-consent-recipient`, `public-lead-stuck`, `province-lead-route`, `rls-verify-system-scope-policy-set`, `m18-intake`.
   - Bu düzeltmede eklendi:
     - `tests/transfer-org-name.live.test.ts` — `submitPublicLead` satırları + replay'deki PublicLead DDL. `beforeAll` → `holdTestDbLock(OWNER_URL!, PUBLIC_LEAD_TABLE_LOCK)`, `afterAll` → serbest bırak.
     - `tests/m18-intake-module-state.live.test.ts` — görev metninde istendiği için eklendi. **Dürüst not:** bu dosya `PublicLead` tablosuna doğrudan yazmıyor (yalnızca `publicLeadId` metni ve `createLeadIntakePort` kullanıyor); kilit koruyucu amaçlı.
   - `tests/expert-prereg-retention.live.test.ts` yalnızca bir yorumda "public-lead" geçiyor; kilit gerekmiyor.

3. **Kilit bekleme süresi ölçümü ve timeout kararı:**
   - Baseline JSON'undan (`~/ng354-baseline.json`) kilit tutan dosyaların süreleri: en uzun `rls-verify-system-scope-policy-set.live.test.ts` 3.5 sn, `province-lead-route` 2.7 sn, `public-lead` 1.6 sn; diğerleri ≤ 0.5 sn.
   - Kilidi bekleyen bir dosya en fazla bu süre kadar bekler (kilit tutan dosyanın tamamı boyunca). Ölçülen üst sınır ≈ 3.5 sn; `hookTimeout: 60_000` (vitest.config.mts:60) bunun ~17 katı.
   - **Karar:** `hookTimeout` değiştirilmedi, hook başına ayrı timeout eklenmedi. Gerekçe ölçümde.

4. **Stil:** `tests/m18-intake.live.test.ts` — `const mk =(key` → `const mk = (key`.

## Kanıt (ham çıktı özeti)

### Ortam
- İzole DB: konteyner `ng354-pg` (pgvector/pgvector:pg16, `127.0.0.1:55354`), DB adı `fabrika_test_ng354`.
- `pnpm db:setup` → `db-setup: done (127.0.0.1:55354/fabrika_test_ng354)`, rc=0 (`~/ng354-dbsetup.log`).
- Testler `DATABASE_URL` (owner, `fabrika`) ve `DATABASE_URL_RLS_TEST=postgresql://fabrika_app:…` (NOBYPASSRLS, `rolsuper=f rolbypassrls=f` doğrulandı) ile koştu. `.env` dosyasına dokunulmadı.

### Hatalı ilk baseline (kayda alındı, geçersiz)
- `DATABASE_URL_RLS_TEST` yanlışlıkla süper kullanıcıya (`fabrika`) verildi → 80 dosya kırmızı, hata: `connected as "fabrika" (rolsuper=true, rolbypassrls=true). RLS does not apply to this role`. Bu bir yapılandırma hatasıdır, kilit kararsızlığı değildir. Düzeltildi.

### Kırmızı (tekrar-üretim) denemesi — BAŞARISIZ
- Düzeltme öncesi tam paket baseline (doğru `fabrika_app` ile): `Test Files 610 passed | 4 skipped (614)`, `Tests 8615 passed | 75 skipped`, rc=0.
- Düzeltme öncesi hedefli tekrar: `public-lead-stuck`, `transfer-org-name`, `m18-intake-module-state`, `public-lead`, `m18-intake` birlikte 3 kez → her koşu `Tests 69 passed (69)`, rc=0 (`~/ng354-subset-pre-{1,2,3}.log`).
- **Sonuç:** inceleme notundaki "+1 stuck" kararsızlığı bu koşularda yeniden üretilemedi. Dosyalar birbirini kesmeden kısa sürede bitti (~1.9 sn). Kırmızı→yeşil döngüsü bu yüzden **kanıtlanamadı**; düzeltme, inceleme notunun gerektirdiği kapsam olarak uygulandı.

### Düzeltme sonrası — 5/5 tam paket
| koşu | Test Files | Tests | rc |
|---|---|---|---|
| fix1 | 610 passed / 4 skipped (614) | 8615 passed / 75 skipped (8690) | 0 |
| fix2 | 610 passed / 4 skipped (614) | 8615 passed / 75 skipped (8690) | 0 |
| fix3 | 610 passed / 4 skipped (614) | 8615 passed / 75 skipped (8690) | 0 |
| fix4 | 610 passed / 4 skipped (614) | 8615 passed / 75 skipped (8690) | 0 |
| fix5 | 610 passed / 4 skipped (614) | 8615 passed / 75 skipped (8690) | 0 |

Log'lar: `~/ng354-fix{1..5}.log`, JSON: `~/ng354-fix{1..5}.json`.

### Lint / typecheck
- `eslint` (3 değişen dosya): rc=0.
- `pnpm typecheck` (`tsc --noEmit`): rc=0.

### Push ve gate
- Commit: `6e44588f test(ng-354): hold PublicLead lock in transfer-org-name and m18-intake-module-state live files` (3 dosya, yalnız `tests/`).
- `git push origin task/ng-346` → `push_rc=0`. Pre-push tam `pnpm gate` koştu (e2e: `715 passed (24.4m)`); `--no-verify` yok.
- Doğrulama: `git ls-remote origin refs/heads/task/ng-346` → `6e44588ff6e943d71a94c5b87a446c01ee277963` = yerel `HEAD`.

### PR #430 CI
- `gh pr checks 430`: `build-and-test` pass, `cordis-worker` pass, `e2e (1)` pass, `e2e (2)` pass, `e2e (3)` pass, `e2e-gate` pass.

## Değişen dosyalar
- `tests/transfer-org-name.live.test.ts` (+8)
- `tests/m18-intake-module-state.live.test.ts` (+7)
- `tests/m18-intake.live.test.ts` (1 satır, stil)
- `docs/agent-results/NG-354-qa-gnd.md` (bu dosya)

`src/` dokunulmadı. `vitest.config.mts` ve `hookTimeout` değiştirilmedi.

## Platform beyanı
- Doğrulama platformu: **Linux (WSL2 Ubuntu-24.04)**. Komutlar Windows ana makineden `wsl.exe` ile koştu.
- **mac ve Windows native: koşulamadı** (bu makinede değil). Değişiklik yalnız test dosyaları ve Postgres advisory lock kullanıyor; platforma bağlı yol, süreç öldürme, kabuk veya ikili adı içermiyor. Kodu okuyarak: platform farkı beklenmiyor.

## Riskler
1. **Kırmızı üretilemedi.** Düzeltmenin kararsızlığı gerçekten giderdiği yalnızca kod okuma ve 5/5 yeşil ile destekleniyor; eski hâlini ölçerek kanıtlanmadı.
2. `m18-intake-module-state` kilidi doğrudan PublicLead yazmadığı için gereksiz serileştirme ekliyor (süre etkisi ~0.3 sn, ihmal edilebilir).
3. `transfer-org-name` replay'i `ALTER TABLE "PublicLead"` ile ACCESS EXCLUSIVE alıyor; kilit dosya boyunca tutulduğundan aynı anda çalışan PublicLead okuyucuları bu dosya bitene kadar bekler. Ölçülen süre küçük.
4. PR #430 kapsamında e2e ve ana test paketi değişmedi; yalnız test-only kilit değişikliği.

## Açık sorular
- Kilit kararsızlığını gerçekten kırmızı üretmek için hangi zamanlama (ör. public-lead seed'i ile public-lead-stuck taramasının kesişimi) kasıtlı zorlanabilir? Şu an deterministik bir tekrar-üretim yok.

## Sonraki adım
- PR #430 için inceleyicinin (crw-gnd) yeniden incelemesi; kilit kapsamı grep listesiyle birlikte sunuldu.
- İsteğe bağlı: `pg_locks` ile DDL replay'in PublicLead üzerinde ACCESS EXCLUSIVE aldığını çalışma zamanında ölçmek.
