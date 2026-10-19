---
sözleşme: 3
görev: TASK-MVFMK08Z447OR
kod: TASK-MVFMK08Z447OR
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: PR #125'te bloke eden bulgu yok. Kırmızı-önce sonda kendi kopyamda 3 kolda da yeniden üretildi. Baseline değişikliği kartın kendi 1. ve 3. maddelerinin zorunlu sonucu, kabul edilebilir. Önerilerin 3'ü de bloke etmiyor. Approve verilmedi, kod değiştirilmedi.
platform: mac (Darwin 27, docker fabrika-postgres :5433, özel kopya fabrika_fa49_crwfb) üzerinde doğrulandı. Değişiklik saf TS ve Prisma sorgu kapsamı; süreç, dosya yolu ya da kabuk farkı yok. Bu yüzden Windows/Linux'ta davranış aynı olur. Bu platformlarda koşulamadı, çünkü makine yalnız mac.
sürüm: 1
tarih: 2026-10-19T21:50:35.888Z
---

# FA-49 — PR #125 incelemesi (crw-fb)

**Karar:** bloke eden bulgu **yok**. Kod değiştirilmedi, approve verilmedi, merge yok.
İnceleme hedefi: `dev-gnd/fa49-rls-wrap-admin-billing` @ `cc255638` (2 commit: `1662255c` + `cc255638`), merge-base `80271979` = şu anki `origin/dev`.

