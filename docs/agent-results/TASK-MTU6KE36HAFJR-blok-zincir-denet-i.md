# TASK-MTU6KE36HAFJR — İki RAG yolu (`src/lib/rag.ts` vs `src/lib/ai/rag.ts`) denetimi

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tip:** salt-okunur denetim + karar hazırlığı · **Tarih:** 2026-09-09
**Platform beyanı:** macOS (Darwin 25.6.0, zsh, `pnpm typecheck` burada koşuldu). Bu denetimde platforma bağlı kod yolu YOK — okunan iki dosya saf TS/SQL, süreç öldürme / dosya yolu / kabuk / ekran-izin bağımlılığı içermiyor; Windows ve Linux'ta aynı sonucu verir. E2E/DB gerektiren doğrulama **koşulmadı — sebebi: çakışma kuralı** (`pnpm dev`, `pnpm test:e2e`, `pnpm gate` ve DB'ye dokunan komutlar bu turda blok-zincir-dev'in P0 kapı işine ayrılmıştı). `pnpm test` (vitest) de bu yasağın sınırında olduğu için koşulmadı; test davranışına dair aşağıdaki iddialar **kod ve stub okumasından** türetildi ve öyle etiketlendi.
**Kod değişmedi, dosya silinmedi, commit atılmadı.** Bu tur yalnız ölçüm.

---

## 0. Tek cümlelik cevap

İki dosya **ölü kod değil — ikisi de canlı**, ve `llm.ts` ikizinin aksine **kredi/kullanım kaydı bakımından AYRIŞMIYORLAR** (ikisi de tek `embedText` tıkacından geçiyor, aynı model, aynı 1536 boyut, aynı `credits: 0`). Gerçek ayrışma başka üç yerde: **veritabanı bağlantısı** (`withTenant` vs global `prisma`), **hata davranışı** (biri UYDURMA veri döndürüyor, diğeri fırlatıyor) ve **chunk boyutu** (1500 vs 1000, aynı `Chunk` tablosuna). Öneri: **Seçenek A — `src/lib/ai/rag.ts` kaldırılsın, iki fonksiyonu `src/lib/rag.ts`'e taşınsın.**

---

## 1. İki dosyanın ölçülmüş farkları

`src/lib/rag.ts` — 280 satır · `src/lib/ai/rag.ts` — 204 satır.

