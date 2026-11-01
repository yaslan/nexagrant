# TASK-MTSWVADF7RQ1B — RAG yolu `AiUsageLog` yazmıyor

**Ajan:** blok-zincir-dse (DSE) · **Sprint:** SPRINT-S12 · **Dal:** `dev` · **Tip:** bug / mimari ihlal + uyum

---

## 0. Bulgu bayat mı? — hayır, ölçüldü

Karttaki iddiayı bugünkü koda karşı yeniden ölçtüm; **geçerliydi**:

```
$ for f in src/lib/ai/rag.ts src/lib/rag.ts src/core/k6-ai/llm.ts; do ... done
== src/lib/ai/rag.ts : aiUsageLog=0 lines=101
== src/lib/rag.ts    : aiUsageLog=0 lines=212
== src/core/k6-ai/llm.ts : MISSING
```

İki ek ölçüm:

- **Canlı tabloda hiç kayıt yoktu.** Çalışmaya başlarken `AiUsageLog` **0 satır** içeriyordu — 21 `Document` satırı varken. Yani gömülü hâle getirilmiş 21 belge için sıfır işleme kaydı.
- **CLAUDE.md kural 5'in gösterdiği dosya yok.** Kural `src/core/k6-ai/llm.ts` diyor; o yol mevcut değil. Gerçek tıkaçlar `src/lib/llm.ts` ve `src/lib/ai/llm.ts` (bkz. §5).

---

## 1. Ne yapıldı

