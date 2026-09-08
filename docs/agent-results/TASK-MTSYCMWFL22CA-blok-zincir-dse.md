# TASK-MTSYCMWFL22CA — Paylaşılan korpus ingest'i sessizce hiçbir şey saklamıyor (RLS + yutulan hata)

**Ajan:** blok-zincir-dse · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-08
**Branch:** `dev` · **Ölçüm rolü:** `fabrika_app` (NOSUPERUSER, NOBYPASSRLS), canlı yerel DB

## Özet — kartın hangi yarısı doğru çıktı

| Yarı | Hüküm | Dayanak |
|---|---|---|
| **RLS** — "paylaşılan korpusa (tenantId NULL) yazılamıyor" | **ÇÜRÜDÜ.** Bugünkü HEAD'de `fabrika_app` rolüyle belge de parça da saklanıyor. | Sonda 1 |
| **Yutulan hata** — "sıfır satır saklandığı hâlde akış başarılı görünüyor" | **DOĞRULANDI, ve düzeltildi.** Ölçüm: `synced=1, success=true` ↔ `0 belge, 0 parça`, ingest hatası için `SystemAlert` YOK. | Sonda 2 / ARM 1 |
| **İkinci ingest yolu** (admin PDF yükleme) | Ayrı bir kusur bulundu: yarım yazılmış belge geri alınmıyordu. | Sonda 3 |

---

## 1. Ne yapıldı

### 1.1 Önce ölçüm — RLS iddiası çürütüldü

`1735389` ve `27edf60` sonrası paylaşılan korpus yazımının gerçekten çalışıp
çalışmadığı, **BYPASSRLS'siz `fabrika_app` rolüyle**, canlı DB'ye karşı, gerçek
`ingestDocument` çağrısıyla ölçüldü. Sonuç: yazma çalışıyor. Kartın bu yarısı
kapanabilir.

### 1.2 Yutulan hata yolları — adıyla listelendi

`src/lib/rag.ts` ve belge yükleme rotasındaki her `try/catch`:

| # | Yer | Yutulan mı? | Durum |
|---|---|---|---|
| S1 | `getEmbedding` catch → `mockEmbedding` | **EVET** — sağlayıcı hatasında sahte vektör saklanır; satır "ingest edilmiş" görünür, benzerlik aramasından asla dönmez. Çağırana bildirilmez, alert yazılmaz. | **DÜZELTİLDİ** — anahtar tanımlıyken hata yeniden fırlatılıyor; mock yalnızca anahtarsız dev/demo yolunda kalıyor. |
| S2 | `ingestDocument` catch → `console.warn` + sahte id döndürme | **EVET — kartın kusuru.** Her DB hatasını yutup ya `doc-<timestamp>` (hiç satır olmamış) ya da geri alınmış transaction'ın doc id'sini döndürüyordu. | **DÜZELTİLDİ** — catch kaldırıldı; hata çağırana dönüyor. |
| S3 | `retrieveChunks` catch → 3 sabit "CORDIS demo" parçası (skor 0.94/0.88/0.81) | **EVET** — hem yutulan hata hem CLAUDE.md #7 ihlali (uydurma rakam kullanıcıya gösteriliyor). Ayrıca korpus **boşken de** aynı sahte sonuçlar dönüyor. | **KAPSAM DIŞI — DÜZELTİLMEDİ**, adıyla bildiriliyor (bkz. §5). Kart ingest'i kapsıyor; `tests/cordis-rag.test.ts:170` bugün bu davranışı doğruluyor, değişimi ayrı kart. |
| S4 | Upload rotası catch → `console.error` + 500 | Hayır — çağırana dönüyor. Ama `SystemAlert` yazmıyor ve **yarım yazılan belge geri alınmıyordu**. | Kısmi yazma **DÜZELTİLDİ**. |

### 1.3 Düzeltmeler

**`src/lib/rag.ts` — `ingestDocument`**
- Yutan `try/catch` kaldırıldı. Fonksiyon artık yalnız **commit edilmiş** bir
  belgenin id'siyle çözülüyor; başka her durumda fırlatıyor.
- `stored` sayacı **Postgres'in bildirdiği etkilenen satır sayısından** toplanıyor
  (döngü sayacından değil). `stored !== chunks.length` ise fırlatıyor.
