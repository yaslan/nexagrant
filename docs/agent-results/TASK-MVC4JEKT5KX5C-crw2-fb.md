# TASK-MVC4JEKT5KX5C · FO-39 — Modül Yönetimi sayfası, push öncesi inceleme (crw2-fb)

**Hüküm: PUSH'A HAZIR.** Kodda bloke eden hata yok. Bir koşul var: fe-fb raporundaki "Onay Merkezi sayfası zaten `moduleGate` ile korunuyor" cümlesi yanlış. PR açıklamasına bu hâliyle girmemeli (bkz. B1).

İncelenen: `fe-fb/fo39-modules-page` @ `64e5f2f7`, taban `origin/dev` `5482123d`. Worktree'de dosya değiştirilmedi. Testler ayrı bir scratch worktree'de, dev ile birleşik ağaçta (`merge-tree` → `8ab2511c`) koşuldu.

## Ne yapıldı
- Okundu: `git diff origin/dev...64e5f2f7`, 9 dosya, +924/−354.
- Doğrulandı: çağrılan katalog/durum fonksiyonları (`moduleStatus`, `requirementChain`, `categorySummary`, `pipelineCoverage`, `navFeatureModule`, `displayPlansForModule`). Bu fonksiyonlar `src/lib/modules/**` ve `src/lib/billing/catalog.ts` içinde.
- Doğrulandı: rota koruması (`moduleGate`) gerçekten var mı. Yok, bkz. B1.
- Koşuldu: tsc, ilgili vitest, `i18n:check` ve plan-entitlement e2e. Hepsi birleşik ağaçta.

## Odak maddeleri
| # | Madde | Sonuç |
|---|---|---|
| 1 | Sayfada sabit liste ya da kopya mantık yok (kural 3) | ✅ Durum `moduleStatus` ile hesaplanıyor; zincir `requirementChain`, planlar `displayPlansForModule` + `grantsFor().name`. Kategoriler `MODULE_CATEGORIES` + `categorySummary` + `mod.category`; kapsama `pipelineCoverage`, menü `navFeatureModule`. `client.tsx`'teki tek yerel tablolar `PLAN_BADGES`, `STATUS_STYLES` ve `MODULE_BADGE_STYLES`; üçü de yalnız CSS sınıfı tutuyor, liste ya da mantık değil. Etkinleştirme ve kademeli kapatma `canEnableEntitled` ile `getDisableCascade` üzerinden. |
| 2 | 4 durumun butonları | ✅ `client.tsx`: ORPHANED kartında Kapat (`disableOutsidePlan`) ve Planı Yükselt var. LOCKED kartında yalnız `upgradeOffer` çıkıyor, Kapat düğmesi `ACTIVE\|AVAILABLE` koşuluna bağlı olduğu için görünmüyor. Pilot kiracıda yükselt linki yerine `pilotLocked` metni çıkıyor. Bileşen testi ve e2e bunu gerçek DB satırlarıyla doğruluyor. |
| 3 | SidebarNav kilidi | ✅ Kilitli öğe `<Link>` değil, `<span>`; tıklanınca bir yere gitmiyor (test: `queryByRole('link')` null). Klavyeyle odaklanıyor (`tabIndex=0`) ve ekran okuyucuya `sr-only` ile neden kilitli olduğunu söylüyor. ⚠ **Ama rota korunmuyor**, bkz. B1. |
| 4 | i18n | ✅ `pnpm i18n:check` yeşil: "both catalogs agree, every key used in src/ resolves" (246/246, artış yok). `i18n-baseline.json`'dan `modules/client.tsx: 24` ve `page.tsx: 2` satırları silinmiş, yani iki dosya artık sıfır sabit metne indi ve kapı bunu kabul etti. |
| 5 | Testler gevşek mi | ✅ Genelde sıkı: butonlar `toEqual([M.disable])` ile tam liste olarak karşılaştırılıyor, zincir sırası regex'le kontrol ediliyor, ORPHANED → Kapat → LOCKED geçişi ve DB'de `OFF` olduğu da doğrulanıyor. Tek gevşek nokta kapsama assert'i (Ö3). |
| 6 | Güncel dev ile çakışma | ✅ `git merge-tree --write-tree origin/dev 64e5f2f7` temiz (`8ab2511c`). Taban `5482123d` #79'u zaten içeriyor. Dev'e o tabandan sonra yalnız #86 (`29c2e818`) girdi; birleşik ağaçta tsc, vitest, i18n ve e2e yeşil. |

