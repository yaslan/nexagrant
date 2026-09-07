# TASK-MTQZ8MVAU3J7I — Plan kapısı bağlandı (ex-en, 2. tur / kapanış)

**Tarih:** 2026-09-07 · **Sprint:** SPRINT-S12 · **Ajan:** ex-en
**Durum:** BİTTİ — uçtan uca doğrulandı (birim test + e2e + gerçek tarayıcı + `pnpm gate`).

---

## 1. Kapının bugünkü tek gerçeği (ölçüm)

```
$ grep -rn "checkModuleAccess\|requireModule\|useModuleEnabled" src/
src/lib/modules/guard.tsx:4:import { checkModuleAccess } from '@/lib/modules/access';
src/lib/modules/guard.tsx:16: * so the decision lives in one place (`checkModuleAccess` → `canAccessStatus`) and a
src/lib/modules/guard.tsx:28:  const access = await checkModuleAccess(moduleId);
src/lib/modules/access.ts:46:export async function checkModuleAccess(moduleId: ModuleId): Promise<ModuleAccessResult>
src/lib/modules/access.ts:78:  const access = await checkModuleAccess(moduleId);
src/lib/modules/hooks.tsx:30:export function useModuleEnabled(moduleId: ModuleId): boolean {
src/lib/modules/hooks.tsx:47:export function requireModule<P extends object>(
src/lib/modules/hooks.tsx:53:    const isEnabled = useModuleEnabled(moduleId);
```

Kapı tek noktadaydı (`checkModuleAccess`) ama **yalnız `ModuleState` okuyordu**:
`prisma.moduleState.findUnique(...)` → `canAccessStatus(status, viewer)` → cevap.
Plan hiç sorgulanmıyordu. Görev kartındaki ölçüm doğrulandı: depoda `PlanEntitlement`
modeli ve `src/lib/authz` dizini **yok**; hak ediş `src/lib/billing.ts::getEntitlements()`
içinde `PLAN_GRANTS`'tan hesaplanıyor ve kapı bunu **çağırmıyordu**.

### Hata canlı veritabanında duruyordu (kurgu değil)

```
SUBS   [ { tenantId: 'demo-tenant', planId: 'pro', status: 'ACTIVE' } ]
MODULESTATE
  demo-tenant M10 ON
  demo-tenant M8  ON
```

`PLAN_GRANTS` (src/lib/billing/catalog.ts:366-403): `pro` → `M1,M2,M3,M4,M5,M8`.
**M10 `pro` planında yok** ama `ModuleState` satırı `ON`. Sonuç: demo kiracı M10'un
tüm sayfalarını ve eylemlerini bedava kullanıyordu. Plan düşürüldüğünde geride kalan
(ya da elle yazılan) bir `ModuleState` satırı ücretsiz yükseltme demekti.

---

## 2. Düzeltme — plan kontrolü kapının İÇİNDE

**`src/lib/modules/access.ts`** (asıl değişiklik): `checkModuleAccess` artık tek çağrıda
iki gerçeği birden okuyor:

```ts
const [state, entitlements] = await Promise.all([
  prisma.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId: scope.tenantId, moduleId } }, select: { status: true } }),
  getEntitlements(scope.tenantId),          // PLAN_GRANTS + aktif AddOn'lar
]);

if (!entitlements.allowedModules.includes(moduleId)) {
  return { allowed: false, status, reason: 'PLAN_UPGRADE_REQUIRED',
           requiredPlans: planNamesGrantingModule(moduleId) };
}
// ardından statü kapısı (canAccessStatus) — OFF/DEV/PILOT anlamı değişmedi
```

Alınan kararlar ve gerekçeleri:

- **`PLAN_GRANTS` okunur, yeniden yazılmaz.** Kapı `getEntitlements()` üzerinden gidiyor;
  o da `Plan` satırını değil katalogdaki `PLAN_GRANTS`'ı okuyor **ve aktif `AddOn`'ları
  ekliyor**. Böylece planı kapsamayan ama add-on'la satın alınmış bir modül haksız yere
  kapanmıyor. Kapıda ikinci bir plan merdiveni yok.
- **Önce hak ediş, sonra statü.** İkisi de reddediyor; sıra yalnız *cümleyi* belirliyor.
  Hiç satın alınmamış bir modül için "yöneticiniz kapatmış" demek yanlış yönlendirmedir —
  kullanıcı gidip ayarlardan açmayı dener, açamaz. Doğru cevap "planınız kapsamıyor".
- **Platform admini de bağlar.** `canAccessStatus`'taki admin baypası *statü* içindir
  (`DEV` = ekip içi çalışma). Hak ediş kiracının ne satın aldığıdır; ekip üyesinin kiracı
  çalışma alanında durması bunu değiştirmez. Alt plandaki bir kiracıya modül açmanın yolu
  satmaktır (`AddOn` satırı — `getEntitlements` zaten sayıyor), oturum değil.
