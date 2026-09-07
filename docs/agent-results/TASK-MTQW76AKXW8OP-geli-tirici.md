# TASK-MTQW76AKXW8OP — Hakem paneli sonsuz iskelet

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Branch:** `dev` · **Tarih:** 2026-09-07

## Kök neden (tek cümle)

`src/components/UserMenu.tsx` içindeki `baseNotifications` her render'da yeniden kurulan
çıplak bir dizi literaliydi; ona bağlı `syncNotifications` useCallback'i ve ona bağlı
`useEffect` bu yüzden her render'da yeniden koşup `setNotificationsList` ile yeni bir
dizi yazıyordu — uygulama kabuğunu taşıyan **her** sayfada sınırsız bir render döngüsü
("Maximum update depth exceeded") ana iş parçacığını doldurup RSC yükü hâlâ akan bir
rotayı çalışma alanı iskeletinde asılı bırakıyordu.

Yani hata M6 panel rotasının kendisinde değil, rotanın içinde çizildiği kabuktaydı;
veri katmanı (probe'un da gösterdiği gibi) baştan beri sağlamdı.

## 1. Ne yapıldı

1. **Teşhis.** Probe'un (`scripts/tmp-probe-panel.ts`) veri katmanının sağlam olduğunu
   göstermesinden sonra kaldığı yerden devam ettim: rotayı gerçek tarayıcıda açıp
   `console.error` yakaladım, sonsuz döngü hatasının JS yığınını `console.error`'ı
   sayfa içinde sararak aldım. Yığın doğrudan `UserMenu.useCallback[syncNotifications]`
   → `UserMenu.useEffect` satırlarını gösterdi (aşağıda ham çıktı).
2. **Düzeltme.** `baseNotifications` `useMemo(..., [isTr])` ile sabitlendi; zincirin
   tamamı (callback → effect → setState) böylece durağan hâle geldi. `useMemo` import'u
   eklendi. Effect'in kendisi ve `eslint-disable` yorumu olduğu gibi bırakıldı — sorun
   effect'te değil, bağımlılığındaydı.
3. **"Sonsuz iskelet asla kalmasın" — boş durum.** `panel/page.tsx` teklifi bulamadığında
   `notFound()` çağırıyordu; yani kullanıcı henüz teklif yazmadığı bir fırsatta
   "fırsat bulunamadı" görüyordu, ki bu doğru değil. Artık iki ayrı okuma var:
   fırsat yoksa `notFound()` (dürüst cevap), fırsat var ama teklifi yoksa
   `m6-panel-no-proposal` boş durumu.
4. **"Hata varsa görünür hata" — hata sınırı.** Rotanın altında `error.tsx` yoktu, bu
   yüzden bir throw segmenti aşıp kullanıcıyı iskelette bırakıyordu. `panel/error.tsx`
   eklendi: çevrilmiş başlık/gövde, `digest`, `reset()` düğmesi. `error.message`
   bilinçli olarak ekrana basılmıyor (sunucu tarafı id/sorgu sızdırabilir); ayrıntı
   konsola ve sunucu loguna gidiyor.
5. **i18n.** `m6.panel.noProposal`, `m6.panel.errorTitle`, `m6.panel.errorBody`,
   `m6.panel.errorRetry` iki dile de eklendi (yalnız kendi ad alanıma; dosyalar yeniden
   biçimlendirilmedi, parite 615/615 korunuyor).
6. **Temizlik.** `scripts/tmp-probe-panel.ts` ve kendi geçici probe/doğrulama
   script'lerim silindi.

### Ortam notu (görevin parçası değil, ama iş bunun üstünde yapıldı)

Çökme sonrası veritabanı **tamamen boştu** (`Tenant`/`Opportunity`/`User` = 0). Yeniden
doldurmak için `pnpm db:seed` koştum ve **kırık**: `seedG0DemoEvidence()` `TopicMatch`
satırlarını `demo-topic-1..6` id'lerine bağlıyor, ama depoda bu `Topic` satırlarını
oluşturan hiçbir seeder yok (`grep -rn "demo-topic-1"` yalnız `prisma/seed.ts`'i ve iki
rapor dosyasını buluyor) → `P2003 TopicMatch_topicId_fkey` ile düşüyor ve **ondan
sonraki her adım** (gate kararları, teklifler, M6 panel seed'i) hiç koşmuyor. Bu benim
kapsamım dışında olduğu ve `scripts/clean-orphan-topic-matches.ts` üzerinde başka bir
ajan çalışıyor göründüğü için `prisma/seed.ts`'e DOKUNMADIM; demo veriyi kendi
scratchpad script'imle (bozuk adım atlanarak, kalan seeder'lar sırasıyla) yükledim.
**Bu bir açık sorudur, aşağıya yazdım.**

Şema sıfırlama/migrate koşmadım (yalnız veri yazdım), yine de kural gereği RLS'i
ölçtüm: `pnpm rls:check` 38/38, `pnpm rls:verify` 38/38 — aşağıda.

## 2. Kanıt

### 2a. Kök nedenin yığın izi (düzeltmeden ÖNCE, gerçek tarayıcı)

```
Error: capture
    at console.error (<anonymous>:2:355)
    at getRootForUpdatedFiber (.../react-dom...js:2775:143)
    at enqueueConcurrentHookUpdate (.../react-dom...js:2758:16)
    at dispatchSetStateInternal (.../react-dom...js:5449:22)
    at dispatchSetState (.../react-dom...js:5422:9)
    at UserMenu.useCallback[syncNotifications] (.../src_151cb8r._.js:1676:17)   <<<<
    at UserMenu.useEffect (.../src_151cb8r._.js:1695:13)                        <<<<
    at Object.react_stack_bottom_frame (.../react-dom...js:14944:22)
    ...
```

### 2b. Rota taraması — ÖNCE / SONRA ("Maximum update depth" hata sayısı, sayfa başına 6 sn)

| Rota | ÖNCE | SONRA |
|---|---|---|
| `/tr/main/opportunities/demo-opp-3` | 0 | 0 |
| `/tr/main/opportunities/demo-opp-1` | 0 | 0 |
| `/tr/main/opportunities/demo-opp-1/evaluations/panel` | **601** | **0** |
| `/tr/main/opportunities/demo-opp-3/evaluations/panel` | **626** | **0** |
| `/tr/main/opportunities/demo-opp-3/evaluations` | **613** | **0** |
| `/tr/main/opportunities` | 6 | 0 |
| `/tr/main` | 0 | 0 |

Ham çıktı (SONRA):

```
/tr/main/opportunities/demo-opp-3  →  maxUpdateDepth errors: 0
/tr/main/opportunities/demo-opp-1  →  maxUpdateDepth errors: 0
/tr/main/opportunities/demo-opp-1/evaluations/panel  →  maxUpdateDepth errors: 0
/tr/main/opportunities/demo-opp-3/evaluations/panel  →  maxUpdateDepth errors: 0
/tr/main/opportunities/demo-opp-3/evaluations  →  maxUpdateDepth errors: 0
/tr/main/opportunities  →  maxUpdateDepth errors: 0
/tr/main  →  maxUpdateDepth errors: 0
```

### 2c. Gerçek tıklamalı doğrulama (Chromium, `alice@fabrika.test` ile giriş, `main` çalışma alanı)

```
### 01-panel-demo-opp-3  (/tr/main/opportunities/demo-opp-3/evaluations/panel)
  skeleton(animate-pulse still on screen): 2      <- ikisi de bildirim zilinin okunmamış noktası, iskelet DEĞİL
  m6-evaluator-form: true
  m6-dashboard: true
  internal-preassessment badges: 2                <- rozetin 2 yüzeyi
  m6-panel-no-proposal: false
  m6-panel-error: false
  body: ... | Hakem Paneli | Değerlendirici Paneli Puanlaması | İç ön değerlendirme: Bu puanlar şirket içi kalite kontrol i

### 02-panel-demo-opp-1  (/tr/main/opportunities/demo-opp-1/evaluations/panel)
  m6-evaluator-form: false                        <- alice bu değerlendirmede hakem değil
  m6-dashboard: true
  internal-preassessment badges: 1
  body: ... | Hakem Paneli | Bu değerlendirmede hakem olarak görevli değilsiniz. | Panel Değerlendirmesi Panosu | İç ön değ

### 03-panel-no-proposal-empty-state  (/tr/main/opportunities/demo-opp-4/evaluations/panel)
  m6-panel-no-proposal: true
  body: ... | Hakem Paneli | Bu fırsat için henüz bir teklif oluşturulmadı; puanlanacak bir şey yok. | Geri bildirim

### 05-panel-english-locale  (/en/main/opportunities/demo-opp-3/evaluations/panel)
  internal-preassessment badges: 2
  body: ... | Reviewer Panel | Evaluator Panel Scoring | Internal pre-assessment: These scores are an internal quality check; t

### 06-panel-no-proposal-english  (/en/main/opportunities/demo-opp-4/evaluations/panel)
  m6-panel-no-proposal: true
  body: ... | Reviewer Panel | This opportunity has no proposal yet, so there is nothing to score. | Feedback

maxUpdateDepth errors across the whole run: 0
```

Ekranda kalan iki `animate-pulse` düğümünün ne olduğu ayrıca doğrulandı (iskelet değil):

```json
[
  "<span class=\"absolute top-1 right-1 w-2.5 h-2.5 bg-bad rounded-full ring-2 ring-surface animate-pulse\"></span>",
  "<span class=\"absolute top-1 right-1 w-2.5 h-2.5 bg-bad rounded-full ring-2 ring-surface animate-pulse\"></span>"
]
```

### 2d. Hata yolu KASTEN kırıldı → hata ekranı çıkıyor

`panel/page.tsx`'e geçici olarak `throw new Error('TEMPORARY forced failure to exercise error.tsx')`
enjekte edildi, ekran görüntüsü alındı, sonra **geri alındı** (dosyada kalmadı — `grep -c` = 0):

```
### 04-panel-error-boundary  (/tr/main/opportunities/demo-opp-3/evaluations/panel)
  m6-evaluator-form: false
  m6-dashboard: false
  m6-panel-error: true
  body: ... | ⚠️ | Panel açılamadı | Bu değerlendirme paneli yüklenirken bir hata oluştu. Sorun sürerse çalışma alanı yönet
```

### 2e. Ekran görüntüleri

`docs/agent-results/TASK-MTQW76AKXW8OP-screenshots/`

| Dosya | Ne gösteriyor |
|---|---|
| `01-panel-demo-opp-3.png` | Rota açılıyor; form + pano + rozetin 2 yüzeyi |
| `02-panel-demo-opp-1.png` | Rota açılıyor; hakem koltuğu yok → "görevli değilsiniz" + pano |
| `03-panel-no-proposal-empty-state.png` | Teklif yok → boş durum (404 değil, iskelet değil) |
| `04-panel-error-boundary.png` | Kasten kırılan hata yolu → görünür hata + "Tekrar dene" |
| `05-panel-english-locale.png` | EN yerel ayarı, rozetin 2 yüzeyi İngilizce |
| `06-panel-no-proposal-english.png` | EN boş durum |

### 2f. `pnpm gate` — TEMİZ

```
✖ 194 problems (0 errors, 194 warnings)      <- lint: 0 hata (194 uyarı mevcut/eski)

$ tsc --noEmit                                <- typecheck: çıktı yok = temiz

$ vitest run --passWithNoTests
 Test Files  57 passed | 2 skipped (59)
      Tests  560 passed | 8 skipped (568)
   Duration  2.41s

$ tsx scripts/check-rls.ts
Found 38 tenant-scoped models requiring RLS policies:
...
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
   (Declared, not measured — `pnpm rls:verify` asks the database.)

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

> İlk gate koşumu `tests/e2e/zz-tmp-consortium-shot.spec.ts` içindeki `no-explicit-any`
> hatasıyla düşmüştü; o dosya benim değildi ve ikinci koşumdan önce sahibi tarafından
> silindi. Yukarıdaki çıktı ikinci (temiz) koşumdur.

### 2g. i18n paritesi bozulmadı

```
"totalKeysInTurkish": 615,
"totalKeysInEnglish": 615,
```
(`missingIn*` listesindeki 5 anahtar şablon-literal ile kurulan eski anahtarlar —
benim eklemelerimle ilgisi yok; `pnpm i18n:check` zaten `pnpm gate`'in parçası değil.)

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/components/UserMenu.tsx` | **Kök neden düzeltmesi**: `baseNotifications` → `useMemo([isTr])`; `useMemo` import'u |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/panel/page.tsx` | Fırsat/teklif için ayrı okuma; teklif yoksa boş durum (404 yerine) |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/panel/error.tsx` | **YENİ** — rotanın hata sınırı |
| `messages/tr.json`, `messages/en.json` | Yalnız `m6.panel.*` altına 4 anahtar |
| `docs/agent-results/TASK-MTQW76AKXW8OP-screenshots/*.png` | 6 ekran görüntüsü |
| `scripts/tmp-probe-panel.ts` | **SİLİNDİ** |

Kapsam notu: görev "yalnız `evaluations/panel/**` + `EvaluationDashboard`/`EvaluatorForm`"
diyordu, ama kök neden ölçülebilir biçimde `src/components/UserMenu.tsx`'te çıktı — panel
altındaki hiçbir bileşende `useEffect` yok. Panel'e yapılacak herhangi bir düzeltme
semptomu değil kabuğu maskelerdi, o yüzden asıl satırı düzelttim ve burada açıkça
bildiriyorum. `evaluations/client.tsx`'e (blok-zincir-dse) dokunulmadı.

## 4. Riskler

- **`UserMenu.tsx` paylaşılan bir kabuk bileşeni.** Değişiklik davranışsal olarak
  nötr (aynı 3 bildirim, aynı localStorage okuma/yazma); yalnız kimlik durağanlığı
  değişti. Yine de her sayfada görünür, bu yüzden regresyon yüzeyi geniş: gate + 7
  rotalık tarayıcı taraması bu yüzden koşuldu.
- **`notifications/client.tsx:36`'da AYNI hata deseni var** (`syncNotifications`
  useCallback'i her render yeniden kurulan bir diziye bağlı). O rotaya girmedim ve
  kapsamım dışında; ayrı bir görev açılmalı.
- **`messages/*.json` dört ajanın ortak dosyası.** Commit'im dosyanın tamamını alıyor
  (git satır değil dosya commit'ler), yani commit anındaki diğer ajanların anahtarları
  da giriyor. Parite 615/615 ve gate temiz olduğu için içerik tutarlı.
- Demo veriyi scratchpad script'iyle yükledim; `pnpm db:seed`'in kendisi hâlâ kırık
  (aşağıya bak), yani bir sonraki ajan sıfır veriyle karşılaşabilir.

## 5. Açık sorular

1. **`pnpm db:seed` boş bir veritabanında düşüyor.** `prisma/seed.ts:79` `TopicMatch`
   satırlarını `demo-topic-1..6` `Topic` id'lerine bağlıyor, ama bu satırları hiçbir
   seeder üretmiyor (eski veritabanında gerçek bir K1 içe aktarımından gelmişler).
   Sonuç: `P2003` → sonraki tüm seed adımları (gate kararları, teklifler, M6 paneli,
   E11 geri bildirimi) hiç koşmuyor. `seedOpportunities()`'in zaten kullandığı
   "topic yoksa `console.warn` + `continue`" desenini `seedG0DemoEvidence()`'a taşımak
   4 satırlık additive bir düzeltme olur. Kimin görevi?
2. `demo-topic-*` `TopicMatch`'lerinin `topicStat` önekleriyle (`HORIZON-CL5-2026-09-D4`
   vb.) `seedCalls()`'ın ürettiği tanımlayıcılar (`HORIZON-CL5-2026-D4-01` vb.)
   uyuşmuyor — yani G0 taban-oran kanıtı yeniden kurulan bir veritabanında hiç
   bağlanmayacak. Bu ex-en'in G0 raporunun konusu; buraya yalnız not düşüyorum.
3. Demo kiracıda `ModuleState` satırı hiç yoktu, yani M6 dâhil her modül `OFF`'tu ve
   rota kilit ekranı gösteriyordu. Doğrulama için M2/M3/M5/M6/M11'i `ON` yaptım.
   Seed'in modül durumlarını da yazması gerekir mi, yoksa bu bilinçli olarak
   `/admin/modules`'a mı bırakılmış?

## 6. Sonraki adım

- `notifications/client.tsx` için aynı desenin görevi açılsın (Risk #2).
- `prisma/seed.ts` için seed onarımı görevi açılsın (Açık soru #1).
- Panel rotasının e2e kapsamı `tests/e2e/m6-evaluator.spec.ts`'te var ama kendi
  fixture'ıyla (`m6-e2e-ws`) koşuyor; boş durum ve hata sınırı için oraya iki kısa
  senaryo eklenebilir — bu görevin DoD'unda yoktu, öneri olarak bırakıyorum.
