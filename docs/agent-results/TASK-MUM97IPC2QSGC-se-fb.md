# TASK-MUM97IPC2QSGC — İNCELEME-13 Ö-3: B3 elle tetikleme açık ayı yarım bırakıyordu (se-fb)

**Kaynak bulgu:** `docs/agent-results/TASK-MUM74TE5F3K44-crw-fb.md` Ö-3. `reportPeriod(now)` "dünün ayı" değerini veriyordu. Bu yüzden 15 Ekim'de gönderilen `agency/report.generate` olayı `2026-10` dönemini 15 günlük veriyle yazıyordu. 1 Kasım cron'u da `2026-10`'u "zaten var" diye atlıyordu. Sonuçta Ekim raporu kalıcı olarak ayın ortasını gösteriyordu.

Aynı kusur benim B3 teslimimde de görünüyor: 29.09'daki elle tetikleme `target "2026-09"` yazmıştı (TASK-MULRR08Y9YI77 raporu, §2). O satırlar zaten silinmişti.

## 1. Ne yapıldı

- **Dönem her yerde "son kapanmış ay".** `reportPeriod(now)` artık `now`'un ayından bir önceki ayı veriyor (UTC). 1 Ekim'de de, 2 Ekim'e sarkan bir cron yeniden denemesinde de, 15 Ekim'de de sonuç `2026-09`. Açık ay hiçbir yoldan üretilemiyor.
  - Yan kazanç: eski formülde gece yarısını geçen bir cron retry'ı, 2'sinde çalışırsa açık ayı yazardı. Bu yol da kapandı.
- **Olay yükü dönemi açıkça alıyor.** Yeni `AgencyReportGenerateEventSchema` = `{ period: "YYYY-MM" }`, `.strict()` (`src/lib/inngest/events.ts`).
  - `requestedReportPeriod(data, now)` yükü doğruluyor. Kabul ettiği tek dönem `reportPeriod(now)`.
  - **Reddedilenler:** yüksüz olay, bozuk biçim, fazladan anahtar, açık ay, gelecek ay ve **daha eski kapanmış ay**. Eski ayın reddedilme gerekçesi: rapor panonun o anki kümülatif yanıtı. 15 Ekim'de "Ağustos" diye üretilen bir rapor Ekim ortasının sayılarını Ağustos etiketiyle saklardı; bu da aynı yanlış-resmî-belge sorunu.
- **Kütüphanede ikinci kilit.** `generateAgencyReports(period, now, deps)` artık dönemi parametre olarak alıyor. Dönem `reportPeriod(now)` değilse hiçbir şey okumadan ya da yazmadan `AgencyReportPeriodError` fırlatıyor. Böylece gelecekte eklenecek bir çağıran da açık ayı yazamaz.
- **Inngest işi.** Olay `agency/report.generate` ise dönem yükten alınıyor, cron ise `reportPeriod(now)`. `AgencyReportPeriodError` → `NonRetriableError`: aynı girdi aynı şekilde düşeceği için yeniden deneme yok.

İncelemenin önerdiği alternatif, elle üretilen satırın cron'un üzerine yazmasına izin vermekti. Bunu seçmedim: indirilmiş bir "resmî" raporun sonradan değişmesi ayrı bir sorun açar. Tek-yazım kuralı da (K-4 notu) olduğu gibi kaldı.

## 2. Kanıt

### RED → GREEN (birim)

Düzeltmeden önce yeni testler koşuldu: `Tests 2 failed | 14 passed (16)`. Kırılanlar `reportPeriod` (29.09 → `2026-08` beklendi, `2026-09` geldi) ve `requestedReportPeriod` (henüz yoktu). Düzeltmeden sonra: `Tests 16 passed (16)`.

### Gerçek Inngest olayı

Kurulum: `/api/inngest` route handler'ı izole bir süreçte `INNGEST_DEV=1` ile `127.0.0.1:3999`'da sunuldu. Yanında `inngest-cli dev` (`:8288`) çalıştı. `PUT /api/inngest` → `{"message":"Successfully registered"}`. Bugün 2026-09-29, yani son kapanmış ay `2026-08`. Yerel DB'de 7 canlı ajans var (başka görevlerin fikstürleri) ve başlangıçta 0 rapor satırı vardı.

```
nopayload {"data":{}}                 → run 01M3NVG1NT1BNJQTHBKWK9KEE3 Failed  AgencyReportPeriodError: agency/report.generate needs data.period = "YYYY-MM" (the last closed month, 2026-08)
open      {"data":{"period":"2026-09"}} → run 01M3NVG1NT6HAK10XJ6PHGKKSP Failed  agency report period 2026-09 refused: only 2026-08, the last closed month, can be generated now
earlier   {"data":{"period":"2026-07"}} → run 01M3NVG1NTEC8X5F4GV18E1T43 Failed  agency report period 2026-07 refused: only 2026-08, ...
closed1   {"data":{"period":"2026-08"}} → run 01M3NVG1XKB503W8K2FX20VHYX Completed
closed2   {"data":{"period":"2026-08"}} → run 01M3NVGKA55RDN92WM06P6ZTDQ Completed
DB:  agencies 7 reports 7 Counter({'2026-08': 7})      ← ikinci olay satır eklemedi, açık ay hiç yazılmadı
```

