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
SELECT d.id, d.title FROM "Document" d
JOIN "Chunk" c ON c."documentId" = d.id
WHERE d.kind = 'INTERREG_PROJECT'
  AND (c.text LIKE '%Project ID: BGTR0300118%' OR c.text LIKE '%Project ID: BGTR0300121%'
    OR c.text LIKE '%Project ID: BGTR0300153%' OR c.text LIKE '%Project ID: BGTR0300155%'
    OR c.text LIKE '%Project ID: BGTR0300162%');
```

Satır dönerse silme (`DELETE FROM "Document" WHERE id IN (...)`, `Chunk` cascade) ayrıca onaylanır. Yazılmadan önce satırlar kontrol edilir ve yedeği alınır.