## Kanıt (ham çıktı, birleşik ağaç)
```
$ git merge-tree --write-tree --name-only origin/dev 64e5f2f7
8ab2511cbe73ed4136c2114148fa57f5f5e56d86          # çakışma satırı yok

$ npx tsc --noEmit            → tsc=0

$ (set -a; . FONBRIDGE/.env) npx vitest run tests/settings-modules-status.test.tsx \
    tests/module-entry-points.test.tsx src/lib/modules src/lib/billing
 Test Files  16 passed (16)
      Tests  270 passed (270)
# (.env yüklenmeden: 35 fail. Hepsi DB'li dosyalar (planAssignment.deleteMany…), FO-39 testleri değil)

$ pnpm i18n:check
  Literals found:   246 in 31 file(s)
  Baseline allows:  246 in 31 file(s)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

$ E2E_PORT=3187 npx playwright test tests/e2e/plan-entitlement.spec.ts
[seed-plan-e2e] rolled back
  4 passed (51.5s)
```
E2E bu koşuda 3 durumun ekran görüntüsünü (1280 + 375 px) yeniden üretti. 375 px'te yatay taşma assert'i (`horizontal scroll at 375px ≤ 0`) geçti. fe-fb'nin görüntüleri `/Users/macbook/alan/docs/artifacts/FO-39/TASK-MVC4JEKT5KX5C-screenshots/` altında.

## Bulgular (önem sırasıyla)

### B1 — Rota korunmuyor ve fe-fb raporu bunun tersini söylüyor (belge düzeltmesi zorunlu; kod bu kartta bloke etmiyor)
- Kanıt: aşağıdaki dosyaların hiçbirinde `moduleGate`, `assertModuleAccess` ya da `requireModule` yok (`grep` boş döndü):
  - `src/app/[locale]/(app)/[workspace]/approvals/page.tsx` (ve onu yeniden dışa veren `onay-merkezi/page.tsx`)
  - `settings/api-keys/page.tsx`
  - bu sayfaların `actions.ts` dosyaları
- `(app)/layout.tsx` yalnız `listAccessibleModules()` ile menü listesini hesaplıyor. "the pages still gate themselves" yorumu bu iki sayfa için doğru değil.
- Senaryo: M5'i kapalı bir kiracıda kullanıcı menüde kilitli "Onay Merkezi"ni görüyor. Ama `/tr/<ws>/onay-merkezi` adresine doğrudan giderse sayfa açılıyor ve onay işlemleri çalışıyor. Aynısı M1 kapalıyken `/ayarlar/api-anahtarlari` için de geçerli.
- fe-fb raporu, `Riskler` bölümü satır 84: "Sayfanın kendisi zaten `moduleGate` ile korunuyor" diyor. Bu yanlış. PR açıklamasına bu hâliyle geçerse okuyan kişi kapının kapalı olduğunu sanır.
- Patronun isteği ("kilitli görünsün") ve kartın kapsamı ("yalnız settings/modules + SidebarNav") açısından FE işi tam. Kapsam dışına taşmamak için bu kartta kod istemiyorum.
- **Öneri:**
  1. fe-fb raporundaki cümleyi "sayfalar korunmuyor; kilit yalnız görünüm" diye düzeltsin.
  2. Ayrı bir BE kartı açılsın: approvals/onay-merkezi için `moduleGate('M5')`, api-keys için `moduleGate('M1')`, ve ilgili server action'lara `assertModuleAccess`.
  3. Ürün kararı da gerekiyor: 4-Eyes onayı başka modüllerin akışında da kullanılıyorsa M5'e kilitlemek o akışları kırabilir. BE kartında bu karar açık soru olarak yazılmalı.

