# TASK-MTPVBDRYNYM0C — K1 Adapter Completion & Daily Cron

**Ajan:** geli-tirici (BE-EN, Backend Engineer) · **Tarih:** 2026-09-06 · **Branch:** dev
**Kapsam:** E4 / S3 — SEDIA, Eurostars, TÜBİTAK adaptörleri + günlük Inngest işi

---

## 1. Ne yapıldı

### 1.1 Zod sözleşme katmanı (`src/lib/adapters/schemas/`) — YENİ
Görevde istenen `src/lib/adapters/schemas/sedia.ts` dosyası açıldı; yanına ortak katman kondu.

- `schemas/common.ts` — `BaseTopicSchema` (üç kaynağın ortak normalize şekli), `EligibilitySchema`,
  `AdapterResult<T>` zarfı, `computeAgeInDays`, `inferEligibilityFromText`, `detectLumpSum`,
  `detectTwoStage`, `stripHtml`.
- `schemas/sedia.ts` — **iki katman**:
  - `SediaSearchEnvelopeSchema` / `SediaRawResultSchema`: **upstream** yükü doğrular. Bilerek gevşek
    (`z.looseObject`) — yalnız vazgeçilmez alanları arar, EC yeni alan eklerse alarm üretmez.
  - `SediaTopicSchema`: bizim **normalize** şeklimiz (`Topic` tablosuna yazılan).
- `schemas/eurostars.ts`, `schemas/tubitak.ts` — normalize şema + canlı sayfa kalıpları.

### 1.2 Adaptörler — sözleşme, hata ve normalize
Üç adaptöre de birincil giriş noktası eklendi: `fetchSediaTopics()` / `fetchEurostarsTopics()` /
`fetchTubitakTopics()`. Hepsi `AdapterResult` döner ve **asla `throw` etmez**:

```ts
{ status: 'ok' | 'error', source, topics, topicsProcessed, reason?, schemaDrift[] }
```

Hata durumunda görevde istenen şekil birebir: `{ status: 'error', reason: '…', topicsProcessed: 0 }`.
Eski `fetchTopics(): Promise<T[]>` imzası **geri-uyum için korundu** (`api/cagrilar` ve mevcut testler
kırılmadı).

