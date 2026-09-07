# TASK-MTRK9FMKE3GSB — CORDIS sync jobs (K1/K2): verifying the report, then running the pipeline

**Ajan:** blockzincir-pm · **Tip:** verification + feature · **Tarih:** 2026-09-07
**Kapsam:** `src/lib/inngest/jobs/k1-daily-calls.ts`, `src/lib/inngest/jobs/k2-monthly-cordis.ts`,
`src/lib/k2-cordis/**`, `scripts/run-k2-monthly.ts`, `package.json` (one line), `tests/k1-*`, `tests/cordis-*`

---

## 1. Ne yapıldı

### (a) `prisma.organization` → `cordisOrganization` geçişi — DOĞRULANDI, kalan çağrı YOK

`grep -rn "prisma\.organization" src/ tests/ scripts/ prisma/` 20 eşleşme veriyor; **hiçbiri
çalışan bir çağrı değil**. Hepsi ya bu hatayı anlatan yorum satırı, ya da o delegate'in artık
var olmadığını *doğrulayan* test:

```
tests/cordis-rag.test.ts:50      expect(db.prisma.organization).toBeUndefined();
tests/cordis-delta.test.ts:61    expect(db.prisma.organization).toBeUndefined();
```

Tek gerçek kod eşleşmesi `src/lib/cordis-sync.ts:328` — `coordinator?.organization.country`.
Bu `prisma.organization` değil; `CordisParticipation`'ın `include: { organization: true }`
ile getirdiği ilişki alanı. Şemada da tek model var: `prisma/schema.prisma:556 model CordisOrganization`.
**Düzeltilecek kalan çağrı bulunmadı; rapor bu maddede doğru.**

### (b) `pnpm jobs:k1` ve `pnpm jobs:k2` — biri koştu, diğeri YOKTU

`pnpm jobs:k1` çalıştı (aşağıda gerçek çıktı). `pnpm jobs:k2` ise **hiç var olmayan bir
komuttu** — kök neden bu:

```
$ grep -n 'jobs:k' package.json      # işe başlarken
18:    "jobs:k1": "tsx scripts/run-k1-daily.ts",
```

