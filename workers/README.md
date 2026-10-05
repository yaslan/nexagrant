# workers — Python veri işçisi (FastAPI)

## Uç noktalar (kodda gerçekten var olanlar)

| Uç nokta | Açıklama |
| --- | --- |
| `POST /jobs/cordis?month=YYYY-MM` | CORDIS boru hattını **eşzamanlı** koşturur, sonucu döner. `month` zorunlu ve `YYYY-MM` biçiminde doğrulanır. |
| `GET /jobs/cordis/{runId}` | Bir koşunun `CordisImportRun` kaydını okur (durum sorgusu). |
| `GET /health` | Sağlık kontrolü (kimlik doğrulaması istemez). |

Kimlik: `WORKER_TOKEN` bearer. `/jobs/*` uçları token olmadan **401**, `WORKER_TOKEN` hiç
tanımlı değilse **503** döner. K2 işi (`src/lib/inngest/jobs/k2-monthly-cordis.ts`) bu
başlığı zaten gönderiyor.

## Yazdığı tablolar

Worker yalnız K2'nin **temel** normalize yüzeyini yazar — TypeScript içe aktarıcısıyla
(`src/lib/k2-cordis/importer.ts`) aynı tablolar:

`CordisProject` · `CordisOrganization` · `CordisParticipation` · `CordisProjectTopic`

Her koşu ayrıca `CordisImportRun` tablosuna `RUNNING` → `SUCCESS` | `FAILED` olarak
yazılır; admin sayfası bu kaydı okur (`src/app/[locale]/admin/cordis/actions.ts:34`).

**Yazmadığı tablolar:** `CordisPartnerProfile` ve `CordisCoParticipation`. Bu türetilmiş
katmanın tek sahibi `generatePartnerProfiles()`
(`src/lib/k2-cordis/partnerProfileJob.ts`); worker oraya yazsaydı iki yazıcı çakışırdı.
Merkezilik/işbirliği grafiği de bu yüzden TS tarafında hesaplanır.

**Para birimi:** `BigInt` sütunlar **tam EUR** tutar (cent değil) — TS tarafındaki
`parseBigIntEur()` ile aynı ölçek.

## Başarı/başarısızlık sözleşmesi

Boru hattı **cevaptan önce** koşar, yani HTTP yanıtı işin gerçek sonucudur:

- Başarı → `200` + `{"success": true, "runId", "rowCounts": {...}, "durationMs"}`
- Başarısızlık → `500` + `{"success": false, "error": "..."}`, ve `CordisImportRun`
  satırı `FAILED` olarak kalır (veri yazımı geri alınsa bile koşu kaydı durur).
- Geçersiz/eksik `month` → `422`.

Hata artık `print` ile yutulmuyor: çağıran taraf sonucu yanıttan ya da `CordisImportRun`
kaydından öğrenir.

## Veri kaynağı (MVP durumu)

Gerçek CORDIS toplu CSV indirmesi **bu worker'da henüz yok**; toplu içe aktarımı bugün
TS tarafındaki `runCordisImport()` yapıyor. Worker şu an yerleşik bir örnek veri kümesi
üretir ve bunu yazmak açıkça açılmalıdır:

```bash
CORDIS_WORKER_ALLOW_MOCK=1   # kapalıysa /jobs/cordis 501 döner
```

Bu kapı bilerek kapalı gelir: örnek satırlar kullanıcıya görünen partner sayfalarını
besleyen tablolara gider (CLAUDE.md kuralı 7). Örnek kayıtların id'leri `MOCK-<ay>-*`
biçimindedir; `SAMPLE-*` tohum verisiyle ya da gerçek CORDIS id'leriyle çakışmaz ve aynı
ay tekrar koşulduğunda satır sayısı değişmez (kural 6: çekiciler idempotent).

## Yığın ve dağıtım

Python 3.12, FastAPI, DuckDB, pandas, psycopg2 (`workers/cordis/requirements.txt`).
DuckDB, upsert'ten önce her kümeyi hedef tablonun birincil anahtarında tekilleştirir —
tek partide yinelenen anahtar `ON CONFLICT ... DO UPDATE`'i hata verdirir.

Dağıtım: Fly.io (1 shared-cpu-2x, 2 GB). Aylık iş < 30 dk hedefi.

## Yerel çalıştırma

```bash
pip install -r workers/cordis/requirements.txt
cd workers/cordis
DATABASE_URL=postgresql://... WORKER_TOKEN=... CORDIS_WORKER_ALLOW_MOCK=1 \
  python -m uvicorn main:app --reload --port 8000

curl -X POST -H "Authorization: Bearer $WORKER_TOKEN" \
  'http://127.0.0.1:8000/jobs/cordis?month=2026-09'
```

## Henüz yapılmadı

Aşağıdakiler daha önce bu dosyada var gibi anlatılıyordu; kodda karşılıkları yok:
`/jobs/embeddings` uç noktası, `workers/cordis/columns.py` sütun eşleme tablosu,
`workers/tests/fixtures/he_sample.zip` fixture'ı, Parquet ara katmanı ve `OrgTopicStat`
tablosu (böyle bir tablo şemada yok).