Normalize'a eklenenler:
- `eligibility.eligibleCountries` — "EU/EEA/CH only" tespitinde `['EU','EEA','CH']`; TÜBİTAK'ta `['TR']`.
- `ageInDays` = bugün − açılış tarihi (açılmamış çağrıda **negatif**, 0'a kırpılmıyor; tarih yoksa `null`).
- `plannedOpeningDate` — SEDIA `startDate` / `budgetOverview.plannedOpeningDate`.
- lump-sum ve iki-aşamalı bayrakları artık `deadlineModel` + `topicConditions` metninden de çıkarılıyor.
- Son tarihler 17:00 `Europe/Brussels`'e normalize, sıralanıyor, `stage` yeniden numaralanıyor.

### 1.3 Gerçek şema-kayması tespiti (kabul kriteri: "API şeması değişince alarm")
**Önceki kod hatalıydı:** `lastFetch.hash !== rawHash` karşılaştırması "API şeması değişti" alarmı
üretiyordu. Bu bir *içerik* değişikliğidir — bir son tarih güncellenince her gece yanlış alarm çıkardı.

Şimdi kayma, ham yanıtın zod zarfına karşı doğrulanmasıyla tespit ediliyor: zarf kırılırsa
(`results` alanı yok, `metadata.identifier` yok) `schemaDrift[]` dolar → `SystemAlert(level=warn,
source=<kaynak>_adapter)`. HTML kaynaklarda kayma = "200 döndü ama hiçbir çağrı kalıbı eşleşmedi".
İş **kırılmaz** (CLAUDE.md §6).

### 1.4 Ölü kaynak URL'leri düzeltildi
Ölçüldü (2026-09-06): Eurostars katılımcı portalı tarayıcı-dışı istemciye **403**, TÜBİTAK
`/en/funding/research-projects-funding` **404**. Yani bu iki adaptör canlıda **0 kayıt** döndürüyordu.

- Eurostars → `https://eurekanetwork.org/programmes/eurostars/` (env: `K1_EUROSTARS_URL`)
- TÜBİTAK → `https://www.tubitak.gov.tr/tr/destekler` (env: `K1_TUBITAK_URL`)

Parser'lar bu sayfaların gerçek yapısına göre yeniden yazıldı; eski kalıplar fallback olarak duruyor.
`parseCallsFromHtml` saf (I/O yok) → fixture ile ağsız test edilebiliyor.

### 1.5 N+1 ağ çağrısı kaldırıldı (performans)
Eski kod her konu için `topicDetails/<id>.json` çağırıyordu — 1214 konu × 5 sn zaman aşımı = günlük iş
**saatler** sürebilirdi. Arama yanıtı zaten `descriptionByte` (açıklama) ve `topicConditions`
(uygunluk) taşıyor. Konu-başı çağrı kaldırıldı; `enrichFromTopicDetails` seçeneğiyle üst-sınırlı olarak
geri açılabilir. **Sonuç: 1270 konu / ~12 sn.**

### 1.6 Günlük iş (`k1-daily-calls.ts`, `0 2 * * *`)
- Upsert mantığı `syncK1Topics(sources)` olarak dışa alındı → cron, `pnpm jobs:k1` ve testler **aynı
  kod yolunu** kullanıyor.
- Kaynak `error` dönerse `SystemAlert(level=error)` yazılıyor, diğer kaynaklar yine de yazılıyor.
- `RawFetch` artık yalnız **hash değiştiğinde** yazılıyor (eskiden her gece ~1270 satır çöp birikiyordu).
- `Call.openDate` ← `plannedOpeningDate` (daha önce hiç doldurulmuyordu).
- `ageInDays` **saklanmıyor** — okuma anında `Call.openDate`'ten türetilir, böylece bayatlayamaz.
- Çıktı şeması genişletildi (additive): `sources[]` (kaynak başına durum/sebep/kayma) +
  `schemaChangeDetected`.

### 1.7 `pnpm jobs:k1` (CLAUDE.md'de belgeliydi, yoktu)
`scripts/run-k1-daily.ts` + package.json script'i. `--dry-run` hiçbir tabloya dokunmaz, `--max-pages N`.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Canlı çekim — kabul kriteri "≥500 konu"

```
$ pnpm jobs:k1 -- --dry-run --max-pages 13
[jobs:k1] sedia      status=ok topics=1214
[jobs:k1] eurostars  status=ok topics=2
[jobs:k1] tubitak    status=ok topics=54
[jobs:k1] fetched 1270 topics in 11177ms
[jobs:k1] sample: {
  "identifier": "HORIZON-MSCA-2027-COFUND-01-01",
  "status": "FORTHCOMING",
  "callIdentifier": "HORIZON-MSCA-2027-COFUND-01",
  "isLumpSum": false,
  "isTwoStage": false,
  "nextDeadlineAt": "2027-04-06T17:00:00.000Z",
  "plannedOpeningDate": "2026-12-08T00:00:00.000Z",
  "ageInDays": -93,
  "eligibility": { "restricted": null, "eligibleCountries": [], "countriesExcluded": [] }
}
[jobs:k1] EU/EEA/CH-only topics: 25
[jobs:k1] lumpSum=453 twoStage=592 withAge=1214
```

**1214 ≥ 500 ✅** · `ageInDays` 1214/1214 konuda hesaplandı · uygunluk/lump-sum/iki-aşama çıkarımı çalışıyor.

### 2.2 İdempotency — işi ÜÇ KEZ koştum (gerçek Postgres, yerel dev DB)

| Sayaç | Önce | Koşu #1 sonrası | Koşu #2 sonrası | Koşu #3 sonrası |
|---|---|---|---|---|
| `Call` | 26 | **430** | 430 | 430 |
| `Topic` | 35 | **1288** | 1288 | 1288 |
| `RawFetch` | 0 | 1270 | 1274 | 1278 |
| `Programme` | 9 | 9 | 9 | 9 |
| `SystemAlert` | 178 | **178** | 178 | 178 |
| `Topic` EU/EEA/CH-only | 0 | 25 | 25 | 25 |
| `Topic` lumpSum | 0 | 453 | 453 | 453 |
| `Topic` twoStage | 0 | 590 | 590 | 590 |
| `Call` openDate dolu | 22 | 374 | 374 | 374 |

Koşu #1 özeti: `"inserted": 1253, "updated": 17`
Koşu #3 özeti (aynı gün, aynı veri):

```json
{ "success": true, "totalProcessed": 1270, "inserted": 0, "updated": 1270,
  "sediaCount": 1214, "eurostarsCount": 2, "tubitakCount": 54,
  "schemaChangeDetected": false }
```

- **`inserted: 0` + satır sayıları değişmedi → tekrar koşma güvenli, kopya üretmiyor.** ✅
- **`SystemAlert` 178'de sabit kaldı → yanlış "şema değişti" alarmı yok** (eski kod her koşuda
  1270 sahte alarm mesajı üretirdi). ✅
- `RawFetch` koşu başına yalnız ~4 satır büyüdü (1270 değil) → hash kapısı çalışıyor.

### 2.3 Birim testler — ağsız, fixture tabanlı (`tests/k1-adapters.test.ts`, 16 test)

```
$ npx vitest run tests/k1-adapters.test.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

Kapsananlar: `ageInDays` (pozitif/negatif/null) · EU/EEA/CH çıkarımı · lump-sum & iki-aşama tespiti ·
SEDIA normalize (callId, 17:00 Brüksel son tarihi, eligibleCountries, HTML temizleme) · **determinizm**
(aynı yük → aynı çıktı) · boş/eksik yük · `{status:'error', reason, topicsProcessed:0}` sözleşmesi ·
**zarf değişince `SystemAlert` yazılması** · `metadata.identifier` eksik olan kaydın atlanıp kayma
kaydedilmesi · Eurostars 403 ve TÜBİTAK 404 zarfları · TÜBİTAK kopya-id üretmemesi.

### 2.4 Canlı entegrasyon testleri (opt-in) — gerçek uçlara karşı koşuldu

```
$ RUN_LIVE_ADAPTER_TESTS=1 npx vitest run tests/adapters.test.ts tests/sedia-adapter.test.ts \
    tests/k1-daily-calls.test.ts tests/k1-adapters.test.ts
 Test Files  4 passed (4)
      Tests  28 passed (28)
