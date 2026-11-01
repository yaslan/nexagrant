# TASK-MTQTYXC0NUT0B — Pano başarı oranı %20 yerine %0

**Ajan:** blok-zincir-dse (DSE-EN, Tasarımcı) · **Tip:** bug (P0, S9'dan kalan) · **Branch:** `dev` · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

### Kök neden (tek cümle)
`Proposal.outcome` serbest bir `String?` sütunu; **her yazan taraf** snake_case yazıyor (`above_threshold`), **okuyan taraf** ise `['SUBMITTED','FUNDED','ABOVE_THRESHOLD'].includes(...)` ile SCREAMING_CASE arıyordu — filtre hiçbir satırla eşleşmediği için oran, hiçbir hata üretmeden, %20 yerine %0 çıkıyordu.

### DB'deki gerçek dağılım (önce ölçüldü)

```
== Proposal.outcome distribution ==
┌─────────┬───────────────────┬───────┐
│ (index) │ outcome           │ count │
├─────────┼───────────────────┼───────┤
│ 0       │ null              │ '2'   │
│ 1       │ 'above_threshold' │ '1'   │
└─────────┴───────────────────┴───────┘
```

demo-tenant satır satır:

| id | stage | outcome | submittedAt |
|---|---|---|---|
| demo-opp-1 | G0 | `null` | — |
| demo-opp-2 | G1 | `null` | 2026-09-01 |
| demo-opp-3 | G2 | **`above_threshold`** | 2026-08-28 |
| demo-opp-4 | G3 | `null` | — |
| demo-opp-5 | G4 | `null` | — |

**Kasa uyuşmazlığı doğrulandı:** DB `above_threshold` (küçük harf) · kod `ABOVE_THRESHOLD` (büyük harf). Ayrıca koddaki `'SUBMITTED'` değeri sözlükte hiç yok — gönderim `submittedAt` ile izleniyor, `outcome` ile değil.

### Çözüm — yamamak yerine tek kaynak
Prisma'da bu sütun için **enum yok** (`outcome String?`), o yüzden enum'u kod tarafında tek kaynağa indirdim:

1. **`src/lib/proposal-outcome.ts` (yeni)** — sözlüğün yazılı olduğu tek yer: `PROPOSAL_OUTCOMES`, `ABOVE_THRESHOLD_OUTCOMES`, `normalizeProposalOutcome()`, `isAboveThreshold()`, `isFunded()`. Okuyucu ham sütunu asla karşılaştırmıyor. Normalizasyon **girişte hoşgörülü** (kasa + ayraç: `ABOVE_THRESHOLD`, `above-threshold`, `Above Threshold` → `above_threshold`) ama **sözlük dışı kelimeyi uydurmuyor**, `null` dönüyor — yazım hatası "outcome yok" olarak görünür, sessizce paya katılmaz. `toLocaleLowerCase` değil `toLowerCase` (Türkçe yerelde `I` → `ı` katlanır, eşleşme kaybolurdu).
2. **`src/lib/beta/esr-samples.ts`** — kendi `ESR_OUTCOMES` kopyasını tutuyordu; artık aynı listeden türüyor (`ESR_OUTCOMES = PROPOSAL_OUTCOMES`). ESR kalibrasyon script'i bu string'leri doğrudan `Proposal.outcome`'a yazıyor, yani ikinci kopya tam olarak sürüklenmenin kaynağıydı. Birim test bunu **kimlik** (`toBe`) ile sabitliyor.
3. **`src/lib/dashboard/fetch-metrics.ts`** — sayımlar `countOutcomes()` saf fonksiyonuna çıkarıldı (veritabanısız test edilebilsin diye), ikisi de `isAboveThreshold`/`isFunded` çağırıyor. Yanıltıcı `submittedOpps` adı `aboveThresholdOpps` oldu (alan hiçbir zaman "gönderilmiş" demek değildi).
4. **`src/app/api/dashboard/export-csv/route.ts`** — aynı hesabın **ikinci bir kopyasını** taşıyordu (aynı büyük-harf karşılaştırması dahil). Kopya silindi, rota artık ortak `fetchDashboardMetrics` + `generateCSV`'yi çağırıyor. Tek karşılaştırma noktası kaldı.

### Yol boyunca çıkan ikinci hata (aynı sınıf: sessiz)
Rota `to=2026-09-07` parametresini `new Date('2026-09-07')` ile **UTC gece yarısı** olarak yorumluyordu; aralığın son gününde oluşturulan her satır sessizce dışarıda kalıyordu (demo kiracıda bu, 5 fırsatın 5'i demek). Rota artık sayfanın ve panonun kendi dışa aktarma eyleminin kullandığı `resolveDashboardRange()`'i çağırıyor — CSV, kullanıcının baktığı pencereyle aynı pencereyi kapsıyor.

### "Yokluk ≠ sıfır" korundu ve dışa aktarıma da taşındı
Önceki görevde eklenen ayrım bozulmadı. `generateCSV` artık payda 0 iken **boş hücre** yazıyor (`Başarı Oranı,,%`), çünkü bir hesap tablosu `0`'ı ölçüm olarak okur; **ölçülmüş sıfır hâlâ `0.0`** olarak yazılıyor. İkisi de ayrı birim testle sabitlendi.

---

## 2. Kanıt

### (a) SQL elle hesabı — ekranın eşleşmesi gereken sayı

```sql
select count(*) as total_opps,
       count(*) filter (where lower(p.outcome) in ('funded','reserve','above_threshold')) as above_threshold,
       round(100.0 * count(*) filter (where lower(p.outcome) in ('funded','reserve','above_threshold'))
             / nullif(count(*),0), 1) as rate_pct
from "Opportunity" o left join "Proposal" p on p."opportunityId" = o.id
where o."tenantId" = 'demo-tenant';
```

```
┌─────────┬────────────┬─────────────────┬──────────┐
│ (index) │ total_opps │ above_threshold │ rate_pct │
├─────────┼────────────┼─────────────────┼──────────┤
│ 0       │ 5          │ 1               │ '20.0'   │
└─────────┴────────────┴─────────────────┴──────────┘
```

### (b) Gerçek tarayıcı, gerçek oturum — ÖNCE (düzeltme geri alınmış hâliyle)

`tests/e2e/dashboard-outcome-case.spec.ts` · alice@fabrika.test ile giriş → `/tr/main/panel` → "Dışa Aktar" sekmesine **gerçek tıklama** → oturumun kendi çerezleriyle canlı uç nokta çağrısı:

```
KPI,Değer,Birim,Dönem
Toplam Teklif,5,adet,"08.08.2026 - 07.09.2026"
Başarı Oranı,0.0,%          ← HATA: 5 fırsat var, 1'i eşik üstü
İsabet Oranı,0,skor
...
  1 failed
```

Ekran görüntüsü: `docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/01-export-tab.png`
Ham CSV: `docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/before-dashboard-metrics.csv`

### (c) Aynı test, düzeltme yerinde — SONRA

```
--- CSV returned by the live endpoint ---
KPI,Değer,Birim,Dönem
Toplam Teklif,5,adet,"08.08.2026 - 07.09.2026"
Başarı Oranı,20.0,%         ← SQL ile birebir
İsabet Oranı,0,skor
Kişi-Gün,0.0,gün
G0→G2 Süresi,0,gün
Açık Modüller,8,modül

Stage,Sayı
G0,1
G1,1
G2,1
G3,1
G4,1
---

  ✓  1 [chromium] › tests/e2e/dashboard-outcome-case.spec.ts:34:5 › the panel export reports the above-threshold rate the database actually holds (1.3s)

  1 passed (1.9s)
```

**Ekran = SQL:** %20.0 = %20.0. ✅
Ham CSV: `docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/dashboard-metrics.csv`

> `İsabet Oranı,0` ve `Kişi-Gün,0.0` **hata değil, ölçülmüş sıfır**: kontrol ettim — bu veritabanında beş fırsatın da `g0Score = 0` ve `Effort` tablosu boş (0 satır). (Denetim raporundaki 84.4 / 28.5 rakamları başka türlü tohumlanmış bir veritabanından geliyor.)

### (d) Birim test — RED önce, GREEN sonra

Düzeltme geçici olarak eski karşılaştırmayla değiştirildiğinde:

```
     × counts a row whatever case it was stored in 5ms
     × reproduces the demo tenant: 1 of 5 above threshold reads 20.0 %, not 0.0 0ms
AssertionError: expected { aboveThreshold: 1, funded: 1 } to deeply equal { aboveThreshold: 3, funded: 1 }
AssertionError: expected +0 to be 1 // Object.is equality
      Tests  2 failed | 13 passed (15)
```

Düzeltme yerindeyken:

```
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Karışık kasalı satırlarla oran testi (`tests/proposal-outcome.test.ts`): `above_threshold` + `ABOVE_THRESHOLD` + `Funded` + `below` + `null` → `{ aboveThreshold: 3, funded: 1 }`.

### (e) Aynı desenin taraması (sessiz kasa uyuşmazlığı)

Uygulamanın literal ile karşılaştırdığı **her serbest-string sütunun** canlı değerleri çıkarıldı ve koddaki literallerle karşılaştırıldı:

| Tablo.sütun | DB'deki canlı değerler | Koddaki literal | Uyum |
|---|---|---|---|
| `Opportunity.stage` | `G0 \| G1 \| G2 \| G3 \| G4` | `'G0'…'G4'` | ✅ |
| `Opportunity.status` | `ACTIVE` | `'ACTIVE' \| 'FUNDED' \| 'REJECTED' \| 'WITHDRAWN'` | ✅ |
| `Opportunity.intendedRole` | `coordinator` | `'coordinator'` (+ `.toLowerCase()` ile okunuyor) | ✅ |
| **`Proposal.outcome`** | **`above_threshold`** | **`'ABOVE_THRESHOLD'`** | ❌ **bu görevin hatası** |
| `ModuleState.status` | `ON` | `'ON'`, `['ON','PILOT']` | ✅ |
| `Evaluation.status` | `draft` | `'draft'`, `'completed'` | ✅ |
| `Evaluation.readerType` | `PANEL` | `'PANEL'` | ✅ |
| `GateDecision.gate` | `G0…G4` | `['G0','G2']` | ✅ |
| `Reviewer.status` | `pending` | `'pending'`, `'completed'` | ✅ |

Ayrıca yakın-isimli ama **ayrı tablolara** ait değerler kontrol edildi (`MarketplaceListing.status='active'` ≠ `Opportunity.status='ACTIVE'`, `ConsortiumSeat.status='OPEN'/'INVITED'/'CONFIRMED'`) — çapraz bir uyuşmazlık yok.

**Sonuç: kasa uyuşmazlığı yalnızca `Proposal.outcome`'da vardı.**

### (f) `pnpm gate` — temiz

```
$ eslint
✖ 194 problems (0 errors, 194 warnings)       ← hepsi mevcut (no-unused-vars), 0 hata

$ tsc --noEmit
(çıktı yok = temiz)

$ vitest run --passWithNoTests
 Test Files  60 passed | 2 skipped (62)
      Tests  590 passed | 8 skipped (598)

$ tsx scripts/check-rls.ts
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

DB'yi sıfırlayan/migrate eden bir komut **çalıştırılmadı** — `db:rls`/`db:rls-role` gerekmedi.

### (g) i18n
Yeni kullanıcı metni eklenmedi, `messages/*.json` **hiç değiştirilmedi**. Parite korunuyor: `totalKeysInTurkish: 726, totalKeysInEnglish: 726`. (`pnpm i18n:check` mevcut sebeplerle kırmızı — çözülemeyen şablon-literal anahtarlar (`Consortium.status.${seat.status}` vb.) ve kullanılmayan anahtarlar; `pnpm gate` kapsamında değil, benim değişikliğimle ilgisi yok.)

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/proposal-outcome.ts` | **yeni** — sözlüğün tek kaynağı + hoşgörülü okuyucu |
| `src/lib/dashboard/fetch-metrics.ts` | kanonik okuyucuya geçiş, `countOutcomes()` saf fonksiyonu, CSV'de yokluk≠sıfır |
| `src/app/api/dashboard/export-csv/route.ts` | kopya hesap silindi (ortak fonksiyona delege), `resolveDashboardRange` ile aralık düzeltmesi |
| `src/lib/beta/esr-samples.ts` | ikinci `ESR_OUTCOMES` kopyası kaldırıldı, tek listeden türüyor |
| `tests/proposal-outcome.test.ts` | **yeni** — 15 birim test (kasa, sözlük dışı, karışık kasalı oran, yokluk vs ölçülmüş sıfır) |
| `tests/e2e/dashboard-outcome-case.spec.ts` | **yeni** — gerçek oturum + gerçek tıklama + canlı uç nokta regresyonu |
| `docs/ROADMAP.md` | E10 bulgusu ÇÖZÜLDÜ olarak işaretlendi; açık karar #11 tarama sonucuyla kapatıldı |
| `docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/` | ekran görüntüsü + önce/sonra CSV |

`src/modules/m5/**` içindeki hiçbir dosyaya **dokunulmadı** (aşağıya bkz.). `pipeline/**`, `layout.tsx`, `calls/**` — dokunulmadı.

---

## 4. Riskler

1. **Düzeltme bugün ekranda görünmüyor — yalnız CSV'de.** Denetimin gördüğü "Başarı Oranı" KPI kartı panoda **artık yok**; pano `getKpiMetrics`'e taşındıktan sonra kartlar `totalProposals / hitRate / averageScore / personDays / avgDaysG2 / activeModules` oldu ve bunların hiçbiri `outcome` okumuyor. `outcome`'a dayanan KPI — **"Eşik Üstü Oranı" (`Dashboard.thresholdRate`)** — tr+en'de anahtarı var ama **hiçbir bileşende render edilmiyor**, oysa `docs/ROADMAP.md` E10 satırı onu panonun KPI listesinde sayıyor. Kanıtı bu yüzden canlı CSV uç noktası üzerinden aldım (gerçek oturum, gerçek yanıt) — sayı doğru, ama bir KPI kartı olarak görünür değil.
2. **`/api/dashboard/export-csv` rotasına UI'dan bağlantı yok.** Panodaki "CSV indir" düğmesi `${pathname}/api/export-csv` → `src/app/[locale]/(app)/[workspace]/dashboard/api/export-csv/route.ts`'e gidiyor; o rota fırsat satırlarını döküyor, KPI hesaplamıyor, `outcome`'a hiç dokunmuyor. Düzelttiğim rota canlı ve kimlik doğrulamalı ama şu an yalnız doğrudan URL ile erişiliyor. **Silmedim**, çünkü ROADMAP'in istediği KPI kartı için doğru kaynak artık burada.
3. `fetchDashboardMetrics` çıplak `prisma` kullanıyor (CLAUDE.md kural 1 `withTenant` istiyor). `where: { tenantId }` açık olduğu için sızıntı yok ve `rls:verify` temiz, ama RLS'in yedeklemesi devrede değil. Kapsam dışı bıraktım; ayrı bir kart hak ediyor.
4. `normalizeProposalOutcome` kasa/ayrak farkını affediyor. Bilinçli bir tercih (eski satırlar için), ama yazma tarafında bir doğrulama yok — yeni bir kod yolu sözlük dışı bir kelime yazarsa okuma tarafı onu sessizce "outcome yok" sayar. Kalıcı çözüm sütunu Prisma `enum`'una taşımak.
5. Paralel dalga: `src/modules/m5/server/queries.ts` bu oturum sırasında **başka bir ajan tarafından** değiştirildi (`deletedAt: null` eklemeleri). O dosyaya dokunmadım ve commit'ime dahil etmedim.

---

## 5. Açık sorular

1. **"Eşik Üstü Oranı" kartı panoya eklenecek mi?** Anahtarlar (tr+en) hazır, veri kaynağı artık doğru, ROADMAP E10 onu istiyor — ama kart eklemek bu kartın kapsamı ("kasa uyuşmazlığını düzelt") dışında, üstelik ekleneceği dosya (`m5/server/queries.ts`) şu anda başka bir ajanın elinde. **Ayrı bir kart öneriyorum.**
2. Bu sınıftan hatayı sistematik olarak bitirmek için serbest-string sütunlar Prisma `enum`'una mı taşınmalı, yoksa `proposal-outcome.ts` gibi sözlük modülleri yeterli mi? (ROADMAP açık karar #11'e bu soruyu yazdım.)
3. CSV başlıkları tamamen sabit kodlu Türkçe (`Başarı Oranı`, `İsabet Oranı`…) — CLAUDE.md kural 8 ihlali, ama mevcut ve kapsam dışı. Ayrıca satır adı "Başarı Oranı" iken hesap **eşik üstü oranı**; adı düzeltmek CSV'yi ayrıştıran herkes için sözleşme değişikliği olduğu için dokunmadım.

---

## 6. Sonraki adım

1. **Kart açıldı → `TASK-MTR68G2W1IQPI`** "Panoya *Eşik Üstü Oranı* KPI kartını ekle" — `m5/server/queries.ts`'e `isAboveThreshold` ile bir sayım, `Dashboard.tsx`'e bir `KpiCard`, `MetricValue` ile boş durum, `descThresholdRate`/`emptyThresholdRate` anahtarları (tr+en). `queries.ts` üzerindeki paralel iş bittikten sonra.
2. **Kart aç:** `fetchDashboardMetrics`'i `withTenant`'a taşı (CLAUDE.md kural 1).
3. İki CSV dışa aktarma uç noktasından hangisinin kalacağına karar ver; biri KPI özeti, diğeri satır dökümü — ikisi de meşru ama panoda yalnız biri bağlı.

## Definition of Done

- [x] DB'deki gerçek dağılım raporda (§1, §2a)
- [x] Kök neden tek cümle (§1)
- [x] Ekran = SQL, kanıtlı (§2a önce/sonra + §2b/§2c gerçek tıklama)
- [x] Birim test (RED→GREEN kanıtlı, §2d)
- [x] Aynı desen taraması yapıldı (§2e — 9 sütun, tek uyuşmazlık)
- [x] `pnpm gate` temiz (§2f)
- [x] Rapor `docs/agent-results/TASK-MTQTYXC0NUT0B-blok-zincir-dse.md`