- Metin hiç parça üretmiyorsa (`chunks.length === 0`) **belge satırı açılmadan**
  reddediliyor — parçasız belge saklanmış belge değildir.
- Ayrı bir `SystemAlert` yazılmadı, çünkü iki çağıranın (`syncCordisBigData`,
  `syncCordisDelta`) mevcut `catch`'i zaten `skippedCount++` + `recordAlert`
  yapıyor; ikinci alert yalnız kopya üretirdi. Kural 6 karşılanıyor (ARM 2 kanıtı).

**`src/lib/rag.ts` — `getEmbedding`:** `env.OPENAI_API_KEY` tanımlıyken gelen hata
yeniden fırlatılıyor.

**`src/lib/ai/rag.ts` — `processPdfAndStore`** (admin PDF yükleme yolu):
- Boş parçalar döngü içinde `continue` ile atlanmak yerine **önceden eleniyor** →
  `ordinal` boşluksuz, `chunks.length` gerçekten yazılması gereken satır sayısı.
- Çıkarılabilir metin yoksa (taranmış/görüntü PDF) **hiçbir satır yazılmadan**
  fırlatıyor.
- Döngü `try/catch` içinde: hata hâlinde yarım belge siliniyor. Silme de
  başarısız olursa öksüz belge **`SystemAlert`** ile id'siyle adlandırılıyor
  (`SystemAlert`'in RLS'i yok → yalnız id, içerik değil).
- Dönüş tipi `{ doc, storedChunks }`.
- `$transaction` bilinçli olarak kullanılmadı: döngü parça başına bir sağlayıcı
  çağrısı yapıyor; büyük PDF'te transaction'ı dakikalarca açık tutmak Prisma'nın
  interactive-transaction zaman aşımını tetiklerdi.

**`src/app/api/admin/documents/upload/route.ts`:** yanıt artık
`{ success: true, docId, chunks: storedChunks }` — `chunks` Postgres'in
doğruladığı sayı.

**`tests/cordis-delta.test.ts`:** `vi.mock('../src/lib/db')` yalnız `prisma`
veriyordu, `withTenant` vermiyordu. Bu dosyadaki her ingest aslında
`withTenant is not a function` ile patlıyordu; **S2 bunu yutuyordu**, dolayısıyla
suite hiç yazılmamış bir belge üzerinden `deltaCount: 1` doğruluyordu. Mock
tamamlandı (test gevşetilmedi — tersine, gerçekten çalıştırılır hâle geldi).

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### Sonda 1 — RLS iddiası çürüdü
`docs/agent-results/TASK-MTSYCMWFL22CA-probes/probe1-rls.ts`

```
--- 1. connected role capabilities ---
┌─────────┬───────────────┬──────────┬──────────────┐
│ (index) │ current_user  │ rolsuper │ rolbypassrls │
├─────────┼───────────────┼──────────┼──────────────┤
│ 0       │ 'fabrika_app' │ false    │ false        │
└─────────┴───────────────┴──────────┴──────────────┘
--- 2. live policies on Document/Chunk ---
[
  {
    "tablename": "Chunk",
    "policyname": "tenant_or_shared",
    "cmd": "ALL",
    "qual": "((\"tenantId\" IS NULL) OR (\"tenantId\" = current_setting('app.tenant_id'::text, true)))",
    "with_check": "((\"tenantId\" IS NULL) OR (\"tenantId\" = current_setting('app.tenant_id'::text, true)))"
  },
  {
    "tablename": "Document",
    "policyname": "tenant_or_shared",
    ... aynı qual / with_check ...
  }
]
--- 3. ingestDocument(shared corpus, tenantId=undefined) ---
returned docId : cmtt3rxpx0000qaxko6n34sog
threw          : (no throw)
--- 4. raw SELECT as fabrika_app (app.tenant_id unset) ---
Document rows: 1
│ 0 │ 'cmtt3rxpx0000qaxko6n34sog' │ null │ 'CORDIS_PROJECT' │ 'PROBE-MTSYCMWFL22CA-1788898159024 title' │
Chunk rows: 1
│ 0 │ '6403ff71-433d-47a4-a619-b3b38366db7e' │ null │ 0 │ 'PROBE-MTSYCMWFL22CA-1788898159024 body —' │ has_embedding: true │
--- 5. does the returned id match a stored row? ---
Document with id "cmtt3rxpx0000qaxko6n34sog" exists: true
--- 6. cleanup: chunks deleted 1 , documents deleted 1
```

