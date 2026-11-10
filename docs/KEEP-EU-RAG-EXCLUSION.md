# keep.eu RAG — kişi adı içeren projelerin dışlanması (FO-363)

Karar: K-575447 = C. Türk ortak adında gerçek kişi adı geçen projelerin metni OpenAI'ye gönderilmez.

## Dışlanan projeler

`RAG_EXCLUDED_PROJECT_IDS` (`src/lib/keep-eu-sync.ts`):

| keep.eu projectId | Not |
|---|---|
| BGTR0300118 | şahıs ortaklığı, yalnız elle bulundu |
| BGTR0300121 | NER ile bulundu + elle doğrulandı |
| BGTR0300153 | yalnız NER-2 + elle |
| BGTR0300155 | NER + elle |
| BGTR0300162 | şirket unvanında ad-soyad, yalnız elle |

İsimler bu dosyaya ve koda yazılmaz. Gerekçe: FO-359 taramasında otomatik yakalama 5 vakadan 3'ünü buldu.

## Davranış

- **Kayıt kalır:** dışlanan projeler `CordisProject`'e yazılır. Yalnız gömme adımı (`ingestDocument`, `embedText`) atlanır.
- **Varsayılan dışlamadır:** `syncKeepEuData` çağrısında `ragExcludeProjectIds` verilmezse liste uygulanır. Boş dizi geçmek yalnız testte kullanılır.
- **Sayaçlar:** sonuçta `ragExcludedCount` (bu koşuda dışlanan) ve `ragExclusionMissingCount` (listede olup veride bulunmayan kimlik). CLI özetinde ikisi de yazılır.
- **Eksik kimlik uyarısı:** veride yoksa `SystemAlert` (`keep-eu-sync:rag-exclusion-missing`) üretilir, koşu durmaz. `--limit` ile kesilmiş koşuda ve `source: database` yolunda uyarı üretilmez (eksiklik orada kanıt değildir).
- **CORDIS yeniden dizinlemesi keep.eu satırlarını almaz:** keep.eu projeleri `CordisProject` tablosunda `KEU:` önekiyle durur. `syncCordisBigData()` (admin "CORDIS sync") kayıt verilmeden çağrılınca bu satırları atlar (`src/lib/cordis-sync.ts` `loadRecordsFromDatabase`). keep.eu metni yalnız `syncKeepEuData` üzerinden gömülür; dışlama listesi de yalnız orada uygulanır. Bu filtre eklenmeden önce dışlanan projeler bu yoldan `CORDIS_PROJECT` olarak gömülüyordu (FO-363 incelemesi). Kanıt: `tests/keep-eu-cordis-reindex.live.test.ts`.
- **Mevcut gömme silinmez:** dışlanan bir projenin daha önce yazılmış RAG dokümanı varsa bu kod onu silmez. Silme ayrı ve onaylı bir adımdır (aşağıda).

## Tam koşu öncesi tarama (elle, her koşudan önce)

Tarama betikleri repoda **değil** (kişi verisi işler, NER modeli indirir). Yöntem FO-359 raporunda (`docs/agent-results/FO-359-se-fb.md`):

1. Upstream gövdeleri (title, description, leadPartner, turkishPartners, themes) için e-posta ve telefon düzenli ifadeleri.
2. İki yerel NER modeli (`Xenova/bert-base-NER`, `Xenova/distilbert-base-multilingual-cased-ner-hrl`) ile kişi adı adayları. Model dosyası indirilir, metin dışarı gönderilmez.
3. Ortak adı alanlarının elle denetimi. Otomatik tarama tek başına yetmez (FO-359: 5 vakadan 3).
4. Yeni bulgu çıkarsa kimliği `RAG_EXCLUDED_PROJECT_IDS`'e ekle, PR'da onay al.

## Önceden gömülmüş parça (temizlik, onaylı adım)

Dışlama uygulanmadan önce gömülmüş bir kayıt varsa şu sorgu kapsamı gösterir (salt okunur):

```sql
-- INTERREG_PROJECT: keep.eu RAG yolu ("Project ID: <id>").
-- CORDIS_PROJECT: FO-363 düzeltmesinden önceki CORDIS yeniden dizinlemesi ("CORDIS project id: KEU:<id>").
SELECT DISTINCT d.id, d.kind, d.title FROM "Document" d
JOIN "Chunk" c ON c."documentId" = d.id
WHERE d.kind IN ('INTERREG_PROJECT', 'CORDIS_PROJECT')
  AND c.text ~ '(Project ID: |CORDIS project id: KEU:)BGTR03001(18|21|53|55|62)\M';
```

Not: `CORDIS_PROJECT` türünde başka `KEU:` gövdeleri de çıkabilir (düzeltmeden önce yeniden dizinlenen diğer keep.eu projeleri). Bunlar kişi adı içermez ama `INTERREG_PROJECT` kopyasının ikizidir. Silinip silinmeyeceği ayrı bir karardır.

Satır dönerse silme (`DELETE FROM "Document" WHERE id IN (...)`, `Chunk` cascade) ayrıca onaylanır. Yazılmadan önce satırlar kontrol edilir ve yedeği alınır.
