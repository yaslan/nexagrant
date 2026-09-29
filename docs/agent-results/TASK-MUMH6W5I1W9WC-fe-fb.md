# TASK-MUMH6W5I1W9WC — Modüller sayfası yanıltıcı "PRO" (MVP ölçümü B-5) · fe-fb

## 1) Ne yapıldı

**Kök neden.** `settings/modules/page.tsx:32-36` ve `actions.ts:54` aboneliği olmayan kiracıya `'pro'` planını varsayıyordu. Sayfa buna ek olarak, `ModuleState` satırı olmayan kiracıda M1–M5 ile M8'i "Aktif" gösteriyordu. `canEnable` da plan kimliğini manifestin `planTiers` listesiyle karşılaştırıyordu; bu liste `free` ve `public-team` kimliklerini hiç içermiyor. Sonuç olarak yeni kiracı sayfada Pro plan görüyordu, eylem de modül kapısının reddettiği modüller için `ON` satırı yazabiliyordu (se-fb kare 09/10).

**Düzeltme.** Billing ve active-tier mantığı değişmedi, yalnız okunuyor.

- Yeni `settings/modules/plan-view.ts` → `readModulesPlanView(tenantId, tx, locale)`. Sayfa ve eylem bu tek okumayı kullanıyor:
  - **Plan kimliği:** `getEntitlements` ile aynı kural. Abonelik `TRIALING`/`ACTIVE` ise `resolvePlanId(planId)`, değilse `FALLBACK_PLAN_ID` (`free`). Görünen ad katalogdan geliyor (`grantsFor().name`): Discover / Pro / Belediye Ekip.
  - **Açık modüller:** `getEntitlements().allowedModules`. Modül kapısı (`checkModuleAccess`) da aynı kaynağı kullanıyor.
  - **Aktif modüller:** `ModuleState` ON/PILOT/DEV **ve** plan kapsamında olmalı. Düşürme sonrası plan dışında açık kalan satır aktif sayılmıyor, bağımlılığı da karşılamıyor. Bu satırlar `switchedOnOutsidePlan` alanında ayrıca raporlanıyor.
  - **Pilot:** `pilotStateOf` + `pilotLastDayLabel` (pilot.ts). Pilot sürüyorsa `{lastDay, expired:false}`, bittiyse `expired:true`.
- `state-machine.ts` → `canEnableEntitled(moduleId, active, entitledModules)`. Plan kontrolünü açık modül listesiyle yapıyor, bağımlılık kontrolü `canEnable` ile aynı. `canEnable` olduğu gibi duruyor.
- `actions.ts` → plan ve aktif modüller `readModulesPlanView`'dan okunuyor, etkinleştirme `canEnableEntitled` üzerinden yapılıyor. `'pro'` fallback'i kaldırıldı. Biten pilotta yazma işlemini zaten `requireTenantAction` → `assertTenantWritable` reddediyor.
- `page.tsx` → sabit `state` nesnesi (pro + M1–M5, M8 + "Varsayılan Çalışma Alanı") kaldırıldı. Okuma başarısız olursa `plan=null` geçiliyor.
- `client.tsx`:
  - Rozet katalogdaki plan adını gösteriyor.
  - Pilot kiracıda "PİLOT" ya da "PİLOT BİTTİ" etiketi ve "Son gün: … · yenilenmez" satırı var. Aboneliği olmayan kiracıda "Aboneliğiniz yok · ücretsiz paket" yazıyor.
  - Kilit durumu `entitledModules` ile hesaplanıyor.
  - Pilot bittiyse ya da plan okunamadıysa bir `role="status"` bandı çıkıyor ve tüm düğmeler devre dışı kalıyor.
  - "Planlar" satırında vurgulanan kademe `badgeTier` (public-team → pro).
  - Plan adında `uppercase` kaldırıldı ("DİSCOVER" yerine "Discover") ve rozetlere `whitespace-nowrap` eklendi.
- `docs/BILLING.md` §9 → `PLAN-DEFAULT-1` satırı kapatıldı olarak işaretlendi.

## 2) Kanıt