`scripts/run-k2-monthly.ts` yoktu. CLAUDE.md "Komutlar" bölümü `pnpm jobs:k2 -- --month 2026-09`
diye belgeliyor, yani **başarısız bir aylık koşuyu yeniden üretmenin belgelenmiş yolu
çalıştırılamıyordu.** `scripts/run-k2-monthly.ts` yazıldı (K1 runner'ının ikizi) ve
`package.json`'a tek satır eklendi.

Komutu yazılabilir kılmak için K2 işi de K1 ile aynı şekle getirildi: cron adımının içindeki
gövde `runK2MonthlyCordis({ month, workerUrl })` olarak dışarı alındı — cron, `pnpm jobs:k2`
ve birim testler artık **tam olarak aynı kod yolunu** sürüyor.

### (c) CLAUDE.md kural 6 — `RawFetch` yazılmıyordu, artık yazılıyor

Önceki rapor (madde 5.1) bunu açık soru olarak bırakmıştı ve **ölçümüm onu doğruladı**:
işe başlarken `RawFetch` 0 satırdı. K1 zaten yazıyordu ama tablo boştu, çünkü iş hiç
koşmamıştı. CORDIS tarafında **hiçbir yol** yazmıyordu.

`src/lib/k2-cordis/raw-fetch.ts` eklendi — iki kuralı olan tek yazar:
- **Yalnız değiştiğinde yaz.** `(source, key)` + hash; aynı üst-kaynak cevabını gören ikinci
  koşu satır eklemez. "İki kez koştur, sayı değişmesin" iddiasını bu tablo için de doğru yapan şey bu.
- **Baytların kendisini asla saklama.** CORDIS toplu veri seti ~500 MB'lık bir zip; `storageUrl`
  nereden geldiğini, `payload` küçük bir zarf (boyut, içerik tipi, HTTP durumu) tutar.

İki çağıran: `importer.ts` (zip'in gerçek baytları üzerinden hesaplanmış SHA-256 ile) ve
`k2-monthly-cordis.ts` (worker'ın ham gövdesi, 8 KB'a kırpılmış).

### (d) Şema değişikliği işi kırmıyor, `SystemAlert` üretiyor

K2 işi **hiçbir hata durumunda alert yazmıyordu** — worker kapalıysa, 500 dönerse, gövde JSON
değilse sessizce `success:false` dönüyordu; ne alert, ne worker'ın ne dediğinin kaydı.
Dört durum eklendi, dördü de fırlatmadan: ulaşılamayan worker (`error`), 2xx-olmayan (`warn`),
JSON olmayan gövde (`warn`), ve **drift** — işin okuduğu bir alan artık gelmiyorsa `warn` yazılır
ama koşu geçerli sayılır (kural 6'nın tam sözü: "zorunlu alan yok → alert üret, işi kırma").

Güvenlik notu: `SystemAlert`'in RLS'i yok, `WORKER_URL` kimlik bilgisi taşıyabilir — alert'lere
yalnız `host` yazılıyor, bunun testi de var.

### (e) İdempotency ölçümü bir hata ortaya çıkardı — düzeltildi

`pnpm jobs:k1`'i iki kez koşturunca `Call` (430) ve `Topic` (1288) sabit kaldı ama **`RawFetch`
4 satır büyüdü**. Kök neden: SEDIA bazı topic'leri tek koşuda **iki kez** döndürüyor (biri arama
listesinden, biri `data/topicDetails`'ten), farklı gövdelerle ve aynı `identifier` ile. İki gövde
arasında değişiklik-hash'i gidip geliyordu, yani **her gece sonsuza dek yeni satır**.

Ölçülen fark (aynı identifier'ın iki `RawFetch` gövdesi):
```
description: 2400 karakter  ->  36 karakter
callTitle:   "Erasmus Charter for Higher Education 2022"  ->  ""
deadlines:   5 kayıt  ->  6 kayıt
```

Kimin doğru olduğu bir **adaptör** sorusu (`src/lib/adapters/sedia.ts` — benim dosyam değil).
Bu yüzden bir birleştirme politikası uydurmadım: `syncK1Topics` artık identifier'a göre
tekilleştiriyor (**son gelen kazanır — tekilleştirilmemiş döngünün zaten yazdığının aynısı,
yani `Topic` içeriği hiç değişmiyor**) ve çakışan id'leri bir `SystemAlert` ile isim isim
operatöre bildiriyor. Gerçek koşuda 7 identifier çıktı.

---

## 2. Kanıt

### 2.1 `pnpm jobs:k1` — gerçek koşu, gerçek ağ, gerçek DB

```
$ pnpm jobs:k1
[INFO] [SediaAdapter] Total fetched: 1214 topics across 13 pages
[jobs:k1] sedia      status=ok topics=1214
[jobs:k1] eurostars  status=ok topics=2
[jobs:k1] tubitak    status=ok topics=54
[jobs:k1] fetched 1270 topics in 11376ms
[jobs:k1] EU/EEA/CH-only topics: 25
[jobs:k1] lumpSum=452 twoStage=592 withAge=1214
[INFO] [k1-daily-calls] Completed: 1258 inserted, 12 updated, 0 errors
[jobs:k1] {
  "success": true, "totalProcessed": 1270, "inserted": 1258, "updated": 12,
  "sediaCount": 1214, "eurostarsCount": 2, "tubitakCount": 54,
  "schemaChangeDetected": false
}
```

### 2.2 İdempotency — iki koşu, iki sayı (kart bunu istiyordu)

**Düzeltme ÖNCESİ**, arka arkaya iki koşu:

| | `Call` | `Topic` | `RawFetch` |
|---|---|---|---|
| BEFORE | 25 | 30 | **0** |
| AFTER RUN 1 | 430 | 1288 | 1270 |
| AFTER RUN 2 | **430** | **1288** | **1274** ← 4 satır büyüdü |

`Call`/`Topic` sabit → normalize tablolar idempotan. `RawFetch`'teki 4 satır (e) maddesindeki hata.

**Düzeltme SONRASI**, yine arka arkaya iki koşu:

```
RUN A   {"totalProcessed":1263,"inserted":0,"updated":1263}
        {"rawFetch":1274,"call":430,"topic":1288}
RUN B   {"totalProcessed":1263,"inserted":0,"updated":1263}
        {"rawFetch":1274,"call":430,"topic":1288}   <- değişmedi
```

`inserted:0 / updated:1263` ve üç sayının da hiç oynamaması = tam idempotan.
`totalProcessed` 1270 → 1263 düştü, çünkü 7 kopya identifier artık bir kez işleniyor.

### 2.3 `RawFetch` kanıtı — satır sayısı + örnek satır

Koşu sonrası kaynak kırılımı:
```
RawFetch by source: [{"source":"sedia","n":1218},{"source":"tubitak","n":54},{"source":"eurostars","n":2}]
toplam 1274
```

CORDIS toplu içe aktarıcısı, **gerçek importer + gerçek DB**, küçük bir yerel zip ile:

```
BEFORE       {"rawFetch_cordis_bulk":0,"cordisProject":20,"cordisOrganization":0,...}
RUN 1        {"success":true,"rowCounts":{"projects":2,"organizations":2,"participations":2,"topics":2}}
AFTER RUN 1  {"rawFetch_cordis_bulk":1,"cordisProject":22,"cordisOrganization":2,"cordisParticipation":2}
RUN 2        {"success":true,"skipped":true}         <- fileHash değişmedi
AFTER RUN 2  {"rawFetch_cordis_bulk":1,"cordisProject":22,...}  <- unchanged = idempotent
```

Örnek satır (`RawFetch`, `source=cordis_bulk`):
```json
{
  "source": "cordis_bulk",
  "key": "HORIZON",
  "hash": "3b7c0f37fe125b5c835d65776bab7564a344f5079cf0e93ce2059c076115d968",
  "storageUrl": ".../probe-cordis.zip",
  "payload": { "dataset": "HORIZON", "sizeBytes": 1209,
               "contentType": "application/zip", "fetchedAt": "2026-09-07T19:43:56.383Z" },
  "fetchedAt": "2026-09-07T19:43:56.390Z"
}
```
Hash arşivin gerçek baytlarının SHA-256'sı — bağımsız olarak doğrulandı:
```
$ shasum -a 256 probe-cordis.zip
3b7c0f37fe125b5c835d65776bab7564a344f5079cf0e93ce2059c076115d968
```

### 2.4 `pnpm jobs:k2 -- --month 2026-09` — gerçek koşu

```
$ pnpm jobs:k2 -- --month 2026-09
[jobs:k2] start 2026-09-07T19:42:45.079Z month=2026-09
[jobs:k2] { "success": false, "message": "fetch failed", "error": "fetch failed" }
[jobs:k2] finished in 99ms
[jobs:k2] FAILED — the worker did not take the job. A SystemAlert was written;
          see /[locale]/admin/alerts (source=k2_monthly_cordis).
[ELIFECYCLE] Command failed with exit code 1.
```

**Bu doğru davranış, gizlenmiş bir hata değil:** Python worker'ı bu makinede ayakta değil
(`workers/cordis/requirements.txt` bağımlılıkları kurulu değil — `ModuleNotFoundError: No module
named 'fastapi'`). İş fırlatmadı, `SystemAlert` yazdı ve komut 1 ile çıktı:

```json
{"level":"error","source":"k2_monthly_cordis",
 "message":"CORDIS worker unreachable: fetch failed",
 "meta":{"host":"localhost:8000","month":"2026-09"}}
```

**Gerçek worker koşturulamadı — sebebini yukarıda yazdım, sahte bir "başarılı koşu" üretmedim.**
2xx yolunu ölçmek için yerel bir stub worker'a `--worker-url` ile bağlanıldı; DB gerçek:

```
BEFORE           {"rawFetch_cordis_worker":3,"systemAlert_k2":3}
RUN 1 (200)      {"success":true,"message":"CORDIS pipeline triggered successfully",...}
AFTER RUN 1      {"rawFetch_cordis_worker":4,"systemAlert_k2":3}
RUN 2 (200 same) {"success":true,...}
AFTER RUN 2      {"rawFetch_cordis_worker":4,"systemAlert_k2":3} <- unchanged = idempotent
RUN 3 (drift)    {"success":true,"workerResponse":{"status":"queued"}}
AFTER RUN 3      {"rawFetch_cordis_worker":5,"systemAlert_k2":4}
RUN 4 (503)      {"success":false,"message":"Worker responded with status 503","statusCode":503}
AFTER RUN 4      {"rawFetch_cordis_worker":6,"systemAlert_k2":5}
```

Yazılan `RawFetch` satırı (`source=cordis_worker`) ham gövdeyi taşıyor:
```json
{"source":"cordis_worker","key":"2026-09","status":200,
 "payload":{"body":"{\"message\":\"CORDIS pipeline triggered\"}","contentType":"application/json"}}
```

### 2.5 Şema değişikliği koşuyu kırmıyor — gerçek DB'ye karşı ölçüldü

RUN 3'te worker `message` alanını düşürdü (`{"status":"queued"}`). Sonuç: **`success:true`, iş
kırılmadı**, ham gövde `RawFetch`'e yazıldı ve alert üretildi:

```json
{"level":"warn","source":"k2_monthly_cordis",
 "message":"CORDIS worker response is missing fields this job expects",
 "meta":{"host":"127.0.0.1:8799","month":"2026-09","missingFields":["message"]}}
```

K1 tarafındaki eşdeğer sinyal, gerçek SEDIA verisinde:
```json
{"level":"warn","source":"k1_daily_calls",
 "message":"K1 sources returned 7 identifier(s) more than once in a single run; only the last record for each was kept.",
 "meta":{"duplicateIdentifiers":["HORIZON-CL4-2027-01-MAT-PROD-42","HORIZON-CL4-2027-01-MAT-PROD-16",
   "HORIZON-CL4-2027-01-MAT-PROD-08","HORIZON-CL4-2027-01-MAT-PROD-49","HORIZON-CL4-2027-01-MAT-PROD-62",
   "ERASMUS-EDU-2022-ECHE-CERT-FP","ESC-HUMAID-2021-QUAL-LABEL-FP"]}}
```

### 2.6 Testler — ve RED kanıtı (test gevşetilerek geçilmedi)

```
$ npx vitest run tests/k1-sync-topics.test.ts tests/cordis-k2-job.test.ts
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

Yeni testlerin gerçekten bu hatayı yakaladığı, düzeltme geçici olarak geri alınarak ölçüldü:

```
--- RED CHECK (dedupe removed) ---
 × keeps one record per identifier when a feed answers twice in one run
   AssertionError: expected 3 to be 2
 × does not grow RawFetch across runs when a duplicate identifier repeats
   AssertionError: expected 4 to be 2        <- gerçek DB'deki +4 ile birebir aynı
 × alerts an operator about the duplicated identifiers instead of hiding them
   AssertionError: expected undefined to be defined
      Tests  3 failed | 3 passed (6)
```

### 2.7 Kapı

| Aşama | Sonuç |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0, tüm repoda sıfır hata |
| `npx eslint .` (tüm repo) | ✅ **0 error**, 80 warning (hepsi önceden var olan `no-unused-vars`) |
| `npx eslint <benim dosyalarım>` | ✅ 0 error, 2 warning (ikisi de dokunmadığım satırlarda, önceden vardı) |
| `npx vitest run` | ⚠️ `4 failed | 1038 passed | 8 skipped` — **4'ü de benim değil** |

Dört hata `tests/m11-partb-editor-buffer.test.tsx` içinde, `useTranslations('UserIdentity')`
next-intl bağlamı bulamıyor. Başka bir ajanın uçuştaki işi (`messages/{tr,en}.json` ve
`src/components/UserMenu.tsx` commit edilmemiş durumda). **Yalnız kendi dosyalarımı geri
alarak ölçtüm:**

```
--- BASELINE (my changes removed) ---
 Test Files  1 failed (1)
      Tests  4 failed (4)      <- benim değişikliğim olmadan da aynı
```

### 2.8 DB temizliği

Probe'un yazdığı her şey silindi; CORDIS tabloları başlangıç değerlerine döndü:
```
AFTER CLEANUP {"cordisProject":20,"cordisOrganization":0,"cordisParticipation":0,"cordisProjectTopic":20}
```
Stub worker'ın ürettiği 4 alert silindi. **Bilerek bırakılanlar:** gerçek `pnpm jobs:k2`
koşusunun ürettiği "worker unreachable" alert'i, gerçek SEDIA verisinden gelen kopya-identifier
alert'leri, ve K1'in gerçekten içeri aldığı 430 `Call` + 1288 `Topic` + 1274 `RawFetch` satırı —
bunlar işin asıl ürünü, temizlenecek çöp değil.

---

## 3. Değişen dosyalar

| Dosya | Durum | Değişim |
|---|---|---|
| `src/lib/k2-cordis/raw-fetch.ts` | **yeni** | 79 satır — `RawFetch`'in tek yazarı; değiştiğinde-yaz, baytları saklama, fırlatma |
| `src/lib/k2-cordis/importer.ts` | M | +42/-8 — zip'in ham indirmesi `RawFetch`'e; `getZipFileAndHash` artık `origin` + `sizeBytes` döndürüyor |
| `src/lib/inngest/jobs/k2-monthly-cordis.ts` | M | +194/-53 — `runK2MonthlyCordis` dışarı alındı, `--month`, `RawFetch`, 4 alert yolu, kimlik-bilgisi sızdırmayan `safeHost` |
| `src/lib/inngest/jobs/k1-daily-calls.ts` | M | +55/-4 — identifier tekilleştirme + operatör alert'i |
| `scripts/run-k2-monthly.ts` | **yeni** | 60 satır — eksik olan `pnpm jobs:k2` |
| `package.json` | M | +1 satır — `"jobs:k2"` |
| `tests/cordis-k2-job.test.ts` | **yeni** | 154 satır — 7 test: RawFetch, idempotency, drift, 5xx, ulaşılamama, JSON-değil, sır sızdırmama |
| `tests/k1-sync-topics.test.ts` | **yeni** | 178 satır — 6 test: RawFetch değiş-yaz, kopya identifier, alert |

`src/lib/cordis-sync.ts` ve `src/lib/cordis-delta.ts`'e **dokunulmadı** — (a) maddesinde
doğrulandılar, değişecek bir şey çıkmadı. Yasak listedeki hiçbir yola dokunulmadı.

---

## 4. Riskler

1. **`package.json` paylaşılan bir dosya.** Tek satır eklendi (`"jobs:k2"`), işe başlarken
   dosya değiştirilmemiş durumdaydı ve yalnız o yol `git add` edildi. Başka bir ajan aynı anda
   script eklediyse çakışma çıkabilir; diff tek satırlık, çözümü kolay.
2. **`totalProcessed` artık tekilleştirme sonrası sayıyor** (1270 → 1263). Yazılan satır sayısını
   gösterdiği için daha doğru, ama bu alanı izleyen bir gösterge varsa küçük bir kırılma görür.
   `sediaCount`/`eurostarsCount`/`tubitakCount` adaptörün ham sayısı olarak kaldı.
3. **`pnpm jobs:k2` artık başarısızlıkta 1 ile çıkıyor.** Doğru davranış, ama bu komutu koşan
   bir CI adımı varsa (yok, kontrol ettim) artık kırmızı verir.
4. **`RawFetch` büyümesi.** K1 gecede ~1270 topic'e bakıyor ama yalnız değişenleri yazıyor;
   kopya-identifier sızıntısı kapandığına göre büyüme artık gerçek üst-kaynak değişimiyle sınırlı.
   Yine de saklama politikası (retention) tanımlı değil — bkz. açık sorular.

---

## 5. Açık sorular (kapsamım dışı — DÜZELTMEDİM, bildiriyorum)

1. **Python worker olmayan tablolara yazıyor.** `workers/cordis/main.py:110-135` `"Project"`,
   `"Participation"` ve `"Organization"` tablolarına `INSERT` ediyor. Şemada bu modeller **yok** —
   bu kartın (a) maddesinde TypeScript tarafında temizlenen hatanın *aynısı*, Python tarafında
   hâlâ duruyor. K2 boru hattı worker ayağa kalktığı anda patlar. `workers/` benim dosyam değil;
   ayrı kart gerekiyor ve önceliği yüksek.
2. **`workers/README.md` `/jobs/cordis?month=YYYY-MM` diyor, `main.py:144` `month` parametresini
   okumuyor.** Yeni `pnpm jobs:k2` parametreyi doğru gönderiyor; worker onu yok sayıyor.
3. **SEDIA aynı identifier'ı iki kez döndürüyor** (7 adet, isimleri 2.5'te). Hangi gövdenin doğru
   olduğu adaptör kararı: `src/lib/adapters/sedia.ts` iki uçtan (arama listesi + `topicDetails`)
   gelen kayıtları birleştirmiyor. Şu an listeleme gövdesi kazanıyor ve daha zengin olan
   `topicDetails` gövdesini eziyor (2400 karakterlik `description` → 36 karakter). Veri kalitesi
   kaybı, ama düzeltmesi benim dosyamda değil.
4. **`RawFetch` saklama politikası yok.** Tablo artık gerçekten doluyor (1274 satır, ilk günde).
   Bir temizleme işi ya da R2'ye taşıma kararı gerekiyor.
5. **`prisma generate` hâlâ kurulumun parçası değil** ve `src/types/prisma-override.d.ts`
   delegate'leri `any` yapıyor — önceki raporun 6.4 maddesi. Bu kart o sınıftan yeni bir hata
   üretmedi ama sınıf açık.

---

## 6. Sonraki adım

1. **Madde 5.1 için kart açılsın (yüksek öncelik):** `workers/cordis/main.py` var olmayan
   `Project`/`Participation`/`Organization` tablolarına yazıyor. K2 hattı bu düzelmeden
   uçtan uca koşamaz — bu yüzden bu kartta gerçek bir K2 veri koşusu gösteremedim.
2. Worker bağımlılıkları bir kez kurulup (`pip install -r workers/cordis/requirements.txt`)
   `pnpm jobs:k2 -- --month 2026-09` gerçek worker'a karşı tekrarlansın; kod tarafı hazır,
   eksik olan tek şey ayakta bir worker.
3. Madde 5.3 SEDIA kopya-birleştirme kararı adaptör sahibine gitsin.
