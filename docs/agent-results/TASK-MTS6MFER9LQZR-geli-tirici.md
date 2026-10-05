# TASK-MTS6MFER9LQZR — dört kanıt-disiplini e2e testi (geli-tirici / BE-EN)

S12 dalga 3, iş 4. Kapsam: `tests/e2e/dashboard-outcome-case.spec.ts`,
`tests/e2e/f10-absence-not-zero.spec.ts`, `tests/e2e/gate-tenant-isolation.spec.ts`,
`tests/e2e/m10-audit-identity.spec.ts` ve ilgili ürün kodu.

---

## 1. Ne yapıldı

### Kartın iddiası ve ölçüm

Kart bu dört testin kırmızı olabileceğini ve **"ürün tarafında gerçek bir açık"** işaret
edebileceğini söylüyordu. Sessiz bir ağaçta ölçtüm: **dördü de kırmızıydı (11 testten 4'ü
başarısız, 1'i hiç koşmadı)** — ama **hiçbiri ürün açığı değildi**. Dördü de aynı türden:
*testin varsaydığı durum, ürünün o günden beri doğru biçimde sıkılaştırdığı kurala uymuyordu.*
Her birinde önce ürünün ne yaptığını Postgres'ten / canlı sayfadan ölçtüm, ürünün haklı
olduğunu doğruladım, sonra testi/fixture'ı gerçeğe göre düzelttim.

| # | Test | Kırmızı olma sebebi | Ürün hatalı mı? |
|---|------|---------------------|-----------------|
| 1 | `dashboard-outcome-case` | Testte sabit `5` fırsat / `%20.0` yazıyordu; DB'de 7 fırsat / 1 eşik-üstü = **%14.3** | **Hayır** — KPI doğru okuyor |
| 2 | `f10-absence-not-zero` (5. test) | Fixture kiracısının `Subscription`'ı yok → plan `free` → M6 (Evaluator Lens) plan kapsamı dışında, sayfa plan kapısını gösteriyor | **Hayır** — CLAUDE.md kural 4 gereği doğru ret |
| 3 | `gate-tenant-isolation` | Fixture kiracısında hiç `ModuleState` satırı yok → M5 "kapalı" → pipeline sayfası modül kapısını gösteriyor, buton hiç yok | **Hayır** — doğru ret |
| 4 | `m10-audit-identity` | `demo-tenant` planı `pro`, M10 yalnız `ultra` ile satılıyor → plan kapısı reddediyor | **Hayır** — doğru ret |

Ek olarak, ölçüm sırasında testlerin kendisinde **iki gerçek kusur** buldum ve düzelttim:

- **`waitForLoadState('networkidle')`** — dört spec'te toplam 5 yerde. Yüklü bir makinede dev
  sunucusu hiç 500 ms sessiz kalmıyor, dolayısıyla bu bir sinyal değil **yarış**. Ölçüm:
  aynı dört spec, aynı kodla, `networkidle` varken **11.3 dakika / 2 timeout**, kaldırıldıktan
  sonra **22 saniye / 0 hata**. Yerine beklenen locator'ı bekletiyorum (Playwright'ın kendi
  auto-wait'i) — assertion'ların hiçbiri gevşetilmedi.
- **`dashboard-outcome-case` kendi doküman yorumunda "veritabanından alınan aynı sayımla
  karşılaştırır" diyordu ama veritabanına hiç bakmıyordu** — ezberlenmiş iki sabit vardı.
  Artık gerçekten sayıyor (aşağıda).

### Yapılan değişiklikler

**`tests/e2e/dashboard-outcome-case.spec.ts`** — beklenen değerler artık Postgres'ten türetiliyor:
aynı kiracı, aynı pencere. Pencere kuralı (`YYYY-MM-DD`, `to` dahil, 30 günlük varsayılan) ve
eşik-üstü sözlüğü (`funded | reserve | above_threshold`) test içinde **yeniden yazıldı**, ürün
kodundan import edilmedi — böylece test hâlâ kuralı *beyan ediyor*, test ettiği kodla hemfikir
olmuyor. Gevşetme olmasın diye iki koruma eklendi: pencerede fırsat sayısı > 0 **ve** eşik-üstü
sayısı > 0 olmak zorunda; aksi halde test "0 / 0" üzerinden sessizce yeşile geçebilirdi ki bu
tam da hatanın ürettiği okumaydı. `Başarı Oranı,0.0,%` yasağı yerinde duruyor.

**`scripts/seed-gate-e2e.ts`** — A kiracısına `ModuleState M5 = ON` ekleniyor (M5 her planda
var, abonelik gerekmiyor); `rollback` artık bu satırları da siliyor.

**`scripts/seed-f10-e2e.ts`** — yalnız `f10-full-tenant`'a `pro` aboneliği (M6'yı içeren en ucuz
plan); `rollback` aboneliği siliyor. Boş kiracı bilerek plansız bırakıldı — onun tüm iddiaları
M5 panosunda ve fixture'ın etki alanı küçük kalsın.