**Typecheck / lint / test:**
```
npx tsc --noEmit                         → TSC=0
npx eslint settings/modules state-machine.ts tests/modules/settings-modules-plan.test.ts → LINT=0
npx vitest run                           → Test Files 209 passed | 2 skipped (211); Tests 2402 passed | 8 skipped (2410)
```
**Yeni canlı DB testi** `tests/modules/settings-modules-plan.test.ts` (6/6). Oturum dışında hiçbir şey sahte değil, gerçek Postgres kullanılıyor:
```
✓ canEnableEntitled > refuses a module outside the entitlement list and checks dependencies inside it
✓ no subscription: Discover, nothing active, Pro module refused and not written
✓ a row switched on outside the plan is not shown active and does not satisfy a dependency
✓ running pilot: Belediye Ekip with its last day, Pro grant, M1 can be switched on
✓ expired pilot: shown as ended, and the action refuses to write
✓ paying Pro: Pro plan, no pilot
```
**Mutasyon kanıtı:** `plan-view.ts` içindeki fallback geçici olarak `'pro'` yapıldığında test kırıldı (`× no subscription: Discover, …` → `Tests 1 failed | 5 passed`). Ardından dosya yedekten geri yüklendi (`git checkout` kullanılmadı).

**Gerçek tarayıcı (:3000, bu ağaçtan çalışan `next dev`, headless Chromium).** Her kiracı `/tr/kayit` formu gerçekten doldurularak açıldı: e-posta yazıldı, KVKK kutusu işaretlendi, "Çalışma Alanı Oluştur" tıklandı. Plan satırı gerçek fonksiyonla kuruldu (`grantPilot` / Stripe ACTIVE pro satırı). Sonra `/tr/default/ayarlar/moduller` açıldı ve **Etkinleştir** düğmesine gerçekten tıklandı. Kareler `docs/agent-results/TASK-MUMH6W5I1W9WC-screenshots/` altında.

| Kiracı | Başlık (sayfa metni) | Tıklama → DB |
|---|---|---|
| Aboneliksiz (`sonra-none*.png`) | `Discover \| Aboneliğiniz yok · ücretsiz paket`. 0/11 aktif, M1/M2/M4… 🔒 Kilitli + "Planı Yükselt" | M1'de Etkinleştir yok (upgrade link=1). M3 tıklandı → toast "M3 modülü başarıyla aktifleştirildi!" → DB `[{M3, ON}]` |
| Pilot (`sonra-pilot*.png`) | `Belediye Ekip \| PİLOT \| Son gün: 27 Aralık 2026 · yenilenmez` | M1 tıklandı → toast başarılı → DB `[{M1, ON}]`, `sub={public-team, TRIALING, pilot, 2026-12-27T21:00Z}` |
| Pilot bitti (`sonra-pilot-expired*.png`) | `Belediye Ekip \| PİLOT BİTTİ \| Son gün: 27 Eylül 2026 · yenilenmez` + "salt okunur" bandı | M1 düğmesi `disabled: true`, DB `states: []` |
| Ödeyen Pro (`sonra-pro*.png`) | `Pro` | M1 tıklandı → başarılı → DB `[{M1, ON}]` |

**Önce:** `docs/agent-results/TASK-MULQMFVLJYZ5V-screenshots/10-moduller-yeni-kiraci.png` (se-fb). Yeni kiracı orada sabit "PRO" ve 6 aktif modül görüyordu.

**Duyarlılık:** Her kiracının 390 px karesi var (`*-mobil.png`). Yatay taşma her dört kiracıda `0 px`.

**Platform beyanı:** Doğrulama yalnız **macOS**'ta yapıldı (Darwin 27, headless Chromium 1243, Node 26). Değişen kod platforma bağlı değil: süreç, dosya yolu, kabuk ya da kısayol kullanmıyor; sunucu tarafında TS ve React çalışıyor. Tarih etiketi `Intl` ile `Europe/Istanbul` saat diliminde üretiliyor (pilot.ts, değişmedi). Windows ve Linux'ta çalıştırılmadı, çünkü bu makinede yalnız mac var. Kodda platforma bağlı bir dal olmadığı için farklı bir davranış beklenmiyor.