- **UI'da kopya kontrol yok.** `guard.tsx` yalnız kodu çeviriyor; `hooks.tsx` dokunulmadı;
  `state-machine.ts`'e sadece yeni `ModuleDenyReason` üyesi eklendi.

**Dokunulan dosyalar (yalnız kendi kapsamım):**

| Dosya | Ne |
|---|---|
| `src/lib/modules/access.ts` | plan kontrolü kapının içine (+`requiredPlans` alanı) |
| `src/lib/modules/state-machine.ts` | `ModuleDenyReason` += `PLAN_UPGRADE_REQUIRED` |
| `src/lib/modules/guard.tsx` | reddediş metnine `{plans}` parametresi |
| `src/lib/billing/catalog.ts` | `planNamesGrantingModule()` — salt-okuma yardımcısı |
| `tests/modules/module-plan-gate.test.ts` | yeni birim test (9 senaryo) |
| `tests/e2e/module-plan-gate.spec.ts` | yeni e2e (2 test) |

`src/modules/m*/**`, `src/app/api/billing/**`, `src/lib/billing/price-lock.ts`: **dokunulmadı.**

---

## 3. i18n — reddediş yüzeyi

`guard.tsx` içinde tek bir sabit kullanıcı metni yok; sunucu **kod** gönderiyor, cümleyi
`ModuleGate` ad alanı üretiyor.

```
$ python3 … messages/tr.json ∪ messages/en.json → ModuleGate
tr keys: ['askAdmin', 'reason.DEV_INTERNAL_ONLY', 'reason.MODULE_OFF', 'reason.NOT_AUTHENTICATED',
          'reason.NO_TENANT', 'reason.PILOT_MANAGERS_ONLY', 'reason.PLAN_UPGRADE_REQUIRED', 'title']
en keys: ['askAdmin', 'reason.DEV_INTERNAL_ONLY', 'reason.MODULE_OFF', 'reason.NOT_AUTHENTICATED',
          'reason.NO_TENANT', 'reason.PILOT_MANAGERS_ONLY', 'reason.PLAN_UPGRADE_REQUIRED', 'title']
parity: OK
```

- tr: `"{module} modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: {plans}."`
- en: `"The {module} module is outside your subscription. It is included in: {plans}."`

`{plans}` **`PLAN_GRANTS`'tan** geliyor (`planNamesGrantingModule`), metne elle yazılmadı —
plan merdiveni değişirse cümle kendiliğinden değişir.