**`tests/e2e/m10-audit-identity.spec.ts`** — `demo-tenant` planı test süresince `ultra`'ya
alınıp `afterAll`'da geri konuyor; bu, `tests/e2e/module-plan-gate.spec.ts`'in zaten kullandığı
desen (icat değil, yeniden kullanım). Spec'in başındaki "ön koşul" notu düzeltildi: entitlement
tek değil **iki** olgu — `ModuleState` ON *ve* planın modülü satması.

**`tests/e2e/gate-tenant-isolation.spec.ts` / `f10-absence-not-zero.spec.ts`** — `networkidle`
yarışları kaldırıldı.

---

## 2. Kanıt (hepsi bu koşuda üretildi)

### 2.1 Kırmızı hâl — sessiz ağaçta ilk temiz ölçüm

```
$ E2E_PORT=3120 npx playwright test tests/e2e/dashboard-outcome-case.spec.ts \
    tests/e2e/f10-absence-not-zero.spec.ts tests/e2e/gate-tenant-isolation.spec.ts \
    tests/e2e/m10-audit-identity.spec.ts
  ✘   1 dashboard-outcome-case.spec.ts:34:5 › the panel export reports the above-threshold rate…
  ✓   2 f10 › an empty workspace explains itself instead of reporting a 0 % hit rate (2.7s)
  ✓   3 f10 › the same empty state reads in English (2.4s)
  ✓   4 f10 › a populated workspace shows its real figures (2.4s)
  ✓   5 f10 › a date range with no opportunities says that (3.7s)
  ✘   6 f10 › an unfilled evaluation reads "not evaluated" (12.4s)
  ✘   7 gate-tenant-isolation › tenant A can still run its own gate (1.0m)
  -   8 gate-tenant-isolation › tenant A cannot gate tenant B's opportunity
  ✘   9 m10-audit-identity › a real signed-in user sees the workflow and no invented signer (11.0s)
  ✓  10 m10-audit-identity › an identity-less visitor never reaches the approval surface (1.6s)
  ✓  11 m10-audit-identity › an identity-less POST to an M10 action is refused (23ms)
  4 failed / 1 did not run / 6 passed (1.7m)
```

### 2.2 İddia 1 yanlış — KPI doğru, testteki sabit eski

Canlı endpoint'in döndürdüğü CSV (`page.request.get('/api/dashboard/export-csv')`, gerçek oturumla):

```
Toplam Teklif,7,adet,"09.08.2026 - 08.09.2026"
Başarı Oranı,14.3,%
```

Aynı pencerede veritabanının kendisi:

```
$ npx tsx -e "…resolveDashboardRange + prisma.opportunity.findMany…"
alice tenant demo-tenant role PIPELINE_MANAGER
range 2026-08-08T21:00:00.000Z -> 2026-09-08T20:59:59.999Z
total in window: 7
 - demo-opp-1 G0 outcome= null
 - demo-opp-2 G1 outcome= null
 - demo-opp-3 G2 outcome= "above_threshold"
 - demo-opp-4 G3 outcome= null
 - demo-opp-5 G4 outcome= null
 - cmtrmwgmy001493xkt7gyg4mm G0 outcome= null   ← fixture kalıntısı, bkz. §4
 - cmtrmxtin0002d9xk0cif5ky6 G0 outcome= null   ← fixture kalıntısı, bkz. §4
aboveThreshold: 1
```

1/7 = %14.3. Test `5` / `%20.0` bekliyordu. **Ürün doğru, test eski.** Düzeltilmiş test artık
bu sayımı kendisi yapıyor ve şunu basıyor:

```
--- database says 1/7 = 14.3 % above threshold ---
--- CSV returned by the live endpoint ---
KPI,Değer,Birim,Dönem
Toplam Teklif,7,adet,"09.08.2026 - 08.09.2026"
Başarı Oranı,14.3,%
```

### 2.3 İddia 2/3/4 yanlış — sayfalar doğru reddediyor

Pipeline detay sayfası, gate fixture kiracısıyla (canlı sayfa metni):

```
$ npx tsx probe-gate.ts
URL after login: http://localhost:3120/tr/gate-e2e-ws-a/pipeline/gate-e2e-opportunity-a
--- MAIN TEXT ---
🔒
Bu modül şu anda kullanılamıyor
Proposal Production Workflows modülü kiracınızda kapalı.
--- testids on page ---
["feedback-open"]                      ← pipeline-evaluate-gate hiç yok
```

M10 doküman sayfası, `demo-tenant` (plan `pro`) ile:

```
$ npx tsx probe-m10.ts
demo-tenant ModuleState: [… {"id":"ms-demo-m10","moduleId":"M10","status":"ON"} …]
subscription: {"tenantId":"demo-tenant","planId":"pro","status":"ACTIVE"}
status 200 url http://localhost:3120/tr/main/opportunities/demo-opp-1/documents
--- MAIN TEXT ---
🔒
Bu modül şu anda kullanılamıyor
Follow-up Documents modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Ultra.
```

F10 değerlendirme sayfası (aynı sınıf, plan kapısı):

```
- unexpected value "🔒Bu modül şu anda kullanılamıyorEvaluator Lens modülü aboneliğinizin
  kapsamı dışında. Şu planlarda yer alıyor: Pro, Ultra."
```

Üçü de CLAUDE.md kural 4'ün ("modül `on` olsa da plan kapsamı dışındaysa kullanılamaz")
doğru uygulanması. Ürün açığı yok.

### 2.4 Yeşil hâl — düzeltmelerden sonra

```
$ E2E_PORT=3120 npx playwright test <dört spec>
  ✓   1 dashboard-outcome-case.spec.ts:80:5 › the panel export reports the above-threshold rate… (3.0s)
  ✓   2 f10 › an empty workspace explains itself instead of reporting a 0 % hit rate (2.8s)
  ✓   3 f10 › the same empty state reads in English (3.2s)
  ✓   4 f10 › a populated workspace shows its real figures — including a hit rate that is really 0 (2.2s)
  ✓   5 f10 › a date range with no opportunities says that, not that the workspace is empty (3.0s)
  ✓   6 f10 › an unfilled evaluation reads "not evaluated", never "0.0 / 15.0 below threshold" (2.1s)
  ✓   7 gate › tenant A can still run its own gate, and the decision is filed (2.2s)
  ✓   8 gate › tenant A cannot gate tenant B's opportunity, against the real database (15ms)
  ✓   9 m10 › a real signed-in user sees the workflow and no invented signer (1.1s)
  ✓  10 m10 › an identity-less visitor never reaches the approval surface (1.3s)
  ✓  11 m10 › an identity-less POST to an M10 action never succeeds and never signs (38ms)
  11 passed (22.1s)
```