## 3) Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/settings/modules/plan-view.ts` (yeni)
- `src/app/[locale]/(app)/[workspace]/settings/modules/page.tsx`
- `src/app/[locale]/(app)/[workspace]/settings/modules/actions.ts`
- `src/app/[locale]/(app)/[workspace]/settings/modules/client.tsx`
- `src/lib/modules/state-machine.ts` (`canEnableEntitled` eklendi)
- `tests/modules/settings-modules-plan.test.ts` (yeni)
- `docs/BILLING.md` (§9 `PLAN-DEFAULT-1` kapatıldı)
- `docs/agent-results/TASK-MUMH6W5I1W9WC-screenshots/*.png` (11 kare), bu rapor

## 4) Riskler
- **Davranış değişikliği (bilerek yapıldı):** Aboneliği olmayan kiracılar artık yalnız M3 ve M5'i açabiliyor. Daha önce `'pro'` fallback'iyle yazılmış `ON` satırları DB'de duruyor. Bu satırlar sayfada "Kilitli" görünüyor, aktif sayılmıyor, bağımlılığı da karşılamıyor. Satırlar silinmedi. Modül kapısı bu satırları zaten reddediyordu.
- `plan-view.ts` canlı abonelik kuralını (`TRIALING`/`ACTIVE`) `getEntitlements` ile aynı şekilde kendisi uyguluyor, çünkü `getEntitlements` plan kimliğini döndürmüyor. Bu kural billing.ts'de değişirse burada da değişmesi gerekiyor. Dosyada bununla ilgili bir yorum var. Billing koduna dokunulmadı.
- Tarayıcı kanıtı için yerel geliştirme DB'sinde 10 test kiracısı ve kullanıcısı oluşturuldu (`fefb-{none,pilot,pilot-expired,pro,outside}-*@example.test`). Bunlar silinmedi.

## 5) Açık sorular
- Yok. İki soru patron tarafından yanıtlandı (29.09.2026):
  - Plan dışında açık kalan modüle **"Kapat" düğmesi eklensin** → yapıldı, bkz. §7.
  - Pilot sürerken **"Planı Değiştir" bağlantısı olduğu gibi kalsın** → dokunulmadı.

## 6) Sonraki adım
- İnceleme (review). Push yapılmadı (1 Ekim kuralı).

## 7) Ek: plan dışında açık kalan modül için "Kapat" (patron kararı, 29.09.2026)

**Ne yapıldı.** `client.tsx` içinde `plan.switchedOnOutsidePlan` listesindeki modüllerin kartında şu değişiklikler var:
- "Plan dışında açık kalmış — kullanılamaz" metni gösteriliyor.
- "Planı Yükselt" bağlantısının yanına kırmızı bir **Kapat** düğmesi eklendi. Düğme `toggleModuleState(id, 'OFF')` çağırıyor; hata olursa yapılan değişiklik geri alınıyor ve toast gösteriliyor.
- Pilot bittiyse ya da plan okunamadıysa düğme devre dışı. Eylem tarafında değişiklik yok, `OFF` zaten izinliydi.
- Pilot kiracıdaki "Planı Değiştir" bağlantısına dokunulmadı.

**Kanıt:**
- Canlı DB testine şu adımlar eklendi: plan dışı M1=ON satırı → `toggleModuleState('M1','OFF')` → satır `OFF`, `switchedOnOutsidePlan=[]`. Test geçti.
- `npx vitest run` → 209 dosya geçti, 2 atlandı; 2402 test geçti, 8 atlandı. tsc=0, lint=0.
- Tarayıcıda denendi: aboneliği olmayan kiracı kaydedildi, DB'ye M1=ON satırı eklendi ve sayfa açıldı.
  - M1 kartında `Plan dışında açık kalmış — kullanılamaz | Kapat | Planı Yükselt` görünüyor.
  - Kapat'a tıklandı → toast "M1 plan dışında açık kalmıştı; kapatıldı." çıktı.
  - Sayfa yenilenince Kapat düğmesi 0 adet.
  - DB'de `states=[{M1, OFF}]`.
  - 390 px genişlikte taşma 0 px.
  - Kareler: `sonra-outside.png`, `sonra-outside-kapat-click.png`, `sonra-outside-mobil.png`.
- Platform: yalnız macOS'ta doğrulandı. Kodda platforma bağlı bir dal yok.