> **Not (dosya sahipliği):** Bu iki anahtarı 1. turda `messages/*.json`'a ben eklemiştim.
> Bu turda `messages/*.json`'a **dokunmadım**; anahtarlar başka bir ajanın commit'ine
> (`fdb127e`) süpürülmüş ve HEAD'de duruyor — `git show HEAD:messages/tr.json | grep
> PLAN_UPGRADE_REQUIRED` → satır 907. Yani ihtiyaç karşılanmış durumda; **bu iki anahtar
> silinirse kapı ham anahtar adını basar.** `messages/*.json` sahibine (blog-yazar) not.

---

## 4. Birim test — üç senaryo (+6 kenar durum)

```
$ npx vitest run tests/modules/module-plan-gate.test.ts --reporter=verbose

 ✓ checkModuleAccess … > allows when the plan covers the module and it is ON 1ms
 ✓ checkModuleAccess … > refuses when the module is ON but the plan does not cover it 0ms
 ✓ checkModuleAccess … > refuses when the plan covers the module but it is OFF 0ms
 ✓ checkModuleAccess … > treats a missing ModuleState row as OFF, not as an entitlement 0ms
 ✓ checkModuleAccess … > refuses a session with no tenant without reading the plan at all 0ms
 ✓ checkModuleAccess … > binds a platform admin too: entitlement is not a status bypass 0ms
 ✓ checkModuleAccess … > reads the entitlement for the session tenant, never an argument 1ms
 ✓ assertModuleAccess … > throws ModuleAccessError when the plan does not cover the module 1ms
 ✓ assertModuleAccess … > returns quietly when the tenant owns the module and it is ON 0ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  20:39:44
```

Kartta istenen üç senaryo ilk üç satır: **kapsıyor+ON → izin · kapsamıyor+ON → RED ·
kapsıyor+OFF → RED.**

`$ pnpm test -- module-plan-gate` (vitest `--` sonrası argümanı filtre olarak almayıp
tüm paketi koşturuyor; çıktı yine yeşil):
`Test Files 72 passed | 2 skipped (74) · Tests 765 passed | 8 skipped (773)`

---

## 5. e2e — gerçekten koşturuldu

```
$ E2E_BASE_URL=http://localhost:3400/tr/giris npx playwright test tests/e2e/module-plan-gate.spec.ts

Running 2 tests using 1 worker
  ✓  1 … › Pro is locked out of M10 and Ultra is let in — with the module ON both times (2.3s)
  ✓  2 … › an OFF module the plan does include is still refused (1.1s)
  2 passed (4.0s)
```

Test **aynı oturumda, aynı URL'de, `ModuleState` satırı ikisinde de `ON` iken** yalnız
`Subscription.planId`'yi `pro` → `ultra` çeviriyor; başka hiçbir şey değişmediği için
değişen tek şey plan kapısı. Sonda orijinal plan ve statü geri yükleniyor (doğruladım:
`SUBS [{ tenantId:'demo-tenant', planId:'pro', status:'ACTIVE' }]`, `M10 ON`).

> `E2E_BASE_URL` gerekli çünkü `playwright.config.ts`'nin `webServer.url` yoklaması `/`'e
> gidiyor, o da `/tr`'ye yönleniyor ve `/tr` şu an **500** veriyor (bkz. Açık sorular §1);
> bu yüzden `reuseExistingServer` çalışan sunucuyu göremeyip ikinci bir sunucu açıyor ve
> `EADDRINUSE` ile ölüyor. Giriş sayfasını yoklama adresi yapmak bunu aşıyor.

---

## 6. Gerçek tarayıcı kanıtı — `docs/agent-results/TASK-MTQZ8MVAU3J7I-screenshots/`

Hepsi 2026-09-07 tarihli, chromium (headless), 1440×950, gerçek oturum
(`admin@yasinaslan.com.tr`), gerçek veritabanı.

| Kare | Ne gösteriyor |
|---|---|
| `01-before-plan-pro-m10-still-open.png` (20:12) | **DÜZELTMEDEN ÖNCE.** plan `pro`, `ModuleState M10=ON` → `/tr/main/opportunities/demo-opp-1/documents` tamamen açık: "Takip Belgeleri & Eşik Üstü Ödül Paketi", "TÜBİTAK Ödül Paketi Üret" düğmesi, çift onay akışı. |
| `02-after-tr-m10-plan-locked.png` (20:40) | **SONRA, TR.** Aynı kiracı, aynı rota → 🔒 "Bu modül şu anda kullanılamıyor · Follow-up Documents modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: **Ultra**." |
| `03-after-en-m10-plan-locked.png` (20:41) | **SONRA, EN.** Aynı sayfa `/en/...` → "The Follow-up Documents module is outside your subscription. It is included in: Ultra." (i18n iki dilde çalışıyor.) |
| `04-control-m8-in-pro-plan-open.png` (20:41) | **Pozitif kontrol.** M8 `pro` planında ve `ON` → `/tr/main/pipeline/demo-opp-1/consortium` normal açılıyor. Kapı her şeyi kapatmıyor. |
| `e2e-01-pro-m10-locked.png` (20:40) | e2e 1. yarısı: plan `pro` + M10 `ON` → kilit. |
| `e2e-02-ultra-m10-open.png` (20:40) | e2e 2. yarısı: **yalnız plan `ultra` yapıldı**, sayfa yenilendi → aynı rota açıldı. Kapının gerçekten planı okuduğunun kanıtı. |
| `e2e-03-ultra-m10-off.png` (20:40) | plan kapsıyor ama `ModuleState=OFF` → yine RED, bu kez "kiracınızda kapalı". Statü kapısı korunuyor. |

---

## 7. `pnpm gate`

```
$ pnpm gate

# 1) eslint
✖ 84 problems (0 errors, 84 warnings)          ← hepsi mevcut lint borcu (TASK-MTREJ27YUPSY7)

# 2) tsc --noEmit
(çıktı yok — temiz)

# 3) vitest run --passWithNoTests
 Test Files  72 passed | 2 skipped (74)
      Tests  765 passed | 8 skipped (773)
   Start at  20:41:28

# 4) tsx scripts/check-rls.ts
Found 40 tenant-scoped models requiring RLS policies: …
✅ SUCCESS: All 40 tenant-scoped models have RLS policies registered.

# 5) tsx scripts/check-rls-live.ts
Kiracıya özel model: 40 · RLS açık tablo: 43 · tenant_isolation politikası: 40
✅ Veritabanı 40 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

Kendi dosyalarımın lint'i ayrıca:
`npx eslint src/lib/modules/ src/lib/billing/catalog.ts tests/modules/module-plan-gate.test.ts tests/e2e/module-plan-gate.spec.ts`
→ `1 problem (0 errors, 1 warning)`; tek uyarı `state-machine.ts:2` — **benden önce de
vardı** (`getAllManifests` kullanılmıyor), lint borcu görevinin kapsamı olduğu için
elletmedim.

---

## 8. Dosya sahipliği — devir notu

**`src/lib/billing/catalog.ts` SERBEST.** Bu dalgadaki tek değişikliğim dosyanın sonuna
eklenen `planNamesGrantingModule()` fonksiyonu; commit'lendi. blockzincir-pm devralabilir.

`messages/*.json`'a bu turda **dokunulmadı** (bkz. §3 notu).

---

## Açık sorular (kapsamım dışı — DÜZELTMEDİM, bildiriyorum)

1. **`/tr` (halka açık ana sayfa) 500 veriyor ve e2e kapısını kilitliyor.**
   `src/components/BlogSection.tsx:2` `next/image` alıyor, `:55` `src={post.image}` ile
   `https://images.unsplash.com/...` basıyor (`src/lib/blog.ts:29,31,60`), ama
   `next.config.ts`'de `images.remotePatterns` bloğu **yok**:
   `Invalid src prop (…unsplash…) hostname "images.unsplash.com" is not configured`.
   `git log -- src/components/BlogSection.tsx` → `ca73ced refactor: migrate 16 <img>
   elements to next/image` — regresyon o commit'ten. **Etkisi yalnız kozmetik değil:**
   `playwright.config.ts:29`'un `webServer.url` yoklaması `/` → `/tr` → 500 gördüğü için
   `reuseExistingServer` çalışan sunucuyu tanımıyor, ikinci sunucu açıp `EADDRINUSE` ile
   ölüyor; yani `pnpm test:e2e` şu an **hiçbir** e2e'yi koşturamıyor.
   Çözüm ya `next.config.ts`'ye remotePatterns ya `<img>`'e dönüş.

2. **Modül server action'larının çoğu kapısız — kapı yalnız sayfalarda.**
   Sayfa kapısı POST uç noktasını korumaz; `assertModuleAccess` var ama iki modül
   dışında çağrılmıyor:
   ```
   src/modules/m2/server/actions.ts:  4 action, 0 assertModuleAccess
   src/modules/m4/server/actions.ts:  3 action, 0
   src/modules/m7/server/actions.ts:  3 action, 0
   src/modules/m8/server/actions.ts:  3 action, 0
   src/modules/m10/server/actions.ts: 5 action, 0   ← :28 generateStandardDoc, :115 signDocument,
                                                      :135 createNewVersion, :184 submitDualApprovalAction,
                                                      :190 departmentApproveAction
   src/modules/m11/server/actions.ts:14 action, 0
   (yalnız m6: 5/6 ve m9: 2/3 kapılı)
   ```
   Somut sonuç: M10 sayfası artık plan yüzünden kilitli ama `generateStandardDoc`
   doğrudan POST'lanırsa hâlâ belge üretir ve **kredi düşer**. Bu görevin kapsamı
   `src/lib/modules/**` olduğu için dokunmadım; ayrı bir kart hak ediyor.

3. **Kenar çubuğu, kiracının sahip olmadığı modülleri listeliyor.**
   `src/components/SidebarNav.tsx:31-33` — `tto` (M7), `approvals` (M10), `marketplace`
   bağlantıları koşulsuz basılıyor. `pro` planındaki demo kiracı bunları görüyor,
   tıklıyor ve artık kilit ekranına düşüyor. İşlevsel olarak güvenli ama kötü UX;
   nav'ın da kapıdan türetilmesi gerekir (kapıyı kopyalayarak değil, `checkModuleAccess`
   sonucundan).

4. **`ModuleProvider` hiçbir yerde monte edilmiyor — istemci kancaları ölü kod.**
   `src/lib/modules/hooks.tsx:16` `ModuleProvider`, `:30` `useModuleEnabled`, `:47`
   `requireModule`. Depoda tek bir mount noktası yok (`grep -rn "ModuleProvider" src/`
   yalnız tanımı buluyor), yani `useModuleEnabled` **her zaman `false`** döner ve
   `requireModule(...)` ile sarılan her bileşen kilit yazısı basar. Ayrıca
   `hooks.tsx:71` reddediş sebebini sabit `reason.MODULE_OFF` olarak yazıyor; monte
   edilirse plan reddini "yöneticiniz kapatmış" diye yanlış anlatır.

5. **`settings/modules` sayfasında gömülü modül listesi.**
   `src/app/[locale]/(app)/[workspace]/settings/modules/page.tsx:35` —
   `activeModules: ['M1','M2','M3','M4','M5','M8']` sabit dizisi DB okunamazsa yedek
   olarak kullanılıyor. Bugün `pro` planının kapsamıyla aynı olduğu için fark edilmiyor;
   plan merdiveni değişince sessizce yanlış kart durumu gösterir.