Arka arkaya iki koşu, aynı sonuç — kararlı: `11 passed (22.1s)` ve `11 passed (21.6s)`.
İkinci koşudan sonra paylaşılan durum kontrolü:

```
demo-tenant plan: {"planId":"pro","status":"ACTIVE"}
gate fixture tenants left: 0
f10 fixture tenants left: 0
```

Aynı dört spec **çalışan ağacın sunucusunda da** (`:3000`, diğer ajanların commit'lenmemiş
kodu dahil) yeşil: `11 passed (10.9s)`.

Ekran görüntüleri (hepsi 8 Eylül 08:17'de bu koşuda üretildi):

- `docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/01-export-tab.png`, `dashboard-metrics.csv`
- `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/01..06-*.png`
- `docs/agent-results/TASK-MTQZMLLZE1I29-screenshots/01-detail-before-gate.png`,
  `02-detail-after-gate.png` — ikincisinde **"G2 kapısı geçildi."** bandı görünüyor
- `docs/agent-results/TASK-MTR60M5ESB5PZ-screenshots/01-real-user-dual-approval.png` —
  Alice olarak "ÇİFT ONAYLI KURUMSAL YETKİ AKIŞI" render ediliyor, uydurma imzacı yok

### 2.5 networkidle: önce / sonra (aynı kod, aynı makine)

```
networkidle varken:   2 failed / 9 passed (11.3m)   ← ikisi de "page.waitForLoadState: Test timeout of 60000ms exceeded"
networkidle yokken:   11 passed (22.1s)
```

### 2.6 Fixture'lar additive + idempotent (iki kez koşma kanıtı)

```
$ npx tsx scripts/seed-gate-e2e.ts        # run 1
[seed-gate-e2e] ready — tenantA=gate-e2e-tenant-a … clearedDecisions=0
$ npx tsx scripts/seed-gate-e2e.ts        # run 2
[seed-gate-e2e] ready — tenantA=gate-e2e-tenant-a … clearedDecisions=0
$ npx tsx scripts/seed-f10-e2e.ts         # run 1
[seed-f10-e2e] ready — empty=f10-empty-ws full=f10-full-ws opportunity=f10-full-opp-a
$ npx tsx scripts/seed-f10-e2e.ts         # run 2
[seed-f10-e2e] ready — empty=f10-empty-ws full=f10-full-ws opportunity=f10-full-opp-a

iki koşudan sonra durum:
gate M5 states : [{"tenantId":"gate-e2e-tenant-a","moduleId":"M5","status":"ON"}]   ← tek satır
f10 subscription: [{"tenantId":"f10-full-tenant","planId":"pro","status":"ACTIVE"}] ← tek satır
f10 moduleStates: 4
```

Geri alma yolu, iki kez koşuldu (ikincisi de güvenli):

```
$ npx tsx scripts/seed-gate-e2e.ts --rollback   → [seed-gate-e2e] rolled back
$ npx tsx scripts/seed-gate-e2e.ts --rollback   → [seed-gate-e2e] rolled back
$ npx tsx scripts/seed-f10-e2e.ts  --rollback   → [seed-f10-e2e] rolled back
$ npx tsx scripts/seed-f10-e2e.ts  --rollback   → [seed-f10-e2e] rolled back

gate tenants left: 0
gate moduleStates left: 0
f10 tenants left: 0
f10 subscriptions left: 0
demo-tenant plan: {"planId":"pro","status":"ACTIVE"}     ← paylaşılan durum bozulmadı
```

### 2.7 Kapı

```
$ pnpm lint
✖ 9 problems (0 errors, 9 warnings)          ← 0 hata; 9 uyarının hiçbiri benim dosyalarımda değil

$ pnpm typecheck
$ tsc --noEmit                               ← çıktı yok, temiz

$ pnpm test
 Test Files  99 passed | 2 skipped (101)
      Tests  1128 passed | 8 skipped (1136)
```

---

## 3. Değişen dosyalar

| Dosya | Ne değişti |
|---|---|
| `tests/e2e/dashboard-outcome-case.spec.ts` | Beklenen sayı/oran veritabanından türetiliyor; pencere kuralı + eşik sözlüğü test içinde beyan ediliyor; "0/0 ile sessiz yeşil" koruması; `networkidle` kaldırıldı |
| `tests/e2e/f10-absence-not-zero.spec.ts` | İki `networkidle` yarışı kaldırıldı (assertion değişmedi) |
| `tests/e2e/gate-tenant-isolation.spec.ts` | İki `networkidle` yarışı kaldırıldı; buton beklemesi 30 sn'ye çıkarıldı; ekran görüntüsü butondan sonra alınıyor |
| `tests/e2e/m10-audit-identity.spec.ts` | Ön koşul olarak plan `ultra`'ya alınıp geri konuyor; doküman notu iki-olgulu entitlement'ı anlatıyor; anonim POST probe'unun **ne kanıtladığı / ne kanıtlamadığı** yazıldı |
| `scripts/seed-gate-e2e.ts` | `ModuleState M5 = ON`; rollback bunu da siliyor |
| `scripts/seed-f10-e2e.ts` | `f10-full-tenant` için `pro` aboneliği; rollback bunu da siliyor |
| `docs/agent-results/…-screenshots/*` | Bu koşuda yeniden üretilen 11 kanıt dosyası |

Bana verilen liste dışında **hiçbir ürün dosyasına dokunulmadı**. `src/lib/auth.ts`,
`src/components/UserMenu.tsx`, `src/modules/m11/**` açılmadı bile.

---

## 4. Yol üstünde görülen, DÜZELTİLMEYEN şeyler (kural b — bildirim)

1. **`demo-tenant`'ta iki kayıtsız fırsat kalıntısı.**
   `cmtrmwgmy001493xkt7gyg4mm` ve `cmtrmxtin0002d9xk0cif5ky6`, ikisi de
   *"İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri"* başlıklı, `demo-workspace`
   içinde, 2026-09-07 19:29 ve 19:30'da yaratılmış. Paylaşılan demo kiracısına yazıp geri
   almayan bir koşunun kalıntısı. Panonun 5 → 7'ye kaymasının **doğrudan sebebi** bu.
   Silmedim (yıkıcı + kapsam dışı).

2. **`tests/e2e/m9-calendar-connect.spec.ts:4` ve `tests/e2e/fabricated-fallbacks.spec.ts:3`**
   `scripts/seed-f10-e2e`'den `seed`'i import edip çağırıyor ama `rollback` çağırmıyor —
   F10 fixture'ı bu spec'ler koştuktan sonra paylaşılan veritabanında kalıyor.

3. **`tests/e2e/m10-audit-identity.spec.ts:139` — anonim POST probe'u 404 üzerinden geçiyor.**
   Ölçüm: `curl -X POST … -H "Next-Action: 40e67602bd5a3cd92b8e2d385591c18061662e4d26"` →
   **`status=404`**. Bu id çalışan uygulamanın server-reference manifest'inde yok; oradaki
   canlı id'ler `4010a290bb…`, `40201e0b9d…`, `40be12daa5…`, `608ca0da9e…`, `700b97fe88…`.
   Yani test, action anonim çağrıyı imzalasa bile yeşil kalırdı. Assertion'ı kaldırmadım
   (regresyon ağı olarak duruyor) ama **spec'e ne kanıtlayıp ne kanıtlamadığını yazdım**.
   Gerçek bağlaması için action id'sinin koşum anında çözülmesi gerekiyor; bu Next'in
   `__next_internal_action_entry_do_not_use__` iç yapısına bağlanmayı gerektirdiği için
   tahminle yapmadım — açık madde olarak §5'te.

4. **`tests/e2e/translation.test.ts:10`** (`should translate a batch of topics to Turkish`)
   yük altında bir kez kırmızı verdi, tek başına ve ikinci tam koşuda yeşil. Canlı bir çeviri
   çağrısına bağlı görünüyor; yüklü makinede kırılgan. Benim dosyam değil, dokunmadım.

5. **Altyapı — paylaşılan ağaçta paralel e2e mümkün değil.**
   (a) Next 16 aynı dizinde ikinci bir `next dev`'i reddediyor (`.next/dev/lock`), bu yüzden
   ajan başına ayrı port (`E2E_PORT=3120`) doğrudan çalışmıyor: 3000'de 5 saatlik bir dev
   sunucusu kilidi tutuyordu. Çözüm olarak `git worktree` + `next dev --webpack` kullandım
   (Turbopack, kök dışına çıkan `node_modules` symlink'ini reddediyor).
   (b) Eş zamanlı `playwright test` koşuları paylaşılan `test-results/` dizinini siliyor **ve**
   birbirlerinin DB fixture'larını (`seed`/`rollback` aynı id'ler) yok ediyor. İlk ölçümüm
   bu yüzden sahte kırmızı verdi; raporlanan tüm sayılar ağaç sessizken alındı.

---

## 5. Riskler

- **`m10-audit-identity` paylaşılan `demo-tenant` planını geçici olarak `ultra` yapıyor.**
  `afterAll` geri alıyor (yukarıda doğrulandı) ve bu, `module-plan-gate.spec.ts`'in zaten
  uyguladığı desen — ama aynı anda koşan başka bir spec o aralıkta M10'u açık görebilir.
  Paylaşılan bir demo kiracısı üzerinde plan çeviren iki spec olması yapısal bir kırılganlık.
- **`f10-full-tenant`'a eklenen `pro` aboneliği** aynı fixture'ı kullanan iki spec'i de
  etkiliyor (`m9-calendar-connect`, `fabricated-fallbacks`). İkisi de M5 yüzeylerinde çalışıyor
  ve plan kapısına dayanmıyor; ikisi de bu koşuda taranıp doğrulandı, ama plan artık `free`
  değil — ileride plan-kapısı iddiası eklerlerse bunu bilmeleri gerekir.
- Ölçümlerin çoğu **HEAD'i sunan** izole bir worktree sunucusunda alındı; çalışan ağaçta
  (`documents/client.tsx`, `UserMenu.tsx`, `m11/**` başka ajanların elinde) da ayrıca
  doğrulandım ve yeşildi — ama o kod hâlâ değişiyor.

## 6. Açık sorular

- Anonim M10 action probe'u için: action id'sini koşum anında çözelim mi (Next'in iç
  manifest'ine bağlanmak pahasına), yoksa bu sınırı e2e yerine bir entegrasyon testine mi
  taşıyalım? Karar M10 sahibinin.
- `demo-tenant` planını çeviren iki e2e spec'i var. Bunun yerine kalıcı bir `ultra` fixture
  kiracısı seed'lemek ister miyiz? Paylaşılan kiracıyı hiç ellemeden ikisini de çözer.
- §4.1'deki iki kalıntı fırsat silinsin mi? Yıkıcı olduğu için onay bekliyorum;
  `deleteMany({ where: { id: { in: [...] } } })` tek satır, geri alma yolu seed.

## 7. Sonraki adım

- Kalıcı `ultra` fixture kiracısı (yukarıdaki iki riski birden kapatır).
- Kalan spec'lerde `networkidle` taraması: bu dörtte 5 tanesini kaldırdım, depoda başkaları
  var (`module-plan-gate.spec.ts:56` dahil) ve aynı 60 sn timeout'u üretiyorlar.
- Paylaşılan demo kiracısına yazan spec'ler için zorunlu `rollback` kuralı (§4.2).