### Ö1 — Kilitli menü öğesinin erişilebilirlik ince ayarı (öneri)
- `SidebarNav.tsx`: `<span aria-disabled tabIndex=0>` için rol tanımlı değil. ARIA 1.2'de `aria-disabled` rolü olmayan bir `span` üzerinde anlam taşımaz.
- Aynı metin hem `title` hem `sr-only` olarak var; bazı ekran okuyucular iki kez okur.
- Öneri: `role="link" aria-disabled="true"` ekle, ipucu için `title` yerine `aria-describedby` kullan. Bloke etmiyor; mevcut hâliyle de kilit sebebi okunuyor.

### Ö2 — Tooltip, rol ya da pilot nedenli kapanışta da "modül kapalı" diyor (öneri)
- `activeModules` = `listAccessibleModules` = plan + `ModuleState` + rol (`decideModuleAccess`: `PILOT_MANAGERS_ONLY`, `DEV_INTERNAL_ONLY`).
- Senaryo: M5 `pilot` durumunda, kullanıcı MEMBER. Menü "M5 … modülü kapalı" diyor, oysa modül açık; yalnız bu rol erişemiyor. Nadir ve zararsız bir yanlış mesaj.

### Ö3 — Pipeline kapsama assert'leri gevşek (öneri)
- `tests/settings-modules-status.test.tsx`: `toMatch(/\d\/5 aşama/)`; e2e: `toContainText('/5 aşama')`. Sayı yanlış hesaplansa da test geçer.
- Öneri: beklenen değeri testte `pipelineCoverage(['M1','M3']).covered.length` ile al ve tam eşitlik iste.

### Ö4 — `check.reason` İngilizce olarak tosta düşebilir (öneri, eski kod)
- `client.tsx` `handleToggle`: `check.reason || t('toastEnableBlocked')`. `canEnableEntitled` İngilizce sabit metin döndürüyor (`'Plan upgrade required.'`).
- Bugün bu yola girilmiyor: Aç düğmesi yalnız AVAILABLE kartında çıkıyor ve eksik bağımlılık durumu ayrıca ele alınıyor. Yine de `check.reason` yerine her zaman `t('toastEnableBlocked')` kullanmak daha güvenli.
- Eski davranış (`check.reason || 'Etkinleştirme…'`) da aynıydı, yani regresyon değil.

## Değişen dosyalar (bu inceleme)
- `FONBRIDGE/docs/agent-results/TASK-MVC4JEKT5KX5C-crw2-fb.md` (bu dosya)
- `/Users/macbook/alan/docs/agent-results/TASK-MVC4JEKT5KX5C-fe-fb-2.md` (teslim yolu, aynı içerik)
- fe-fb worktree'sine dokunulmadı. Scratch worktree testten sonra kaldırıldı.

## Riskler
- B1: menüdeki kilit güvenlik sınırı değil. BE takip kartı açılana kadar M5 ya da M1 kapalı kiracılar bu sayfalara URL ile girebilir. Bu, FO-39'dan önce de böyleydi; FO-39 yeni bir açık yaratmıyor.

## Açık sorular
- Onay Merkezi gerçekten M5'e kilitlenmeli mi, yoksa yalnız menüde mi gizlenmeli? (Ürün/patron kararı; BE kartında sorulmalı.)

## Sonraki adım
1. fe-fb: raporun satır 84'ünü düzeltip push etsin. Ö1–Ö4 isteğe bağlı.
2. Lider: approvals ve api-keys için `moduleGate` BE kartını açsın.
3. Merge yapmadım, approve vermedim.

**Platform:** mac (Darwin, Chromium/Playwright 1280 ve 375 px). Değişiklik yalnız web UI ve testleri kapsıyor, platforma bağlı kod yolu yok. Windows ve Linux'ta koşulmadı, çünkü koşacak platforma özgü bir şey yok.
