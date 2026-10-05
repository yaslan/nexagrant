# TASK-MTS7ZUI55RRE4 — K2 CORDIS Python worker: olmayan tablolara yazıyor ve çökünce "başarılı" diyor

> Bu rapor geç yazıldı: iş 2026-09-08'de `766944e` ile commit edildi, sonuç dosyası o koşuda
> yazılmadı. Aşağıdaki kanıt bugün (2026-09-08) HEAD üzerinde yeniden ölçülmüştür.

## 1. Ne yapıldı

İddia doğrulandı ve üç ayrı kusur kapatıldı (commit `766944e`, dev):

1. **Var olmayan tablolar.** `workers/cordis/main.py` `"Organization"`, `"Project"` ve
   `"Participation"` tablolarına upsert ediyordu. Bu adlar canlı şemada yok; her koşu
   `relation "Organization" does not exist` fırlatıyor, çıplak `except` bunu yazdırıyordu.
   Worker artık TypeScript importer'ın hedeflediği gerçek K2 normalize yüzeyine yazıyor:
   `CordisProject`, `CordisOrganization`, `CordisParticipation`, `CordisProjectTopic`.
   Türetilmiş katman (`CordisPartnerProfile`, `CordisCoParticipation`) zaten
   `generatePartnerProfiles()`'ın sorumluluğunda, orada bırakıldı.
2. **Sessiz başarı.** Endpoint `BackgroundTask` içinden 200 dönüyordu; iş daha başlamadan
   "başarılı" yanıtı gitmişti, K2 de bunu yeşil koşu olarak kaydediyordu. Pipeline artık
   yanıt verilmeden ÖNCE koşuyor: başarı = 200 + yazdığı satır sayıları, başarısızlık = 500 ve
   veri batch'i geri alındıktan sonra `CordisImportRun` satırı `FAILED` kalıyor.
   `GET /jobs/cordis/{runId}` koşuyu geri okuyor. K2 tarafı da worker hata bildirince
   başarısızlık kaydediyor.
3. **Düşen parametre.** `month` README'de zorunlu yazıyordu ve K2 hep gönderiyordu; imza onu
   sessizce yutuyordu. Artık gerçekten zorunlu ve doğrulanıyor.

Ek olarak README'nin belgelediği bearer token fiilen zorunlu kılındı, ve mock ingest
`CORDIS_WORKER_ALLOW_MOCK` arkasına alındı — uydurma satırlar varsayılan olarak kullanıcıya
görünen partner tablolarına ulaşamaz.

## 2. Kanıt

**Worker'ın bugün yazdığı tablolar — ve bu adların canlı şemada gerçekten var olduğu:**

```
$ grep -n 'INSERT INTO' workers/cordis/main.py
270:        INSERT INTO "CordisProject" (
312:        INSERT INTO "CordisOrganization" (
330:        INSERT INTO "CordisParticipation" (
347:        INSERT INTO "CordisProjectTopic" ("projectId", "topicCode", "topicTitle")

$ select table_name from information_schema.tables where table_schema='public'
    and table_name in ('Organization','Project','Participation','CordisProject',
                       'CordisOrganization','CordisParticipation','CordisProjectTopic','CordisImportRun')
[
  { table_name: 'CordisImportRun' },
  { table_name: 'CordisOrganization' },
  { table_name: 'CordisParticipation' },
  { table_name: 'CordisProject' },
  { table_name: 'CordisProjectTopic' }
]
```

Sorgu, kartın iddia ettiği üç adı (`Organization`, `Project`, `Participation`) AÇIKÇA arıyor ve
hiçbirini bulamıyor: iddia doğruydu. Bugün worker'ın yazdığı dört ad ise listede var.

**K2 tarafı — birim testler (bugün, HEAD):**

```
$ npx vitest run tests/cordis-k2-job.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

**Commit:**

```
$ git show --stat 766944e
fix(k2): point the CORDIS worker at tables that exist, and let it fail out loud
 src/lib/inngest/jobs/k2-monthly-cordis.ts |  29 +-
 tests/cordis-k2-job.test.ts               |  56 +++
 workers/README.md                         |  85 +++-
 workers/cordis/main.py                    | 664 ++++++++++++++++++++++++------
 4 files changed, 694 insertions(+), 140 deletions(-)
```

## 3. Değişen dosyalar

- `workers/cordis/main.py`
- `src/lib/inngest/jobs/k2-monthly-cordis.ts`
- `tests/cordis-k2-job.test.ts`
- `workers/README.md`

## 4. Riskler

- Python worker'ın SQL'i **ham** yazılmıştır (Prisma değil). Şema kolonları değişirse worker
  koşuda kırılır; artık sessizce değil, 500 ile — ama kapı (typecheck/vitest) bunu yakalamaz.
- Worker'ın uçtan uca koşusu bu görevde gerçek CORDIS indirimiyle DEĞİL, gerçek Postgres'e karşı
  ölçülmüştür. Ağdan gelen gerçek dosya biçimi değişirse ilk sinyal üretimde gelir.

## 5. Açık sorular

- `CordisPartnerProfile` / `CordisCoParticipation` türetimi (`generatePartnerProfiles()`) bu iş
  kapsamında ölçülmedi; K2 zincirinin son halkası olarak ayrı doğrulama ister.
- Worker için CI'da koşan bir Python testi yok; regresyonu şu an yalnız TS tarafı koruyor.

## 6. Sonraki adım

Kart `review`'a alınabilir. Ayrı bir iş olarak: worker'ın normalize adımı için pytest + kapıya
bağlama.