| Boyut | `src/lib/rag.ts` | `src/lib/ai/rag.ts` | Aynı mı? |
|---|---|---|---|
| Gömme çağrısı | `embedText(text, attribution, { dimensions: 1536 })` — `rag.ts:82` | `embedText(chunkStr, {...})` — `ai/rag.ts:106`, `:164` (opts YOK) | **Aynı sonuç**, farklı yazım |
| Gömme modeli | `DEFAULT_EMBEDDING_MODEL` = `text-embedding-3-large` (`llm.ts:444`) | aynı — ikisi de varsayılanı kullanıyor | ✅ aynı |
| Boyut | 1536 (açıkça geçiliyor, `rag.ts:26`) | 1536 (varsayılan, `llm.ts:445`) | ✅ aynı **değer**, ⚠ farklı **kaynak** |
| Chunk boyutu / örtüşme | **1500 / 200** (`rag.ts:23-24`) | **1000 / 200** (`ai/rag.ts:81` → `chunkText(text, 1000, 200)`) | ❌ **FARKLI** |
| Boş chunk elemesi | yok (`splitText`, `rag.ts:41-52`) | var — `.filter(c => c.trim().length > 0)` (`ai/rag.ts:81`) | ❌ farklı |
| Benzerlik eşiği | **yok** | **yok** | ✅ aynı (ikisi de eşiksiz) |
| Kaç sonuç | `topK = 5` varsayılan (`rag.ts:185`) | `topK = 5` varsayılan (`ai/rag.ts:161`) | ✅ aynı |
| pgvector sorgusu | `1 - (embedding <=> $1::vector) AS score`, `ORDER BY embedding <=> $1::vector LIMIT $2` (`rag.ts:209-213`) | `1 - (c.embedding <=> ...) as similarity`, aynı ORDER BY/LIMIT (`ai/rag.ts:177-182`) | ✅ **mantık aynı**, ❌ alan adı `score` vs `similarity` |
| SQL parametrizasyonu | `$queryRawUnsafe` + **bağlı parametre** (`$1,$2,$3`) | `$queryRaw` **etiketli şablon** (Prisma parametreleştirir) | ✅ ikisi de güvenli |
| DB istemcisi | **`withTenant(scope, tx => …)`** (`rag.ts:142`, `:207`) → `SET LOCAL app.tenant_id` | **global `prisma`** (`ai/rag.ts:1`, `:90`, `:117`, `:145`, `:176`) → `app.tenant_id` **hiç ayarlanmıyor** | ❌ **FARKLI — §3** |
| Atomiklik (ingest) | Prisma interaktif transaction (`withTenant` → `$transaction`), hata → rollback | transaction **kasıtlı yok** (`ai/rag.ts:53-58`: uzun HTTP döngüsü timeout eder) → hata yolunda `discardPartialDocument` + `SystemAlert` | ❌ farklı strateji, ikisi de gerekçeli |
| Hata davranışı (arama) | `catch` → **3 adet SABİT KODLANMIŞ sahte CORDIS chunk'ı döndürüyor** (`rag.ts:227-250`) | `catch` yok → **fırlatıyor** | ❌ **FARKLI — §4** |
| Anahtarsız ortam (ingest) | `getEmbedding` → `mockEmbedding` ile **anlamsız vektör yazıyor** (`rag.ts:85-89`, `:95-103`) | `embedText` fırlatır → **hiç yazmıyor** (`llm.ts:513`) | ❌ **FARKLI — §5** |
| PDF ayrıştırma | yok | var (`PDFParse`, `ai/rag.ts:75-76`) | tekil yetenek |
| Prompt biçimleme | `formatRagPrompt` / `buildRagPrompt` (`rag.ts:253-280`) | yok | tekil yetenek |
| Yetim temizliği | yok (transaction hallediyor) | `discardPartialDocument` + `SystemAlert` (`ai/rag.ts:143-156`) | tekil yetenek |