→ `WITH CHECK`'in `"tenantId" IS NULL` dalı yerinde; paylaşılan korpusa yazma
BYPASSRLS'siz rolle çalışıyor. **Kartın RLS yarısı geçersiz.**

### Sonda 2 — çürütme sondası (üç kol, aynı komut)
`docs/agent-results/TASK-MTSYCMWFL22CA-probes/probe2-counterfactual.ts`
Mutasyon: `src/lib/rag.ts` içindeki `INSERT INTO "Chunk"` → `INSERT INTO "Chunk__MUTATED_BY_PROBE"`.

**ARM 1 — düzeltme ÖNCESİ kod (git HEAD), saklama bozuk:**
```
[ingestDocument] DB ingestion bypassed:
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `42P01`. Message: `relation "Chunk__MUTATED_BY_PROBE" does not exist`
REPORTED: {
  "success": true,
  "source": "input",
  "syncedProjectsCount": 1,
  "skippedCount": 0,
  "totalEcContributionEUR": 1234567,
  "syncedAt": "2026-09-08T20:18:46.586Z"
}
STORED Document rows : 0
STORED Chunk rows    : 0
SystemAlert rows naming this run's record : 1
│ 0 │ 'warn' │ 'cordis-sync' │ 'CORDIS coordinator has no organisation id (PIC); participation not wri' │
--- VERDICT ---
reported synced=1 skipped=0 success=true | actually stored documents=0 chunks=0 | new alerts=1
```
Tek alert **ilgisiz** bir PIC uyarısı; ingest başarısızlığı için alert **yok**.
"Başarıyla senkronize edildi: 1 proje" — sıfır satır saklanmışken.

**ARM 2 — düzeltme SONRASI kod, aynı bozuk saklama:**
```
REPORTED: {
  "success": false,
  "source": "input",
  "syncedProjectsCount": 0,
  "skippedCount": 1,
  "totalEcContributionEUR": 0,
  "syncedAt": "2026-09-08T20:18:47.108Z"
}
STORED Document rows : 0
STORED Chunk rows    : 0
SystemAlert rows naming this run's record : 2
│ 0 │ 'warn'  │ 'cordis-sync' │ 'CORDIS coordinator has no organisation id (PIC); participation not wri'  │
│ 1 │ 'error' │ 'cordis-sync' │ 'CORDIS record failed to sync: \nInvalid `prisma.$executeRawUnsafe()` in' │
--- VERDICT ---
reported synced=0 skipped=1 success=false | actually stored documents=0 chunks=0 | new alerts=2
```

**ARM 3 — düzeltme sonrası kod, saklama geri yüklendi (kontrol):**
```
REPORTED: {
  "success": true,
  "syncedProjectsCount": 1,
  "skippedCount": 0,
  "totalEcContributionEUR": 1234567
}
STORED Document rows : 1
│ 0 │ 'cmtt444av0001s7xkxhjcefqz' │ null │ 'CORDIS_PROJECT' │ 'CORDIS Project: PROBEACR - PROBE-MTSYCMWFL22CA-fixed-restored — …' │
STORED Chunk rows    : 1
--- VERDICT ---
reported synced=1 skipped=0 success=true | actually stored documents=1 chunks=1 | new alerts=1
```

→ Bozukken **"başarıyla yüklendi" DEMİYOR**, `SystemAlert` üretiyor; geri
yüklenince geçiyor. `syncedProjectsCount` artık gerçekten saklanan belgeyi sayıyor.

### Sonda 3 — admin PDF yükleme yolu, düzeltme öncesi
`docs/agent-results/TASK-MTSYCMWFL22CA-probes/probe3-upload.ts`