```

### 2.5 Tüm suite + kapılar

```
$ npx vitest run
 Test Files  45 passed | 2 skipped (47)
      Tests  367 passed | 8 skipped (375)

$ npx tsc --noEmit          → 0 hata
$ npx eslint <değişen dosyalar> → 0 sorun
```

(2 skip = canlı ağ testleri, `RUN_LIVE_ADAPTER_TESTS=1` ile açılır — yukarıda ayrıca koşuldu.)

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/adapters/schemas/{common,sedia,eurostars,tubitak,index}.ts`
- `src/lib/adapters/alerts.ts`
- `scripts/run-k1-daily.ts`
- `tests/k1-adapters.test.ts`
- `tests/fixtures/{sedia-search.json,eurostars-calls.html,tubitak-programmes.html}`

**Değişen**
- `src/lib/adapters/{sedia,eurostars,tubitak}.ts`
- `src/lib/inngest/jobs/k1-daily-calls.ts`, `src/lib/inngest/events.ts`
- `package.json` (`jobs:k1`)
- `tests/{adapters,sedia-adapter,k1-daily-calls}.test.ts` (canlı testler opt-in'e alındı)
- `docs/{ARCHITECTURE,DATA_MODEL,ROADMAP}.md`

**Migration:** yok — şema değişikliği gerekmedi. `eligibleCountries` mevcut `Topic.eligibility` Json
alanının içinde (additive), `Call.openDate` zaten şemada vardı ama doldurulmuyordu. Geri-alma yolu:
kod geri alınırsa eski satırlar okunmaya devam eder (`eligibleCountries` yoksa `[]` varsayılanı devreye
girer); veri silme gerekmiyor.

---

## 4. Riskler

1. **HTML kazıma kırılgan.** Eurostars ve TÜBİTAK JSON API sunmuyor. Sayfa yapısı değişirse adaptör
   0 döner — bu artık **sessiz değil**: `schemaDrift` → `SystemAlert`. Fixture testleri de kırmızıya
   döner. URL'ler `K1_EUROSTARS_URL` / `K1_TUBITAK_URL` ile değiştirilebilir.
2. **TÜBİTAK kataloğunda tarih yok.** `/tr/destekler` programları listeliyor, çağrı penceresi vermiyor;
   bu yüzden 54 kayıt `FORTHCOMING` ve `nextDeadlineAt: null`. Gerçek son tarihler program alt
   sayfalarında — ayrı bir görev gerektirir.
3. **`RawFetch` koşu başına ~4 satır büyüyor.** 1270'in 4'ü istekler arası gerçekten değişiyor
   (muhtemelen oynak bir upstream alan). Zararsız ama kökü araştırılmadı.
4. **`api/cagrilar` yolu** hâlâ arka planda ilk 10 konuyu kendi başına upsert ediyor ve `Call.openDate`
   yazmıyor. Bu görevin kapsamı dışında bırakıldı; K1 işi ile çakışmıyor (aynı unique anahtarlar).
5. **Dev DB'ye 1253 satır yazıldı** (`Call` 26→430, `Topic` 35→1288). Bu işin amacı bu; yıkıcı işlem yok,
   yalnız upsert.

---

## 5. Açık sorular

1. `Topic` tablosuna `openDate`/`ageInDays` için indeks isteniyor mu? Şu an `nextDeadlineAt` ve `status`
   indeksli; "yaşa göre sırala" ekranı gelirse `Call.openDate` indeksi gerekir.
2. Eurostars için ücretli/resmî bir API (EUREKA açık veri) var mı? Kazımadan kurtulmak isterim.
3. `tests/admin-modules.test.ts` düzeltmesi: bu görevin kapsamı DEĞİL — commit edilmedi (aşağıya bakın).

---

## 6. Sonraki adım

- **Kapsam dışı ama acil:** `tests/admin-modules.test.ts` çalışma ağacında düzeltildi ama **commit
  edilmedi**, çünkü ilgili kaynak değişikliği (`requirePlatformAdmin`, TASK-MTQ5Y8EPT7FDA) da henüz
  commit edilmemiş — testi tek başına commit etmek HEAD'i kırardı. O görevin sahibi ikisini birlikte
  commit'lemeli. (Düzeltme: auth mock'una `isPlatformAdmin: true` + "platform admin olmayan reddedilir"
  testi.)
- E4'ün kalan maddesi: **`TopicMatch` gece hesaplama işi yok** (ROADMAP E4 satır 43). `Topic` verisi artık
  1288 satırla hazır; eşleştirme cron'u ayrı görev olarak açılmalı.
- TÜBİTAK program alt sayfalarından gerçek son tarihleri çekmek (Risk #2).