## Ne yapıldı
1. Kart (get_task) ile be-gnd raporu okundu ve diff satır satır incelendi. İncelenen dosyalar: `admin/tenants/page.tsx`, `settings/billing/page.tsx`, `billing.ts`, `plan-repository.ts`, baseline, 3 test dosyası, yeni live testi ve yeni e2e testi.
2. Ayrık bir worktree açıldı (`FONBRIDGE-crw-review-fa49`, detached). Ortak `fabrika` DB'sinin dökümünden **`fabrika_fa49_crwfb`** kopyası oluşturuldu ve dev'in `rls.sql`'i **yalnız bu kopyaya** uygulandı (`Policies in public: 117 → 117`). PR `rls.sql`'e dokunmuyor. Ortak DB'ye `db:rls` ya da migration uygulanmadı.
3. Kırmızı-önce sonda yeniden üretildi. Yöntem: 4 kaynak dosya `80271979`'a geri alındı, dalın testi aynı kaldı, ardından dal kodu geri yüklendi.
4. Billing kolu için geçici bir sonda testi yazıldı, koşuldu ve silindi.
5. Şu kontroller koşuldu: `rls:bypass-check` (dalın tarayıcısıyla ve PR #121 tarayıcısı üstüne konarak), `tsc`, eslint, dokunulan testler ve merge-tree çakışma denetimi.

## Kanıt (ham çıktı)

### Kırmızı-önce: `tests/fa49-admin-billing-scope.live.test.ts` (rol fabrika_app, DB fabrika_fa49_crwfb)
```
=== DEV CODE (80271979 src, branch test) ===
 × admin/tenants renders the member and workspace counts
   → expected [ +0, +0 ] to deeply equal [ 1, 1 ]
 ✓ billing entitlements come from the tenant's live subscription
 × listPlansForAdmin lists the tenants a private plan is assigned to
   → expected [] to deeply equal [ 't-fa49-1792446430736-7656' ]
      Tests  2 failed | 1 passed (3)
=== BRANCH CODE (cc255638) ===
 ✓ admin/tenants renders the member and workspace counts
 ✓ billing entitlements come from the tenant's live subscription
 ✓ listPlansForAdmin lists the tenants a private plan is assigned to
      Tests  3 passed (3)
```

### Billing kolu: ayrı sonda (geçici test, sayfanın eski çağrısı birebir)
```
=== dev billing.ts (80271979) ===
role/db fabrika_app fabrika_fa49_crwfb tenant=cmvbl39kh000pvqxkom47yjdt plan=public-team
  unscoped getEntitlements(tenantId)         -> seats=1 ai=10 source=catalogue
  withTenant(t, tx => getEntitlements(t,tx)) -> seats=6 ai=500 source=plan-version
=== branch billing.ts (cc255638) ===
  unscoped getEntitlements(tenantId)         -> THROW Cannot read properties of undefined (reading 'tenant')
  withTenant(t, tx => getEntitlements(t,tx)) -> seats=6 ai=500 source=plan-version
```
Sonuç: be-gnd'in "ACTIVE public-team → seats=1 ai=10 source=catalogue" ölçümü birebir tekrarlandı. Dalda client'sız çağrı artık tsc hatası veriyor; çalışma anında da sessizce free fallback'e düşmek yerine hata fırlatıyor.

### Bypass taraması
```
== bypass-check (dalın tarayıcısı) ==
  46 call site(s) outside a tenant scope; baseline records 46.
  platform-admin       14 call site(s) in 10 file(s)
✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 46 on the sanctioned cross-tenant path, 0 still owed.
== PR #121 tarayıcısı (9a8aca96) üstüne konarak ==
ℹ CHECK E1 exemptions (K-570148 = A): 1 bare transaction block(s) bound by bindTransactionToTenant, not judged after the bind:
✅ SUCCESS: no new tenant bypass. ... 46 on the sanctioned cross-tenant path, 0 still owed.   rc=0
```
(Tarayıcı dosyaları ardından `git checkout HEAD -- scripts` ile geri alındı; `git status` temiz.)

### Typecheck, lint ve testler
```
$ tsc --noEmit            rc=0
eslint (6 değişen dosya)   rc=0
vitest: pilot.test.ts, public-sector-assignment.test.ts, plan-entitlement-version.spec.ts,
        plan-admin.test.ts, fa49-admin-billing-scope.live.test.ts, modules/module-plan-gate.test.ts
 Test Files  6 passed (6)
      Tests  65 passed (65)      (skip yok → canlı DB'de koştu)
```

### Merge çakışması
```
PR125 x origin/dev (80271979): clean
PR125 x PR121 (9a8aca96):      clean
PR125 x PR92 (fo50): scripts/tenant-bypass-baseline.json auto-merge (çakışma yok; #92'nin kendi DATA_MODEL çakışması bu PR'dan bağımsız)
```

## İnceleme bulguları (önem sırasıyla)

### Bloke eden: yok

### Değerlendirme 1: baseline kaydı ve kartın "`scripts/tenant-bypass-*` DEĞİŞMEZ" kuralı
**Hüküm:** sapma gerekli, gerekçesi doğru, kabul edilebilir. Kartın metni kendi içinde çelişiyor; sorun kodda değil.
- Kartın 1. ve 3. maddeleri **açıkça `withSystemScope` istiyor**. Tarayıcının D kontrolü her `withSystemScope` çağrı yerini baseline'da `kind:"system-scope"` olarak kayıtlı görmek ister (`scripts/check-tenant-bypass.ts:118-123`: "Leaving a tenant scope is allowed, and is never silent. Record it in scripts/tenant-bypass-baseline.json…"). Bu sözleşme ratchet olarak tasarlanmış: kayıtlı sayının üstü kırmızı verir.
  - Baseline'a dokunmadan bu iki maddeyi yapmanın tek yolu, kapıyı kırmızı bırakmaktır. Bu da kartın DoD'undaki "rls:bypass-check yeşil" şartıyla çelişir.
- Kuralın parantezdeki gerekçesi "(be-gnd FO-92 rls.sql'de)". Kuralın gerçek amacı eşzamanlı işlerle çakışmayı önlemek. PR #121 (FA-50) tarayıcı **kodunu** değiştiriyor: `check-tenant-bypass.ts` ve `tenant-bypass-scan.ts`. PR #125 bu iki dosyaya **dokunmuyor**; değiştirdiği tek şey veri dosyası (`tenant-bypass-baseline.json`). Merge-tree ölçümü: #121 ile clean, #92 ile auto-merge.
- Değişiklik dar kapsamlı:
  - 1 yeni kayıt (`admin/tenants/page.tsx`, platform-admin, count 1).
  - `plan-repository.ts` platform-admin sayısı 4'ten 5'e çıktı (`listPlansForAdmin`).
  - İki kaydın da gerekçesi ölçüme dayanıyor ve dosyadaki koşula bağlı.
- **Öneri (lider için):** kartın kural metni şöyle düzeltilsin: "`scripts/check-tenant-bypass.ts` ve `tenant-bypass-scan.ts` değişmez; `tenant-bypass-baseline.json`'a yalnız bu kartın yeni `withSystemScope` çağrı yerleri eklenir." Bundan sonraki "sar" kartlarında aynı çelişki çıkmasın.

### Değerlendirme 2: `src/lib/billing.ts` kapsam dışı mı?
**Hüküm:** gerekçeli ve güvenliği artırıyor.
- `TenantTx` markalı bir tip (`src/lib/db.ts:135`, `Prisma.TransactionClient & TenantScopeBrand`). Zorunlu client olunca çıplak `prisma` geçirmek artık tip hatası veriyor. Billing sayfası eski haline dönerse derleme kırılır.
- src'deki 7 çağıran tx geçiyor: `plan-view.ts:59`, `seat-limit.ts:75`, `credits-monthly-grant.ts:90`, `access.ts:106`, `tenant-access.ts:67`, `stale-reminder.ts:158`, `billing/page.tsx:142`. `tsc` temiz.
- Mock'layan testler (`vi.mock('@/lib/billing')`) etkilenmiyor.

### Öneri 1 (test kapsamı, düşük): billing live kolu kırmızı-önce değil
- **Dosya:** `tests/fa49-admin-billing-scope.live.test.ts:113-124`
- **Durum:** kol `getEntitlements(TENANT, tx)`'i doğrudan çağırıyor, sayfayı render etmiyor. Bu yüzden dev kodunda da **yeşil** (yukarıdaki ham çıktı: `✓ billing …`). be-gnd'in commit mesajı bunu dürüstçe belirtiyor ("red on dev for admin tenants and listPlansForAdmin").
- **Senaryo:** biri sayfada `withTenant`'ı yanlış tenantId ile çağırırsa ya da kaldırıp başka bir client geçirirse live test bunu yakalamaz.
- **Etkisi neden düşük:**
  - Client zorunlu olduğu için çıplak çağrı derleme hatası veriyor.
  - e2e spec sayfayı fabrika_app sunucusunda ölçüyor.
- **Düzeltme önerisi (opsiyonel):** admin kolu gibi `BillingSettingsPage`'i render eden bir kol. Session ve params mock'u gerektirdiği için ayrı bir kart açılabilir.

### Öneri 2 (doğruluk/metin, nit): baseline gerekçesindeki guard adı
- **Dosya:** `scripts/tenant-bypass-baseline.json` içindeki `plan-repository.ts` platform-admin kaydı.
- **Durum:** gerekçe "behind requirePlatformAdmin() on the admin plan console" diyor. Gerçek koruma `src/app/[locale]/admin/billing/plans/page.tsx:31` → `if (!isPlatformAdminSession(session)) notFound();` ve admin layout'u.
- **Senaryo:** baseline okuyucusu yanlış fonksiyonu arar. Eski 4 kaydın metninden miras kalmış bir hata; yeni kayıt (admin/tenants) guard'ı doğru adlandırıyor.
- **Düzeltme:** bir sonraki dokunuşta metni `isPlatformAdminSession()` olarak düzelt. Bloke etmez.

### Öneri 3 (sadeleştirme, nit)
- `src/lib/billing.ts:85` → `const db = client;` artık gereksiz bir alias; `client` doğrudan kullanılabilir. Zevk meselesi, bloke etmez.

### Not (regresyon değil)
`listPlansForAdmin` iki ayrı system-scope transaction açıyor: plan listesi ve `platform-aggregate` canlı sayım. Arada yapılan bir yayın iki sonucu birbirinden kaydırabilir. Bu davranış PR öncesinde de vardı; okuma amaçlı bir admin ekranında kabul edilebilir.

### Doğrulanan diğer noktalar
- `admin/tenants`: `Tenant.users` alanı `Membership[]`, `Tenant.workspaces` alanı `Workspace[]` (`prisma/schema.prisma:38-39`). İkisi de RLS altında; sarma gerekçesi doğru. Sayfa `admin/layout.tsx:33-36` → `isPlatformAdminSession` + `notFound()` ile korunuyor. Dönen veri yalnız sayılar.
- `withSystemScope`/`withTenant` yeniden yazılmamış, yalnız çağrılmış (`src/lib/system-scope.ts` diff'te yok). Purpose literal olarak `'platform-admin'`; tarayıcı okuyabiliyor.
- `prisma/rls.sql` diff'te yok.

## Koşulmayanlar
- **e2e ve gerçek tarayıcı:** yeniden koşulmadı. fabrika_app ile ayrı bir Next sunucusu kurmak gerekiyor ve bu incelemenin kapsamı kaynak, sonda ve kapı ile sınırlı. be-gnd'in ekran görüntüsü açılıp kontrol edildi: `docs/agent-results/TASK-MVFMK08Z447OR-screenshots/billing.png` PRO AKTİF, kredi 500/500, koltuk "14 / 6" gösteriyor. 14/6 demo kiracının verisi; bu PR'ın konusu değil.
- **Tam `pnpm gate`:** koşulmadı. be-gnd'in raporunda tam gate yeşil; ben ilgili alt kümeyi koştum (tsc, eslint, 6 test dosyası, bypass-check).

## Değişen dosyalar
Yalnız bu rapor. Kod değişikliği yok.

## Riskler
- Merge sırası: #121 önce merge edilirse bu dalın kendi tarayıcısıyla ölçümü de SUCCESS veriyor (ölçüldü), yani sıra fark etmiyor.

## Açık sorular
Yok. Kart kural metninin düzeltilmesi yukarıda lider için öneri olarak yazıldı; karar gerektirmiyor.

## Sonraki adım
PR #125 lider veya sahibi tarafından merge edilebilir; benim tarafımda bloke eden bir şey yok. Öneri 1-3 isteğe bağlı.

## Temizlik
- `fabrika_fa49_crwfb` kopyası düşürüldü.
- `FONBRIDGE-crw-review-fa49` worktree'si kaldırıldı.
- Yerel refs `refs/crwfb/pr92` ve `refs/crwfb/pr121` silindi.