```
=== processPdfAndStore(text-free PDF, tenantId=null) ===
returned : undefined
threw    : Error: OPENAI_API_KEY not set
STORED Document rows : 1
│ 0 │ 'cmtt3ug4f0000gvxka6x2oeq9' │ null │ 'SHARED_PDF' │ 'PROBE-MTSYCMWFL22CA-upload-1788898275885' │
STORED Chunk rows    : 0  <- retrievable content
cleanup: documents deleted 1
```

→ Ortada gömme hatası: **1 belge, 0 parça**, geri alma yok. Paylaşılan korpusta
hiçbir şeyin dönmediği başlıklı bir belge kalıyor.

Yan ölçüm (`probe3b-pdftext.ts`): pdf-parse v2 metinsiz bir PDF için sayfa
ayracı üretiyor — `"\n\n-- 1 of 1 --\n\n"`. Yani taranmış bir PDF bugün korpusa
tek bir çöp parça olarak da girebiliyordu; boş-parça elemesi bunu da kapatıyor.

### Sonda 4 — `SystemAlert` yazımı `fabrika_app` ile çalışıyor mu
`docs/agent-results/TASK-MTSYCMWFL22CA-probes/probe4-alert.ts`
```
recordAlert returned : {"status":"recorded","id":"cmtt4102j0000uxxks28fv8dy"}
rows found : 1
│ 0 │ 'cmtt4102j0000uxxks28fv8dy' │ 'error' │ 'probe-MTSYCMWFL22CA' │ 'probe alert — does this row land?' │
┌─────────┬───────────────┬────────────────┬─────────────────────┐
│ (index) │ relname       │ relrowsecurity │ relforcerowsecurity │
│ 0       │ 'SystemAlert' │ false          │ false               │
└─────────┴───────────────┴────────────────┴─────────────────────┘
cleanup deleted 1
```
(Bu sonda, ARM 2'de bir ara `alerts=0` okumasının **kodun değil ölçümün** hatası
olduğunu göstermek için yazıldı — ayrıntı §4'te.)

### Kalıcı regresyon testleri — önce KIRMIZI

`tests/rag-ingest-silent-failure.test.ts`, düzeltme öncesi `src/lib/rag.ts`'ye karşı:
```
× rejects when the chunk INSERT fails — no id comes back for a rolled-back write
× rejects when Postgres reports fewer inserted rows than there were chunks
× refuses text that yields no chunks, before a Document row exists
× a failed ingest is a skip with an alert behind it, never a synced project
× rethrows a provider failure when a key IS configured
AssertionError: promise resolved "'doc-0'" instead of rejecting
AssertionError: promise resolved "'doc-0'" instead of rejecting
AssertionError: promise resolved "'doc-0'" instead of rejecting
AssertionError: expected 1 to be +0 // Object.is equality      <- syncedProjectsCount
AssertionError: promise resolved "[ 0.5295227138571961, …(1535) ]" instead of rejecting
 Test Files  1 failed (1)
      Tests  5 failed | 3 passed (8)
```

`tests/rag-pdf-ingest-partial.test.ts`, düzeltme öncesi `src/lib/ai/rag.ts`'ye karşı:
```
× reports the chunk count Postgres confirmed, alongside the document
× a PDF with no extractable text stores nothing and is not a success
× an embedding failure part way through removes the half-written document
× an orphan that survives cleanup is named in a SystemAlert, not left quiet
AssertionError: expected undefined to be 3
AssertionError: promise resolved "{ id: 'doc-0', title: 'A scan' }" instead of rejecting
AssertionError: expected [ { id: 'doc-0', title: 'A paper' } ] to have a length of +0 but got 1
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 Test Files  1 failed (1)
      Tests  4 failed (4)
```

Düzeltme sonrası her ikisi de yeşil (12/12).

### Kapı çıktıları

```
$ pnpm typecheck
src/lib/billing/invoice-writer.test.ts(276,18): error TS2339: Property 'meta' does not exist on type '{ level: string; source: string; message: string; }'.
```
→ **Bana ait değil.** `src/lib/billing/invoice-writer.test.ts` bu turda
`geli-tirici`'de açık (`git status`: ` M`), KDV kartının içinde. Benim dokunduğum
beş dosyada tip hatası yok.

```
$ pnpm lint
/…/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used
/…/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used
✖ 2 problems (0 errors, 2 warnings)
```
→ 0 hata; iki uyarı başka bir kartın kanıt dosyalarından, HEAD'de zaten vardı.

```
$ pnpm test
 Test Files  129 passed | 2 skipped (131)
      Tests  1531 passed | 8 skipped (1539)
```

```
$ pnpm rls:verify
Kiracıya özel model: 43 · RLS açık tablo: 49 · tenant_isolation politikası: 43

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi

✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
```

### Sonda satırları temizlendi

Bütün sonda satırları (`PROBE-MTSYCMWFL22CA%`) `Document`, `Chunk`,
`CordisProject` ve `SystemAlert` tablolarından silindi:
```
SystemAlert probe rows → deleted 0
Chunk probe rows → deleted 0
Document probe rows → deleted 0
CordisProject probe rows → deleted 1
probe alerts remaining: 0
```
Sondaların ürettiği gömme vektörleri **gerçek değildir** (`OPENAI_API_KEY` boş →
`mockEmbedding`); benzerlik skoru olarak okunmamalıdır. Prod DB'ye dokunulmadı.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/rag.ts` | `ingestDocument` yutmayı bıraktı + saklanan satır sayısı doğrulanıyor; `getEmbedding` sağlayıcı hatasını fırlatıyor |
| `src/lib/ai/rag.ts` | `processPdfAndStore` atomik hâle geldi, `{ doc, storedChunks }` dönüyor, öksüz belge alert'liyor |
| `src/app/api/admin/documents/upload/route.ts` | Yanıta `chunks` eklendi |
| `tests/rag-ingest-silent-failure.test.ts` | **YENİ** — 8 regresyon testi |
| `tests/rag-pdf-ingest-partial.test.ts` | **YENİ** — 4 regresyon testi |
| `tests/cordis-delta.test.ts` | `withTenant` mock'u eklendi (eksik mock, yutulan hatanın arkasında saklıydı) |
| `tests/admin-upload-authz.test.ts` | Yeni yanıt şekline (`chunks`) uyarlandı |
| `docs/agent-results/TASK-MTSYCMWFL22CA-probes/*.ts` | Ölçüm sondaları (kanıt, ürün kodu değil; `tsconfig` `exclude`'unda) |

Şemaya, migration'a, `messages/*.json`'a, `src/lib/billing/*` ve
`src/lib/efatura*`'ya **dokunulmadı**. Şema değişikliği gerekmedi.

---

## 4. Riskler ve ölçüm notları

1. **Kendi ölçümümde bir yanlış-negatif buldum ve düzelttim.** İlk ARM 2
   koşusunda "alerts=0" okudum. Neden kod değil, sorgumdu: `SystemAlert.createdAt`
   `timestamp without time zone` (UTC) ve node-pg'ye JS `Date` verince yerel
   offset'li literal gidiyor (TR'de +3 saat) — filtre her satırı eliyordu. Ayrıca
   `recordAlert` **çözülmemiş** aynı kimlikli bir alert'i güncelliyor (yeni satır
   açmıyor) ve zaman sınırı yok, dolayısıyla "T'den sonra oluşturulan" filtresi
   gerçekten yazılmış bir alert için sıfır döndürebiliyor. Sonda, alert'leri
   kendi `projectId`'sini `meta` içinde arayarak eşleştirecek şekilde
   düzeltildi. Sonda 4 `recordAlert`'in `fabrika_app` ile satır yazdığını
   bağımsız olarak gösteriyor.
