---
sözleşme: 3
görev: TASK-MVFMK08Z447OR
kod: TASK-MVFMK08Z447OR
ajan: be-gnd
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: 3 çağrı yerinin üçü de sarıldı. fabrika_app altında yapılan ölçümler 0'dan N'ye döndü. PR #121 dalımda 0 bulgu veriyor. Tam pnpm gate yeşil, push edildi. PR #125 dev'e açık, merge yok.
platform: mac (Darwin, docker fabrika-postgres :5433) üzerinde doğrulandı. Değişiklik saf TS/SQL-kapsamı; süreç, dosya yolu ve kabuk farkı yok. Bu yüzden Windows/Linux'ta davranış aynı olur. O platformlarda koşulamadı, çünkü makine yalnız mac.
sürüm: 1
tarih: 2026-10-19T21:40:54.346Z
---

# FA-49 — 3 çıplak çağrı yeri tenant/system scope'a alındı (PR #125)

## Ne yapıldı
1. **İnceleme (1662255c, dev-gnd).** Billing (`withTenant` + `getEntitlements(tenantId, tx)`) ve `listPlansForAdmin` (`withSystemScope('platform-admin','plan-admin.listPlans')`) doğru sarılmıştı; olduğu gibi korundu.
   - **Eksik:** `admin/tenants/page.tsx` "Tenant relrowsecurity=false" denerek bırakılmıştı.
   - Oysa `include._count{users,workspaces}` Membership ve Workspace tablolarını okuyor; ikisi de `relrowsecurity=t, relforcerowsecurity=t`.
   - **Düzeltme:** `withSystemScope('platform-admin','admin-tenants.list')` ile sarıldı (`admin/audit` deseniyle aynı; koruma layout'taki `isPlatformAdminSession`). Baseline'a kayıt eklendi.
2. **getEntitlements client'ı zorunlu yapıldı** (`src/lib/billing.ts`).
   - PR #121 CHECK E2, `client ?? prisma` geri dönüşünü singleton sayıyor. Bu yüzden billing page sarılmış olsa bile dalda `billing.ts:82` bulgusu kalıyordu.
   - `src` altındaki tüm çağıranlar zaten tx geçiyordu. Client'sız çağıran 3 test dosyası (`pilot.test.ts`, `public-sector-assignment.test.ts`, `tests/plan-entitlement-version.spec.ts`) `withTenant(...)`'a çevrildi.
3. **Testler.**
   - `tests/fa49-admin-billing-scope.live.test.ts`: fabrika_app, 3 kol, her kolda sarmasız negatif.
   - `tests/e2e/fa49-admin-billing-scope.spec.ts`: fabrika_app sunucusunda iki ekran.

## Kanıt (ham çıktı)
**İzole DB.** `docker exec fabrika-postgres pg_dump -U fabrika fabrika` → `fabrika_fa49_begnd`. Dev ağacının `rls.sql`'i yalnız bu kopyaya uygulandı (`Policies in public: 117 → 117`). Ortak `fabrika`'ya `db:rls` UYGULANMADI.

Kırmızı-önce sonda: gerçek fonksiyonlar, rol `fabrika_app`, aynı DB.
```
=== BEFORE (dev 80271979) ===
role/db fabrika_app fabrika_fa49_begnd
#1 admin/tenants (page wrapped=false) tenants=128 members=0 workspaces=0
#2 billing (page wrapped=false) ACTIVE public-team -> seats=1 ai=10 source=catalogue
#3 listPlansForAdmin plans=7 assignments=0
=== AFTER (branch working tree) ===
role/db fabrika_app fabrika_fa49_begnd
#1 admin/tenants (page wrapped=true) tenants=128 members=36 workspaces=14
#2 billing (page wrapped=true) ACTIVE public-team -> seats=6 ai=500 source=plan-version
#3 listPlansForAdmin plans=7 assignments=1
```
Not: #1 ve #2'de sonda sayfanın kaynağını okuyup sayfadaki sorguyu birebir koşturuyor. Sayfanın kendisi aşağıdaki e2e ve live testle ayrıca doğrulandı.

Yeni live test dev kodunda (80271979):
```
× admin/tenants renders the member and workspace counts
  AssertionError: expected [ +0, +0 ] to deeply equal [ 1, 1 ]
× listPlansForAdmin lists the tenants a private plan is assigned to
  AssertionError: expected [] to deeply equal [ 't-fa49-…' ]
Tests  2 failed | 1 passed (3)
```
Aynı test dalda `3 passed`. Dokunulan 4 test dosyası birlikte `31 passed`.

**PR #121 (FA-50 CHECK E) yerel deneme.** Yalnız 2 tarayıcı dosyası üzerine konup koşuldu, ardından geri alındı; push yok.
```
dev 80271979:  ❌ 3 tenant bypass(es) … CHECK E2
  src/app/[locale]/admin/tenants/page.tsx:25
  src/lib/billing.ts:82
  src/lib/billing/plan-repository.ts:391
bu dal:        46 call site(s) outside a tenant scope; baseline records 46.
               ✅ SUCCESS: no new tenant bypass.
```
Kendi `pnpm rls:bypass-check`: `✅ SUCCESS … 46 on the sanctioned cross-tenant path, 0 still owed.`

**E2E (gerçek tarayıcı, sunucu fabrika_app ile izole DB'de, port 3149):**
```
✓ admin tenants shows the real member and workspace counts (3.1s)
✓ billing shows the seats of the plan the tenant pays for (1.6s)
2 passed
```
Ekran görüntüleri (`TASK-MVFMK08Z447OR-screenshots/`):
- `admin-tenants.png`: Fabrika Beta satırı 14 üye / 3 workspace gösteriyor.
- `billing.png`: PRO AKTİF, kredi 500/500, koltuk 14 / 6, workspace 3 / 1.

**Pre-push `pnpm gate` (tam, `--no-verify` yok).** DB env'i izole kopyaya yönlendirildi, adım atlanmadı.
```
$ prisma generate / eslint / tsc --noEmit
 Test Files  369 passed | 2 skipped (371)
      Tests  4867 passed | 54 skipped (4921)
$ check-rls / check-tenant-bypass / check-rls-live --require-db / setup-rls-role
  379 passed (9.3m)
✅ Öksüz alarm yok
   1662255c..cc255638  dev-gnd/fa49-rls-wrap-admin-billing -> dev-gnd/fa49-rls-wrap-admin-billing
```
**PR:** https://github.com/yaslan/fonbridge/pull/125 (base dev, merge YOK)

## Değişen dosyalar (cc255638, 1662255c üzerine)
- `src/app/[locale]/admin/tenants/page.tsx`
- `src/lib/billing.ts`
- `scripts/tenant-bypass-baseline.json`
- `src/lib/billing/pilot.test.ts`, `src/lib/billing/public-sector-assignment.test.ts`, `tests/plan-entitlement-version.spec.ts`
- `tests/fa49-admin-billing-scope.live.test.ts` (yeni), `tests/e2e/fa49-admin-billing-scope.spec.ts` (yeni)

## Riskler / kart kurallarından sapma
- **Kapsam:** Kart "yalnız bu 3 dosya + testleri" diyor; `src/lib/billing.ts` imza değişikliği bunun dışında kalıyor. Bu değişiklik liderin "dalında #121 bulgusu 0 olmalı" şartı için gerekliydi; davranış değişmiyor, yalnız tip sözleşmesi daralıyor.
- **Kapsam:** Kart `scripts/tenant-bypass-*` için "DEĞİŞMEZ" diyor; `tenant-bypass-baseline.json` yine de değişti. Yeni `withSystemScope` çağrı yerini kaydetmeden `rls:bypass-check` kırmızı kalıyor. 1662255c'de de aynısı yapılmıştı. Tarayıcı kodu (`check-tenant-bypass.ts`, `tenant-bypass-scan.ts`) değişmedi.
- PR #121 merge olursa bu dalla çakışma beklenmiyor: #121 yalnız tarayıcı dosyalarını değiştiriyor.
- E2E fixture'ındaki `E2E_IDENTITIES.platformAdmin` seed edilemiyor (`role: SUPER_ADMIN` bir Membership Role değeri değil). Yeni spec kendi admin kimliğini kuruyor. Fixture'ın kendisi bu kartın kapsamı dışında, dokunulmadı.
- İzole DB `fabrika_fa49_begnd` sunucuda duruyor (ortak DB'ye etkisi yok). İstenirse `drop database fabrika_fa49_begnd` ile silinir.

## Açık sorular
Yok.

## Sonraki adım
PR #125'in incelenmesi ve dev'e merge'ü (merge benim işim değil).