**Yeni bir LLM katmanı yazılmadı.** Var olan adaptöre (`src/lib/llm.ts` — `generateWithAI`'ın kullandığı tıkacın aynısı) tek bir gömme (embedding) girişi eklendi ve iki RAG dosyası da oradan geçirildi.

### 1.1 Tıkaç: `embedText` (`src/lib/llm.ts`)
Sağlayıcıya ulaşan **her** gömme çağrısı için bir `AiUsageLog` satırı yazar: `tenantId`, `userId`, `module`, `purpose`, `provider`, `model`, `promptHash`, `inputTokens`, `outputTokens`, `credits`. **Ham metin yazılmaz** — yalnız `promptHash` (sha256, 16 hane; `generateWithAI` ile aynı biçim).

Üç tasarım kararı, gerekçesiyle:

| Karar | Gerekçe |
|---|---|
| `credits: 0`, `CreditLedger` satırı yok | `docs/BILLING.md` §"Kredi maliyeti" M1/M2/M3/M6/M9/M10/M11 eylemlerini fiyatlar, **embedding'den hiç söz etmez**. CLAUDE.md kural 7 uydurma rakamı yasaklıyor. Gerçek token sayısı kaydedildiği için katsayı sonradan geriye dönük uygulanabilir. → **Açık soru A1** |
| `tenantId: null` → `PLATFORM_SCOPE_TENANT_ID = '__platform__'` | `AiUsageLog.tenantId` **NOT NULL** ve bu kartta `prisma/schema.prisma`'ya dokunmak yasak. Alternatif, kiracısız çağrıyı hiç kaydetmemekti — yani kapatılan deliğin ta kendisi. Bu bir **beyan edilmiş kapsam**, bulunamayan bir kiracının yerine konmuş dolgu değil: `Document.tenantId IS NULL` zaten "paylaşılan kamusal" demek. Gerçek id'lerle çakışamaz (cuid ya da `demo-tenant` gibi slug'lar; alt-çizgi sarmalı kullanılmıyor), hiçbir `Tenant` satırıyla eşleşmediği için RLS altında her kiracıya görünmez ve karşılığında asla `CreditLedger` satırı yazılmaz. → **Açık soru A2** |
| `AiUsageLogWriteError` ayrı bir hata sınıfı | Kayıt yazımı başarısız olduğunda metin **zaten OpenAI'a gitmiştir**. `getEmbedding`/`ingestDocument`/`retrieveChunks` bu hatayı yutmaz, yukarı fırlatır — yoksa delik sessizce geri gelirdi. |

### 1.2 Bağlanan yollar
- `src/lib/ai/rag.ts` — kendi OpenAI SDK istemcisi (`process.env.OPENAI_API_KEY \|\| 'sk-mock-key-for-testing'`) kaldırıldı; `processPdfAndStore` ve `semanticSearch` `embedText`'ten geçiyor.
- `src/lib/rag.ts` — `getEmbedding` doğrudan `fetch` yerine `embedText` çağırıyor; imzası artık **zorunlu** `attribution` alıyor, böylece hiçbir çağıran kime ait olduğunu söylemeden sağlayıcıya ulaşamaz. Anahtarsız dev/demo ortamı için mock geri düşüşü **korundu** (hiçbir şey gönderilmediği durum), ama kayıt hatası geri düşüşe dâhil değil.
- Kiracı ataması zincir boyunca geçirildi: `m2` (`{ userId }` oturumdan), `concept-notes` (`{ userId }`), `admin/cordis` + `cordis-sync` + `cordis-delta` (paylaşılan korpus → platform kapsamı, yorumla belirtildi), yükleme rotası (oturum varsa `userId`).
- `process.env` doğrudan okumaları `src/lib/env.ts`'e taşındı: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` şemaya eklendi; `src/lib/llm.ts`, `src/lib/ai/llm.ts`, `src/lib/rag.ts`, `src/lib/ai/rag.ts` artık `env`'den okuyor.

---

## 2. Kanıt

### 2.1 Uçtan uca: gerçek PDF → gerçek rota → gerçek Postgres satırı

Gerçek `POST` handler'ı, gerçek bir PDF ve **gerçek yerel Postgres** ile sürüldü. Sadece OpenAI HTTPS çağrısı taklit edildi (bu ortamda `OPENAI_API_KEY` yok) — **dolayısıyla aşağıdaki satırdaki 251 token taklitten gelir, ölçülmüş OpenAI kullanımı değildir.** PDF ayrıştırma, parçalama, `AiUsageLog` insert'i ve `Chunk` insert'i canlı yoldur.

```
AiUsageLog rows BEFORE: 0
route status: 200 {"success":true,"docId":"cmtsx8pbi00004lxksl1wm2ng"}
stubbed OpenAI embedding calls: 1
AiUsageLog rows AFTER: 1  (delta 1)
--- newest AiUsageLog rows (read back from Postgres) ---
{"id":"cmtsx8pbo00014lxkjee12szj","tenantId":"__platform__","userId":null,"module":"K6",
 "purpose":"rag_ingest_embedding","provider":"openai","model":"text-embedding-3-large",
 "promptHash":"ce2f2b08717e7451","inputTokens":251,"outputTokens":0,"credits":0,
 "proposalId":null,"section":null,"createdAt":"2026-09-08T17:06:24.180Z"}
rows containing the document text or the identifier in it: 0
```

Kiracı kapsamlı yarısı (`ingestDocument` → `demo-tenant`, gerçek DB):

```
ingested docId: cmtsxagy00000r0xkf6r3hcwa | stubbed embedding calls: 1
{"id":"cmtsxagyy0001r0xkv4ankrpq","tenantId":"demo-tenant","userId":"probe-user-1","module":"K6",
 "purpose":"rag_ingest_embedding","provider":"openai","model":"text-embedding-3-large",
 "promptHash":"7a1bc864468451cf","inputTokens":99,"outputTokens":0,"credits":0,
 "proposalId":null,"section":null,"createdAt":"2026-09-08T17:07:46.666Z"}
```

### 2.2 Çürütme sondası (mutasyon) — ÖNCE KIRMIZI

`embedText` içindeki `prisma.aiUsageLog.create` bloğu silindi:

```
===== TESTS WITH THE LOG WRITE REMOVED =====
 FAIL  src/lib/llm.embed.test.ts > writes exactly one usage row for one embedding call
 FAIL  src/lib/llm.embed.test.ts > records tenant, user, module, purpose, provider, model and token count
 FAIL  src/lib/llm.embed.test.ts > records the prompt hash and never the text that was embedded
 FAIL  src/lib/llm.embed.test.ts > books a call with no tenant against the declared platform scope
 FAIL  src/lib/llm.embed.test.ts > charges 0 credits, because no embedding coefficient is priced yet
 FAIL  src/lib/llm.embed.test.ts > surfaces a failed log write instead of returning a silently unlogged vector
 Test Files  1 failed | 1 passed (2)
      Tests  6 failed | 10 passed (16)

===== E2E WITH THE LOG WRITE REMOVED =====
AiUsageLog rows BEFORE: 1
route status: 200 {"success":true,"docId":"cmtsx94r600007lxkga1tomp1"}
stubbed OpenAI embedding calls: 1
AiUsageLog rows AFTER: 1  (delta 0)     ← özgün kusur birebir yeniden üretildi:
                                          gerçek bir gömme çağrısı, sıfır kayıt
```

### 2.3 Çürütme sondası — SONRA YEŞİL

```
MUTATION REVERTED
file restored
===== TESTS WITH THE LOG WRITE BACK =====
 Test Files  2 passed (2)
      Tests  16 passed (16)
===== E2E WITH THE LOG WRITE BACK =====
AiUsageLog rows BEFORE: 1
route status: 200 {"success":true,"docId":"cmtsx9g4v0000a7xklofe6xq7"}
stubbed OpenAI embedding calls: 1
AiUsageLog rows AFTER: 2  (delta 1)
rows containing the document text or the identifier in it: 0
```

### 2.4 Ham metin sızmıyor

İki katmanda iddia edildi ve ölçüldü:

- **Birim test** (`src/lib/llm.embed.test.ts`): gömülen metin `'Hasta raporu: Ayşe Yılmaz, TCKN 12345678901, …'`; yazılan satır JSON'a çevrilip metnin tamamı, `Ayşe Yılmaz` ve `12345678901` aranıyor — üçü de yok. `promptHash` bağımsız hesaplanan sha256 ile birebir eşleşiyor.
- **Canlı DB** (§2.1): sonda PDF'i `FABRIKA E2E PROBE Ayse Yilmaz TCKN 12345678901 …` metnini taşıyor; Postgres'ten geri okunan satırlarda bu metni ya da kimlik numarasını içeren **0 satır**.

### 2.5 Kapı

```
$ npx tsc --noEmit         → TYPECHECK exit=0     (taban: 0)
$ npx eslint               → LINT exit=0          (taban: 0)
$ npx vitest run
  Test Files  1 failed | 117 passed | 2 skipped (120)
       Tests  4 failed | 1345 passed | 8 skipped (1357)
```

**Taban 1315 geçen / 5 düşen → şimdi 1345 geçen / 4 düşen.** Geçen sayısı düşmedi, arttı (+16'sı bu kartın yeni testleri). Kalan 4 düşen testin **tamamı** `src/lib/iyzico.test.ts` içinde ve **tabanda da düşüyordu** — `src/lib/iyzico.ts` DOKUNMA listesinde ve TASK-MTSWL8ADKZKDM'de başka bir geliştiricinin çalışma ağacında açık. Bu kartın hiçbir dosyası faturalamaya dokunmuyor.

### 2.6 Sonda verisi temizlendi

Sonda satırlarının token sayıları **taklitten** geliyordu; bırakılsalar bir sonraki koşuda "ölçülmüş kullanım" diye geri okunurlardı. Yalnız bu oturumun ürettiği satırlar silindi:

```
probe documents found: 4 ["TASK-MTSWVADF7RQ1B e2e probe" ×3, "TASK-MTSWVADF7RQ1B tenant probe"]
deleted chunks=4 documents=4 aiUsageLog=3
AiUsageLog rows remaining: 0        ← başlangıçtaki durum
```

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/llm.ts` | **+** `embedText` tıkacı, `PLATFORM_SCOPE_TENANT_ID`, `AiCallAttribution`, `AiUsageLogWriteError`, `hashPrompt`; `process.env` → `env` |
| `src/lib/rag.ts` | `getEmbedding` artık `embedText`'ten geçiyor + zorunlu `attribution`; `ingestDocument`/`retrieveChunks`/`buildRagPrompt` atıf taşıyor; kayıt hatası yutulmuyor |
| `src/lib/ai/rag.ts` | OpenAI SDK istemcisi kaldırıldı; `processPdfAndStore`/`semanticSearch` tıkaçtan geçiyor; gömme boyutu 3072 → 1536 (§4) |
| `src/lib/ai/llm.ts` | `process.env.ANTHROPIC_API_KEY` → `env.ANTHROPIC_API_KEY` |
| `src/lib/env.ts` | **+** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| `src/app/api/admin/documents/upload/route.ts` | Atıf için oturum okunuyor (en-iyi-çaba, yükleme kırılmaz); bilinen yetki boşluğu adıyla yorumlandı |
| `src/modules/m2/server/actions.ts` | `semanticSearch(..., { userId })` |
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | `buildRagPrompt(..., { userId })` |
| `src/app/[locale]/admin/cordis/actions.ts`, `src/lib/cordis-sync.ts`, `src/lib/cordis-delta.ts` | Platform kapsamı olduğu yorumla belirtildi (davranış değişmedi) |
| `src/lib/llm.embed.test.ts` | **YENİ** — 9 test, tıkacı kapalı tutar |
| `src/lib/rag.test.ts` | **YENİ** — 7 test, geri düşüşün kayıtsız çağrıyı gizlemesini engeller |

---

## 4. Riskler

1. **Gömme boyutu 3072 → 1536 (kasıtlı, yolun üstündeydi).** `src/lib/ai/rag.ts` `text-embedding-3-large`'ı boyut belirtmeden çağırıyordu → 3072 float; `Chunk.embedding` sütunu `vector(1536)`. Yani o yolda **başarılı bir OpenAI yanıtı hiçbir zaman insert edilemezdi**. Tıkaç sütunla uyumlu 1536 istiyor. Bunu ayrı bir kusur olarak bırakmadım çünkü tek tıkaçtan geçirmek boyutu zaten tekilleştiriyordu; bilerek ve adıyla kaydediyorum.
2. **Kayıt hacmi.** Parça başına bir satır. 100 sayfalık bir PDF yüzlerce `AiUsageLog` satırı üretir. Doğru olan bu (her işleme faaliyeti bir kayıt), ama toplu (batch) gömme + tek satır isteniyorsa ayrı bir karar.
3. **`credits: 0`** — embedding kullanımı şu an hiçbir kiracıdan kredi düşmüyor. Bilinçli (§1.1, A1); fiyatlandırma kararı verilene kadar gelir kaybı sayılabilir.
4. **`'__platform__'`** şeması değiştirilemediği için var. Kiracıya görünmez ve `Tenant` FK'sı yok, ama yine de gerçek olmayan bir id (A2).
5. **`src/lib/env.ts` çakışması.** Dosya benden önce de değişikti (başka geliştiricinin `INVOICE_VAT_RATE` hunk'ı). Commit'e **yalnız kendi hunk'ım** alındı; onların değişikliği çalışma ağacında dokunulmadan bırakıldı.

---

## 5. Açık sorular / lidere karar

- **A1 — Embedding kredi katsayısı.** `docs/BILLING.md` embedding'i fiyatlamıyor. `credits: 0` yazıldı, uydurma katsayı yazılmadı. Katsayı belirlenirse token sayıları kayıtlı olduğu için geriye dönük uygulanabilir. Karar + BILLING.md güncellemesi gerekiyor.
- **A2 — `AiUsageLog.tenantId` nullable olmalı.** Doğru düzeltme `tenantId String?`; bu kart `prisma/schema.prisma`'ya dokunamıyordu (TASK-MTSWL8ADKZKDM ile çakışma yasağı). Şema sahibi bir kartta yapılmalı; sonrasında `PLATFORM_SCOPE_TENANT_ID` kaldırılıp `null` yazılabilir.
- **A3 — İki LLM adaptörü (kartın 5. maddesi: ölç, öner, BU KARTTA BİRLEŞTİRME).** Ölçüm:

  | | `src/lib/ai/llm.ts` (`generateText`) | `src/lib/llm.ts` (`generateWithAI`) |
  |---|---|---|
  | Çağıran sayısı | **6** (m2, m6, m6/esr-parser, m7, m9, m10) | **3** (concept-notes + bu kartın iki RAG dosyası) |
  | Kredi formülü | `max(1, ceil(toplam/10000))` | `ceil(giriş/1000)×1 + ceil(çıkış/1000)×3` |
  | Varsayılan model | `claude-3-5-sonnet-20240620` | `claude-sonnet-4-20250514` |
  | `promptHash` | sha256, **64 hane** | sha256, **16 hane** |

  **Bu bir kozmetik ikilik değil, faturalama sapması:** 4000 giriş / 1000 çıkış tokenlık aynı çağrı `ai/llm.ts`'te **1**, `llm.ts`'te **7** kredi düşürür — **7 kat**. Ayrıca aynı istem iki adaptörde farklı uzunlukta hash'lendiği için bir denetim iki kaydı ilişkilendiremez.
  **Öneri: ayrı kart.** Bu kartta yapılmadı, çünkü (a) 6 çağıranın göçü + (b) hangi kredi formülünün doğru olduğu bir **BILLING.md kararı**, mühendislik kararı değil. İkisini bu kartın kapsamına almak, kapatılan uyum deliğini fiyatlandırma tartışmasına rehin verirdi.
- **A4 — Yükleme rotasında yetki yok (DÜZELTİLMEDİ, kart kuralı gereği rapor edildi).** `src/app/api/admin/documents/upload/route.ts` hâlâ `platform_admin` kontrolü içermiyor ("Basic auth check would go here" yorumu bugün de duruyor) — rotaya erişebilen herkes paylaşılan korpusa belge gömdürebilir, artık kayıtla birlikte. Kodda `KNOWN GAP` olarak adıyla işaretlendi. **Güvenlik kartı açılmalı.**

---

## 6. Sonraki adım

1. **A4** için güvenlik kartı (yükleme rotasına `platform_admin` kapısı) — en yüksek öncelikli takip.
2. **A3** için birleştirme kartı; önce kredi formülü kararı (BILLING.md), sonra 6 çağıranın göçü.
3. **A2** şema kartı (`AiUsageLog.tenantId String?`) — TASK-MTSWL8ADKZKDM kapandıktan sonra.
4. **A1** embedding fiyatlandırma kararı.
5. CLAUDE.md kural 5'teki `src/core/k6-ai/llm.ts` yolu gerçekle uyuşmuyor (dosya yok) — kuralı gerçek tıkacı gösterecek şekilde güncelleyin ya da dosyayı oraya taşıyın. A3 ile birlikte yapılması doğal.