2. **Paylaşılan geliştirme DB'si:** ölçüm sırasında başka ajanların işleri de
   `SystemAlert` yazıyordu (`invoice_buyer_identity_missing`). Bu yüzden alert
   sayımı tablo geneli delta'dan vazgeçip kendi kaydına ait eşleşmeye çevrildi.
3. **`ingestDocument` gömme çağrılarını transaction içinde yapıyor** (HEAD'den
   beri böyle, benim değişikliğim değil). CORDIS kayıtları tek parça olduğu için
   bugün sorun çıkmıyor; uzun bir metin ingest edilirse Prisma'nın interactive
   transaction zaman aşımı devreye girer. `processPdfAndStore`'da bu tuzağa
   bilerek girilmedi. Ayrı kart konusu.
4. **Yeni davranış geriye dönük uyumsuz:** `ingestDocument` artık fırlatıyor ve
   `processPdfAndStore` nesne dönüyor. Bugünkü tüm çağıranlar (2 + 1) uyarlandı;
   ileride eklenecek bir çağıranın `catch`'i olması gerekir.
5. `chunks: 0` üreten bir PDF artık **500** dönüyor (önce 200 dönüyordu). Bu
   kasıtlı: sessiz başarı yasak. Kullanıcıya görünen bir metin eklenmedi
   (`messages/*.json` kilitli); rota hata gövdesini zaten `errorMessage` ile
   döndürüyor.