- **Yeniden deneme yok:** `open` koşusu `run_started_at 05:51:41.242Z` → `ended_at 05:51:41.745Z` (0,5 sn). Host logunda her hata bir kez görünüyor: bir `NonRetriableError` (adım), bir `StepError [NonRetriableError]` (işlev). Varsayılan yeniden deneme olsaydı geri çekilmeyle dakikalar sürerdi.
- **Temizlik:** Bu koşunun yazdığı 7 satır silindi (`deleted 7`, filtre: `target 2026-08`, `createdAt ≥ 05:50Z`). Son durum `agencies 7 reports []`. `:3999` ve `:8288`'deki süreçleri ben başlattım ve ben durdurdum. Leed-fb'nin `:3000`'ine dokunulmadı; ayrıca oradaki `/api/inngest` dev modunda olmadığı için kullanılamazdı. Geçici betikler (`scratch/mum97-*`) silindi.

### Mutasyon (her biri geri alındı)

| # | Mutasyon | Sonuç |
|---|----------|-------|
| M1 | `reportPeriod` eski "dünün ayı" formülüne döndü | 4 test kırıldı (reportPeriod, kabul, açık ay reddi, generateAgencyReports kilidi) |
| M2 | `period !== closed` → `period > closed` (eski ay serbest) | 1 test kırıldı: "an earlier closed month is refused" |
| M3 | `generateAgencyReports` içindeki `assertLastClosedPeriod` silindi | 1 test kırıldı: "open month: throws before reading or writing anything" |
| M4 | Olay şemasından `.strict()` kaldırıldı | 1 test kırıldı: "no period, a bad period or an extra key is refused" |

Mutasyona uğratılmayan tek parça `NonRetriableError` sarmalayıcısı; onun kanıtı yukarıdaki gerçek Inngest koşusu (0,5 sn, tek deneme).

### Kapılar (`set -a; source .env; set +a`)

```
typecheck rc=0
lint rc=0
vitest src/lib/agency src/lib/inngest + agency-report/agency-funnel live: Test Files 11 passed (11), Tests 133 passed (133)
vitest (tam):  Test Files 201 passed | 2 skipped (203), Tests 2336 passed | 8 skipped (2344)
```

Canlı test `tests/agency-report.live.test.ts` `fabrika_app` (NOBYPASSRLS) ile 5/5 geçti. Çağrı yeni imzaya (`'2026-09', NOW = 2026-10-01T06:00Z`) uyarlandı.

## 3. Değişen dosyalar

- `src/lib/agency/report.ts`: `reportPeriod` son kapanmış ay; `AgencyReportPeriodError`, `requestedReportPeriod`; `generateAgencyReports(period, now, deps)` + kilit
- `src/lib/inngest/events.ts`: `AgencyReportGenerateEventSchema` (+ tip)
- `src/lib/inngest/jobs/agency-monthly-report.ts`: dönem olay yükünden ya da cron'dan geliyor; `NonRetriableError`
- `src/lib/agency/report.test.ts`: `reportPeriod` beklentileri (29.09 → `2026-08`), 6 yeni test
- `tests/agency-report.live.test.ts`: yeni imza

## 4. Riskler

- **Cron bir ay tamamen kaçarsa** (1'inde düştü ve ay içinde kimse fark etmedi) o ayın raporu artık hiç üretilemez. Bu bilinçli bir tercih: sonradan üretmek o aya ait olmayan sayıları o ayın adıyla saklardı. Ay bitmeden elle tetikleme hâlâ mümkün, ancak üretilen rapor o anın kümülatif sayılarını taşır. Bu, cron'un 1'inde yaptığıyla aynı model; `generatedAt` belgede yazıyor.
- **K-4** (eşzamanlı elle tetiklemede çift satır) değişmedi. `concurrency: { limit: 1 }` işlev düzeyinde bunu zaten önlüyor; kalan yol ancak aynı anda iki ayrı dağıtımdan tetiklemek.
- Olay göndereni yok (UI ya da admin ucu yok). Tetikleme Inngest panosundan ya da `inngest.send` ile yapılıyor. Yükü unutan kişi açıklayıcı hata mesajını görür.

## 5. Açık sorular

- Yok. İncelemenin "en azından olay yükü dönemi açıkça alsın" ve "yalnız kapanmış ay" önerilerinin ikisi de uygulandı. Kapanmış aylar arasından yalnız sonuncusuna izin verilmesi incelemeden daha sıkı; gerekçesi §1'de.

## 6. Sonraki adım

- crw-fb kısa yeniden onayı (Ö-3 kapanışı).

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, yerel Postgres (docker), `fabrika_app` rolü, inngest-cli dev). Değişen kod saf TypeScript: UTC tarih aritmetiği (`Date.UTC`, `getUTC*`), zod doğrulaması ve Inngest işlevi. Süreç, dosya yolu, kabuk ya da ekran bağımlılığı yok, bu yüzden sonuç makinenin saat diliminden de bağımsız. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede o ortamlar yok. Koddan bakıldığında davranış farkı beklenmiyor; CI (Linux) aynı vitest kapılarını koşuyor.