**Sonuç:** bu iki dosya "aynı dosyanın iki kopyası" DEĞİL — **örtüşen iki yarım**. Ortak çekirdek (parçala → göm → `Chunk`'a yaz → kosinüs ara) iki kez yazılmış; her dosyanın diğerinde olmayan bir yeteneği var.

---

## 2. Gerçek çağıranlar (dosya:satır)

`import` satırı ≠ çağrı — kapsam `grep -rn "\b<sembol>("` ile ayrı sayıldı ([[fabrika-importer-count-is-not-caller-count]] gereği).

### `src/lib/rag.ts` — ÜRETİM çağıranları (4)
| Çağıran | Satır | Sembol | Kiracı bağlamı |
|---|---|---|---|
| `src/lib/cordis-sync.ts` | `:368` | `ingestDocument(...)` | tenantId **geçilmiyor** → paylaşımlı |
| `src/lib/cordis-delta.ts` | `:298` | `ingestDocument(...)` | tenantId **geçilmiyor** → paylaşımlı |
| `src/app/[locale]/admin/cordis/actions.ts` | `:83`, `:84` | `retrieveChunks` + `formatRagPrompt` | platform kapsamı (tenantId yok) |
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | `:99` | `buildRagPrompt(ragQuery, tenantId, undefined, { userId })` | **GERÇEK kiracı** |

Test çağıranları: `src/lib/rag.test.ts` (`:40,:49,:57,:66,:84,:99`), `tests/rag-ingest-silent-failure.test.ts` (`:87,:97,:103,:110,:152,:162`), `tests/cordis-rag.test.ts` (`:165,:171,:177`).

### `src/lib/ai/rag.ts` — ÜRETİM çağıranları (2)
| Çağıran | Satır | Sembol | Kiracı bağlamı |
|---|---|---|---|
| `src/app/api/admin/documents/upload/route.ts` | `:31` | `processPdfAndStore(buffer, **null**, …)` | açıkça `null` → paylaşımlı |
| `src/modules/m2/server/actions.ts` | `:103` | `semanticSearch(searchQuery, **tenantId**, 3, { userId })` | **GERÇEK kiracı** |

Test çağıranları: `tests/rag-pdf-ingest-partial.test.ts` (`:94,:109,:122,:135`), `tests/admin-upload-authz.test.ts` (`:24` mock), `src/modules/m2/server/actions.test.ts` (`:40,:46` mock).

### Ölü kod var mı?
**Hayır.** Her iki dosyanın da en az 2 üretim çağıranı var. `src/lib/ai/rag.ts`'in her iki export'u (`processPdfAndStore`, `semanticSearch`) canlı; `src/lib/rag.ts`'in `splitText` dışındaki tüm export'ları canlı (`splitText` yalnız test + dosya-içi kullanımda, `getEmbedding` yalnız test + dosya-içi — ikisi de dahili yardımcı, ölü değil).

---

## 3. ⚠ AYRI BAŞLIK — Kredi/kullanım kaydı ve kiracı filtresi AYNI mı?

Kartın asıl sorusu. Cevap satırla:

### 3.1 `AiUsageLog` yazımı ve kredi: **İKİSİ DE AYNI, İKİSİ DE YAZIYOR**

Bu, `llm.ts` ikizinden (TASK-MTSXGXBCJ007W, aynı çağrı 7 kat farklı fiyat) **kesin ayrılan** nokta:

- `src/lib/rag.ts:82` → `await embedText(text, attribution, { dimensions: EMBEDDING_DIMENSIONS })`
- `src/lib/ai/rag.ts:106` ve `:164` → `await embedText(chunkStr | query, { tenantId, userId, module: RAG_MODULE, purpose: … })`

İkisi de **tek** tıkaçtan geçiyor ve o tıkaç kaydı **zorunlu** kılıyor:
```
llm.ts:546   await withTenant(scope, (tx) =>
llm.ts:547     tx.aiUsageLog.create({ data: { tenantId: scope, userId, module, purpose,
llm.ts:553       provider: 'openai', model, promptHash: hashPrompt(text),
llm.ts:556       inputTokens: data?.usage?.prompt_tokens ?? 0, outputTokens: 0, credits: 0 } }))
llm.ts:564     throw new AiUsageLogWriteError(...)   // log yazılamazsa vektör DÖNMÜYOR
```
Attribution sabitleri de birebir aynı: `module = 'K6'` (`rag.ts:29`, `ai/rag.ts:25`), `purpose = 'rag_ingest_embedding'` / `'rag_search_embedding'` (`rag.ts:30-31`, `ai/rag.ts:110`, `:168`).

**Kredi düşümü:** İkisinde de **kredi düşmüyor** — çünkü `embedText` `credits: 0` yazıyor (`llm.ts:558`), gerekçesi `llm.ts:501-505`'te: `docs/BILLING.md` gömme işlemi için katsayı tanımlamıyor, CLAUDE.md kural 7 uydurma rakamı yasaklıyor. Bu **iki yol için de aynı** — yani "biri ücretlendiriyor diğeri bedava" **DEĞİL**. `creditsForUsage` bu yolda hiç çağrılmıyor.

> **Ölçülmüş sonuç: kredi/kullanım kaydı bakımından iki yol AYNI şeyi yapıyor. `llm.ts` ikizinin fiyat ayrışması burada TEKRARLANMIYOR.** Birleştirme kararının gerekçesi maliyet değil, aşağıdaki üç madde.

### 3.2 Kiracı filtresi: **SQL'de aynı, BAĞLANTIDA farklı**

**SQL WHERE cümleleri denk:**
```
rag.ts:202-204     tenantId ? `("tenantId" IS NULL OR "tenantId" = $3)` : `"tenantId" IS NULL`
ai/rag.ts:179      WHERE c."tenantId" = ${tenantId} OR c."tenantId" IS NULL
ai/rag.ts:187      WHERE c."tenantId" IS NULL
```
İkisi de kiracı yoksa **kapanarak** başarısız oluyor (filtreyi kaldırmıyor, paylaşımlıya daraltıyor) — `src/lib/db.ts:88-94`'te anlatılan `tenantId ? {tenantId} : {}` sızıntı desenine **düşmüyorlar**. ✅

**Bağlantı farkı — burası ayrışıyor:**
```
rag.ts:142    return withTenant(scope, async (tx) => {        // SET LOCAL app.tenant_id
rag.ts:207    const results = await withTenant(scope, async (tx) => {
ai/rag.ts:90  const doc = await prisma.document.create({       // app.tenant_id AYARLANMIYOR
ai/rag.ts:117 stored += await prisma.$executeRaw`INSERT INTO "Chunk" …
ai/rag.ts:176 results = await prisma.$queryRaw`SELECT … FROM "Chunk" c …
```

**Bugün ne oluyor:** Hiçbir şey. Ana `DATABASE_URL` `fabrika` rolüyle bağlanıyor ve bu rol `SUPERUSER` + `BYPASSRLS` (`src/lib/db.ts:58-62` yorumu bunu açıkça yazıyor; ayrıca `prisma/rls-app-role.sql`). Yani `withTenant` kullanmak ile kullanmamak arasındaki fark bugün Postgres'te değil, JS tarafındaki WHERE cümlesinde — ve §3.2'de ölçüldüğü gibi **iki WHERE de doğru**. ([[fabrika-main-db-connection-bypasses-rls]])

**Yarın ne olacak (gizli kırılma):** `prisma/rls.sql:43-45`, `Document` ve `Chunk` üzerinde şu politikayı kuruyor:
```sql
USING ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
```
Ana bağlantı `fabrika_app` (NOBYPASSRLS) rolüne çevrildiği gün, `app.tenant_id` ayarlanmamış bir SELECT için `current_setting(...)` NULL döner → yalnız `"tenantId" IS NULL` satırları görünür. Yani:

> **`src/modules/m2/server/actions.ts:103` — `semanticSearch(searchQuery, tenantId, 3, …)` gerçek bir kiracı id'si geçiyor ama global `prisma` üzerinden çalışıyor. RLS devreye girdiği gün bu çağrı HATA VERMEZ; sessizce kiracının kendi belgelerini kaybeder ve yalnız paylaşımlı korpusu döndürür.** `src/lib/rag.ts`'in aynı işi yapan `retrieveChunks`'ı `withTenant` içinde olduğu için etkilenmez.

`ai/rag.ts:60-63`'teki yorum bu boşluğu kabul ediyor ama **yalnız `processPdfAndStore` için** ("which is all the one caller uses"). `semanticSearch`'ün kiracılı çağıranı o yorumun kapsamında değil — bu, yorumda ADI GEÇMEYEN ikinci bir maruziyet.

### 3.3 Bugün bu farkın etkisi neden sıfır: korpusta hiç kiracıya-özel satır YOK

Ölçüldü — `Chunk`/`Document` yazan **tüm** üretim yolları:
```
src/lib/cordis-sync.ts:368   ingestDocument(title, body, 'CORDIS_PROJECT')          // tenantId argümanı YOK
src/lib/cordis-delta.ts:298  ingestDocument(title, body, 'CORDIS_PROJECT_DELTA')    // tenantId argümanı YOK
upload/route.ts:31           processPdfAndStore(buffer, null, kind, title, …)       // açıkça null
```
Yani **bugün hiçbir üretim yolu `Chunk.tenantId`'yi NULL dışında bir değerle yazmıyor.** `ingestDocument`'in `tenantId` parametresi yalnız testte kullanılıyor (`src/lib/rag.test.ts:66,:84` — `'tenant_upload'`). Sonuç: her iki arama fonksiyonunun kiracılı dalı, bugün paylaşımlı dalla **aynı satır kümesini** döndürüyor; kiracı izolasyonu bu tabloda ölçülemez durumda çünkü izole edilecek veri yok. ([[a-conformance-check-cannot-see-absence]] — "filtre doğru mu" sorusu, "filtreye giren veri var mı" sorusunu gizliyor.)

---

## 4. Birleştirme kararından BAĞIMSIZ, ayrıca raporlanması gereken bulgu

**BULGU-1 (severity: yüksek) — `retrieveChunks` hata yolunda UYDURMA veri döndürüyor, ve bu veri kullanıcıya "kanıt" olarak gidiyor.**

```
rag.ts:227   } catch (e) {
rag.ts:229     if (e instanceof AiUsageLogWriteError) throw e;
rag.ts:230     console.warn(`[retrieveChunks] DB retrieval bypassed: …`);
rag.ts:231   }
rag.ts:234   return [ { text: `[CORDIS Project ZERO-EMISSION-EV] … EC Grant: €4,500,000 …`, score: 0.94, documentId: 'doc-cordis-1' },
rag.ts:240              { text: `[CORDIS Project HYDROGEN-CATALYST] … €3,200,000 …`,        score: 0.88, … },
rag.ts:245              { text: `[CORDIS Project RECYCLED-COMPOSITE] … €5,800,000 …`,       score: 0.81, … } ].slice(0, topK);
```

- **Tekrar-üretim:** `concept-notes/actions.ts:99` → `buildRagPrompt(ragQuery, tenantId, …)` → `retrieveChunks` → DB veya sağlayıcı hatası (AiUsageLogWriteError dışında herhangi biri) → bu üç sahte kayıt döner.
- **Beklenen:** Kiracı, geri getirilecek belgesi yoksa boş bağlam görür ya da hata alır.
- **Gözlenen (kod okumasıyla):** `formatRagPrompt` (`rag.ts:258`) bunları `[Source 1 | Score: 94.0%]` diye etiketleyip LLM prompt'una gömüyor; üretilen concept-note bölümü uydurulmuş üç CORDIS projesine ve uydurulmuş €4.500.000 rakamına dayanıyor.
- **İhlal:** CLAUDE.md kural 7 ("Kullanıcıya gösterilen her istatistik/oran `Evidence`/`TopicStat` kaydına bağlıdır; kod içine sabit rakam yazma").
- **Neden şimdiye kadar yakalanmadı:** `tests/fabricated-fallbacks.test.ts` bu tür demo-fallback'leri M1/M8/M10 **sayfalarından** süpürmüş (`:39`, `:75`, `:240`) — ama `src/lib/rag.ts` kütüphanesine hiç bakmamış. Bu fallback'i **hiçbir test kapsamıyor**: `tests/cordis-rag.test.ts:171` gerçek yolu koşuyor, çünkü stub `$queryRawUnsafe`'i uyguluyor (`tests/helpers/cordis-prisma-stub.ts:188-190`, `score: 0.92` döndürüyor) — yani fallback'e hiç düşülmüyor. **Kaldırılması mevcut testlerden hiçbirini kırmaz.**
- Kardeş dosya `src/lib/ai/rag.ts` aynı durumda **fırlatıyor** — yani doğru davranış zaten repoda mevcut, sadece yanlış dosyada.

**BULGU-2 (severity: orta) — anahtarsız ortamda `getEmbedding` korpusu anlamsız vektörlerle kirletiyor.**
`rag.ts:85-89` → `OPENAI_API_KEY` yoksa `mockEmbedding` (`rag.ts:95-103`: ilk 1536 karakterin kodu). Bu vektör **aynı `Chunk` tablosuna** yazılıyor ve `semanticSearch`/`retrieveChunks` onu gerçek bir gömme sanarak sıralıyor. `ai/rag.ts` aynı durumda hiç yazmıyor (`llm.ts:513` fırlatır). Dosya-içi yorum (`rag.ts:69-75`) bu riski **arama** için tanımış ama **ingest** için fallback'i bırakmış. Birleştirmede bir taraf seçilmeli.

**BULGU-3 (severity: düşük) — aynı `Chunk` tablosunda iki farklı granülerlik.**
CORDIS ingest 1500/200 karakterlik chunk yazıyor, PDF ingest 1000/200. Aynı tablo, aynı `topK=5` ile aranıyor → PDF kaynaklı chunk'lar kısa oldukları için kosinüs sıralamasında sistematik olarak farklı davranır. Hata değil ama **kasıtlı da değil**: iki dosyada iki sabit var, tek bir yerde karar verilmemiş.

**BULGU-4 (severity: düşük) — `semanticSearch` dönüş tipi tiplenmemiş.**
`ai/rag.ts:174` `let results;` + jeneriksiz `$queryRaw` → çağıran `m2/server/actions.ts:107` `Array.isArray(ragResults)` ile daralttığı için `r` fiilen `any`. `retrieveChunks` karşılığı `ChunkMatch` arayüzüyle tiplenmiş (`rag.ts:17-21`). `pnpm typecheck` temiz geçiyor (örtük evolving-any yasağa takılmıyor), ama CLAUDE.md "Yapma: `any`" ruhuna aykırı.

---

## 5. `src/lib/ai/` dizininin kendisi hakkında ölçüm

```
$ ls src/lib/ai/
rag.ts                      # dizinde BAŞKA dosya yok

$ git log --oneline --diff-filter=D --name-only -- 'src/lib/ai/*'
b6f16427 refactor(k6-ai): one LLM adapter, so one call has one price
src/lib/ai/llm.ts

$ git show --name-status b6f1642 | grep 'src/lib/ai'
D	src/lib/ai/llm.ts           # rag.ts'e DOKUNULMAMIŞ
```

**Ölçülmüş sonuç:** `src/lib/ai/` dizini, TASK-MTSXGXBCJ007W'de silinen ikiz adaptörün (`src/lib/ai/llm.ts`) artığıdır. O temizlik commit'i `rag.ts`'e hiç dokunmadı, dizin yalnız bu dosya yüzünden ayakta. Yani şüphe doğruydu: **temizlik yarım kalmış.** ([[fabrika-two-rag-files-src-lib-rag-vs-ai-rag]] şüphesi bu turda DOĞRULANDI — ama "aynı işi iki farklı fiyatla yapıyor" kısmı **yanlış çıktı**, §3.1.)

---

## 6. Karar özeti — üç seçenek

### Seçenek A — `src/lib/ai/rag.ts` kaldırılır, iki fonksiyonu `src/lib/rag.ts`'e taşınır ⭐ **ÖNERİLEN**

**Dokunulacak dosyalar: 5 kaynak + 3 test + 3 yorum-güncellemesi = ~11**
| Dosya | Değişiklik |
|---|---|
| `src/lib/ai/rag.ts` | silinir (dizin de boşalır) |
| `src/lib/rag.ts` | `processPdfAndStore`, `semanticSearch`, `discardPartialDocument` taşınır |
| `src/app/api/admin/documents/upload/route.ts:2` | import yolu |
| `src/modules/m2/server/actions.ts:6` | import yolu |
| `tests/rag-pdf-ingest-partial.test.ts:79` | dinamik import yolu |
| `tests/admin-upload-authz.test.ts:24` | `vi.mock` yolu |
| `src/modules/m2/server/actions.test.ts:40,:46` | `vi.mock` yolu |
| `src/lib/llm.ts:434`, `src/lib/env.ts:89`, `src/lib/llm.embed.test.ts:6` | yorumdaki dosya adı |

**Risk: DÜŞÜK-ORTA.** Import yolları mekanik. Gerçek risk, taşımanın **kopyala-yapıştır olamaması**: 3 karar birlikte verilmeli — (a) chunk boyutu 1500 mü 1000 mü (BULGU-3), (b) `retrieveChunks` fallback'i silinsin mi (BULGU-1 — evet, hiçbir test kırılmaz), (c) `mockEmbedding` ingest'te kalsın mı (BULGU-2). Ayrıca iki ingest **tek fonksiyona indirgenemez**: `ai/rag.ts:53-58` transaction'ın uzun PDF döngüsünde Prisma timeout'una takılacağını gerekçelendiriyor, `rag.ts` ise kısa CORDIS kayıtlarında transaction kullanıyor. Doğru hedef: **tek chunker + tek gömme+INSERT yardımcısı, iki ingest giriş noktası**.

**Kazanç:** `src/lib/ai/` dizini nihayet kaybolur (kural 5'in ihlal ettiği desen ortadan kalkar); `semanticSearch` `withTenant`'a geçerken §3.2'deki gizli RLS kırılması da kapanır; BULGU-1 ve BULGU-2 aynı PR'da karara bağlanır.

### Seçenek B — `src/lib/rag.ts` kaldırılır, çağıranlar `src/lib/ai/rag.ts`'e taşınır

**Dokunulacak dosyalar: 6 kaynak + 4 test = ~10** (`cordis-sync.ts`, `cordis-delta.ts`, `admin/cordis/actions.ts`, `concept-notes/actions.ts` + `rag.test.ts`, `cordis-rag.test.ts`, `rag-ingest-silent-failure.test.ts`).

**Risk: YÜKSEK.** Sayı benzer ama iş çok daha büyük: `formatRagPrompt`, `buildRagPrompt`, `splitText`, `getEmbedding` ve `withTenant` sarmalaması **taşınmak zorunda** — yani `ai/rag.ts` neredeyse `rag.ts` olur. Üstelik **kalan dosya, yok edilmesi gereken dizinde durur**: `src/lib/ai/` yaşamaya devam eder ve kural 5'in yasakladığı desen ödüllendirilmiş olur. Ayrıca `rag.ts` RLS sarmalamasını commit `1735389`'de ("wrap embedText, ingestDocument, and retrieveChunks in withTenant") özellikle kazandı — o kazanım bu yönde geri alınır.

**Önerilmez.**

### Seçenek C — ikisi de silinir, `src/lib/rag/` modülü olarak yeniden yazılır (`chunking.ts` / `embedding.ts` / `store.ts` / `search.ts` / `index.ts`)

**Dokunulacak dosyalar: 6 kaynak + 5 test + barrel = ~12+**, ama diff hacmi A'nın birkaç katı.

**Risk: ORTA-YÜKSEK.** En temiz son hâl (BULGU-1..4'ün hepsi tek yerde kararlaştırılır, chunker tek). Ama iki ingest stratejisi (transaction vs discard+alert) hâlâ ayrı kalmak zorunda, yani C'nin A'ya kattığı asıl fayda dosya düzeni — davranış değil. Bu turda P0 kapı işi devam ederken bu büyüklükte bir diff **regresyon yüzeyi** açar.

### Öneri

**Seçenek A**, iki adımda:
1. **A1 (mekanik, düşük risk):** `ai/rag.ts` → `rag.ts` taşıma + import yolları + `src/lib/ai/` dizininin kaldırılması. **Davranış değişikliği yok.** `semanticSearch` bu adımda `withTenant`'a alınır (§3.2 kırılması kapanır) — bu tek davranış değişikliği ve bugün BYPASSRLS altında gözlenebilir bir etkisi yok, yarın gizli veri kaybını önlüyor.
2. **A2 (karar gerektiren, ayrı kart):** BULGU-1 (uydurma fallback — silinmesi öneriliyor), BULGU-2 (mockEmbedding ingest'te kalsın mı), BULGU-3 (tek chunk boyutu). Bunlar **patronun kararı**, kod taşıma değil.

BULGU-1 A2'yi beklemek zorunda değil — bağımsız ve en yüksek önem dereceli bulgu; istenirse kendi kartı olarak önce kapatılabilir.

---

## 7. Kanıt (komut çıktıları)

```
$ ls -la src/lib/ai/
total 16
drwxr-xr-x@  3 macbook  staff    96 Sep  8 20:34 .
drwxr-xr-x@ 62 macbook  staff  1984 Sep  9 17:07 ..
-rw-r--r--@  1 macbook  staff  7654 Sep  8 23:21 rag.ts

$ wc -l src/lib/rag.ts src/lib/ai/rag.ts
     280 src/lib/rag.ts
     204 src/lib/ai/rag.ts

$ grep -rn "\bsemanticSearch(" --include=*.ts src/ | grep -v src/lib/ai/rag.ts
src/modules/m2/server/actions.ts:103:    const ragResults = await semanticSearch(searchQuery, tenantId, 3, { userId });

$ grep -rn "\bprocessPdfAndStore(" --include=*.ts src/ | grep -v src/lib/ai/rag.ts
src/app/api/admin/documents/upload/route.ts:31:    const { doc, storedChunks } = await processPdfAndStore(buffer, null, kind, title, undefined, {

$ grep -rn "\bingestDocument(" --include=*.ts src/ | grep -v src/lib/rag.ts
src/lib/cordis-delta.ts:298:      await ingestDocument(
src/lib/cordis-sync.ts:368:      await ingestDocument(

$ grep -rn 'document\.create\|INSERT INTO "Chunk"' --include=*.ts src/
src/lib/rag.ts:143:    const doc = await tx.document.create({
src/lib/rag.ts:159:        `INSERT INTO "Chunk" (id, "documentId", "tenantId", ordinal, text, embedding)
src/lib/ai/rag.ts:90:  const doc = await prisma.document.create({
src/lib/ai/rag.ts:118:        INSERT INTO "Chunk" ("id", "documentId", "tenantId", "ordinal", "text", "embedding")

$ git show --name-status --oneline b6f1642 | grep 'src/lib/ai'
D	src/lib/ai/llm.ts

$ pnpm typecheck
[WARN] The "pnpm" field in package.json is no longer read by pnpm. ...
$ tsc --noEmit
        (hata yok — temiz)
```

---

## 8. Değişen dosyalar

Yalnız bu rapor: `docs/agent-results/TASK-MTU6KE36HAFJR-blok-zincir-denet-i.md` (yeni).
**Hiçbir kaynak dosya değiştirilmedi, silinmedi; commit atılmadı.** Kart salt-okunurdu.

## 9. Riskler

- §3.3'teki "hiç kiracıya-özel Chunk yok" ölçümü **koda dayanıyor, veritabanı sayımına değil** — çakışma kuralı DB'ye dokunmayı yasakladığı için `SELECT count(*) FROM "Chunk" WHERE "tenantId" IS NOT NULL` koşulamadı. Seed veya elle yazılmış satırlar bu tabloyu değiştirebilir; birleştirme kartında bu sayım **koşulmalı**.
- BULGU-1'in "hiçbir testi kırmaz" iddiası, stub okumasından (`tests/helpers/cordis-prisma-stub.ts:188-190`) türetildi; `pnpm test` **koşulmadı** (çakışma kuralı). Birleştirme kartı bunu gerçek koşuyla doğrulamalı.
- §3.2'nin "yarın kırılır" senaryosu, ana bağlantının `fabrika_app`'e çevrilmesine bağlı; o iş `prisma/rls-app-role.sql`'de "ayrı, sonraki bir iş" olarak duruyor. Tarih belirsiz — ama TASK-MTU6I3V2R30M8'de bulunan ~98 sarmalayıcısız çağrıyla aynı anda patlar.

## 10. Açık sorular (patron kararı)

1. Seçenek A onaylanıyor mu? A1 (mekanik taşıma) ile A2 (davranış kararları) ayrı kartlar olsun mu?
2. BULGU-1 (uydurma CORDIS fallback'i) — silinsin mi, yoksa yalnız `NODE_ENV !== 'production'` altına mı alınsın? (Öneri: **silinsin**; kural 7 ortamdan bağımsız.)
3. BULGU-2 — `getEmbedding`'in `mockEmbedding` fallback'i ingest yolunda kalsın mı? (Öneri: **arama**da kalsın, **ingest**te fırlatsın — anlamsız vektör kalıcı satır olarak yazılmasın.)
4. BULGU-3 — birleşik chunk boyutu 1500 mü 1000 mü? (Öneri: **1000/200**, `text-embedding-3-large` için daha ince granülerlik ve mevcut PDF korpusuyla uyum; ama bu, CORDIS korpusunun yeniden ingest'ini gerektirir — maliyet kararı.)

## 11. Sonraki adım

Patron kararını verdikten sonra **A1 kartı** açılsın: `src/lib/ai/rag.ts` → `src/lib/rag.ts` taşıma, 5 import yolu, 3 test mock yolu, `semanticSearch` → `withTenant`. Doğrulama: `pnpm typecheck` + `pnpm test` + `Chunk` tenant sayımı + admin PDF upload'un gerçek tıklamayla e2e'si. Kapı temiz olmadan `review`'a alınmasın.

---

**Karar:** Bu tur **yayına uygunluk kararı vermez** (kod değişmedi). Denetim sonucu: **iki dosya birleştirilmelidir, ama gerekçe `llm.ts` ikizindeki gibi maliyet ayrışması DEĞİL** — gerekçe RLS bağlantı ayrışması (§3.2), uydurma veri fallback'i (BULGU-1) ve yarım kalmış dizin temizliğidir (§5).