---

## 5. Açık sorular / kapsam dışı bildirimler (DÜZELTİLMEDİ)

1. **`retrieveChunks` uydurma sonuç döndürüyor (S3, CLAUDE.md #7 ihlali).**
   `src/lib/rag.ts:204-221` — herhangi bir hatada **ve korpus boşken** üç sabit
   "CORDIS projesi" 0.94 / 0.88 / 0.81 skorlarıyla dönüyor; bunlar
   `formatRagPrompt` ile `[Source 1 | Score: 94.0%]` diye LLM'e ve dolaylı olarak
   kullanıcıya gidiyor. Hiçbir `Evidence`/`TopicStat` kaydına bağlı değil.
   `tests/cordis-rag.test.ts:170,176` bugün bu davranışı doğruluyor, yani
   düzeltme testi de kapsar → **ayrı kart açılmalı.**
2. **`src/lib/ai/rag.ts` global prisma istemcisiyle yazıyor.** `tenantId` dolu bir
   çağrı `app.tenant_id` olmadan RLS'e takılır. Bugün tek çağıran `null`
   geçtiği için erişilemiyor. TASK-MTSZ0AL4QP2CT'nin (backlog) sınıfı.
3. **`semanticSearch` (aynı dosya) hâlâ global istemciyle ve `withTenant`
   olmadan okuyor** — `src/modules/m2/server/actions.ts:103` kiracı id'siyle
   çağırıyor. Aynı sınıf, aynı kart.
4. **`pnpm typecheck` HEAD'de kırmızı:** `src/lib/billing/invoice-writer.test.ts:276`.
   `geli-tirici`'nin açık KDV kartına ait; dokunmadım.
5. `src/lib/rag.ts` ile `src/lib/ai/rag.ts` iki paralel RAG uygulaması
   (farklı parça boyutu: 1500/200 ve 1000/200, farklı saklama yolu). LLM
   adaptörlerinde aynı ikilik TASK-MTSXGXBCJ007W ile birleştirilmişti; RAG için
   aynı birleştirme yapılmadı. Bildiriyorum, bu kartta yapmadım.

---

## 6. Sonraki adım

- LEED-EN: §5.1 (uydurma retrieval sonuçları) için kart açılması — kullanıcıya
  gösterilen rakam olduğu için CLAUDE.md #7 kapsamında P1 değerlendirilmeli.
- §5.2/§5.3 TASK-MTSZ0AL4QP2CT'ye eklenebilir.
- Bu kart: **kanıtla kapatılabilir** — RLS yarısı çürütüldü, yutulan hata yarısı
  düzeltildi ve mutasyon sondasıyla + 12 kalıcı regresyon testiyle doğrulandı.

## Definition of Done

- [x] RLS iddiası `fabrika_app` rolüyle canlı DB'ye karşı ham `SELECT` ile ölçüldü — çürüdü
- [x] Yutulan hata yolları adıyla listelendi (S1–S4)
- [x] Çürütme sondası: saklama bozulunca akış başarısızlığı bildiriyor + `SystemAlert` üretiyor
- [x] Geri yüklenince geçiyor (ARM 3)
- [x] "Kaç satır saklandı" sayısı Postgres'in bildirdiği satır sayısından türetiliyor
- [x] Kalıcı regresyon testleri `tests/` altında; düzeltme öncesi KIRMIZI olduğu gösterildi
- [x] `pnpm typecheck` / `lint` / `test` / `rls:verify` çıktıları raporda; kırmızılar atfedildi
- [x] Sonda satırları silindi; prod DB'ye dokunulmadı
- [x] Kapsam dışı kusurlar düzeltilmeden adıyla bildirildi
