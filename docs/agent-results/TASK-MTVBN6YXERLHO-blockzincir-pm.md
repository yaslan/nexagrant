# TASK-MTVBN6YXERLHO — Üç karar, tek oturumda bağlanabilir hâlde (KOD SEVKİYATI YOK)

**Ajan:** se-yuyt (CA-EN, Güvenlik Mühendisi) · **Tip:** karar notu · **Tarih:** 2026-09-10
**Platform:** doğrulama **macOS** (darwin 25.6.0, Node v26.5.0, zsh) üzerinde yapıldı.
Bu görevde platforma bağlı kod yolu **yok** — çıktılar `grep`/`git`/Postgres sorgusu; hepsi
Windows ve Linux'ta aynı sonucu verir. Tek platform bağımlılığı `psql`'in bu makinede kurulu
olmaması; ölçüm bunun yerine repodaki `pg` sürücüsüyle Node üzerinden yapıldı (her platformda çalışır).

> **Bu not okunurken:** devralınan iddiaların **üçü de** kısmen ya da tamamen eskimişti.
> K1 ve K3'ün kod tarafı zaten kapanmış; K2'nin dosya sayısı yanlıştı. Aşağıda her sayı
> kendi grep'imle teyit ya da tashih edildi ve komut çıktısı yapıştırıldı.

---

## 0. Devralınan iddiaların tashihi (önce bu)

| Devralınan iddia | Durum | Ölçüm |
|---|---|---|
| `getEmbedding` `src/lib/rag.ts:79-90`'da, `OPENAI_API_KEY` yokken `mockEmbedding`'e düşüyor | **TASHİH — yanlış konum + kapanmış davranış** | `getEmbedding` bugün **satır 134-139**; 79-90 aralığı `chunkText`'in doc yorumu. Fallback `45580ed`'de kaldırıldı. |
| Sahte vektör `Chunk`'a bayraksız yazılıyor, sorguda ayırt edilemiyor | **DOĞRU ve hâlâ geçerli** | `Chunk` şemasında köken alanı yok; dev DB'de 10/10 chunk sentetik (§K1). |
| Prompt'lar "7 dosyada 14 gömülü" | **KISMİ TASHİH** — 14 doğru, **8 dosya** | `src/lib/rag.ts:427` sayılmamış (§K2). |
| `src/lib/ai/rag.ts` kimsenin kaldırmadığı son parça olabilir | **TASHİH — dosya YOK** | `ls src/lib/ai` → `No such file or directory` (§K3). |
| "İki chunk boyutu tek korpus üzerinde, retrieval sessizce bozuluyor" | **DOĞRU, ve bilerek korunmuş** | `CHUNK_SIZE=1500` / `PDF_CHUNK_SIZE=1000`, `src/lib/rag.ts:47-49` (§K3). |

---

## K1 — Sahte gömme vektörü gerçeğinden ayırt edilemiyor

**Problem:** `Chunk` satırının hangi kod yolunun, gerçek mi sahte mi bir vektörle yazdığı hiçbir yerde kayıtlı değil.

### Kanıt

Üretim fallback'i **zaten yok** — `getEmbedding` koşulsuz `embedText`'e gidiyor:

```
$ sed -n '134,139p' src/lib/rag.ts
export async function getEmbedding(
  text: string,
  attribution: AiCallAttribution
): Promise<number[]> {
  return embedText(text, attribution, { dimensions: EMBEDDING_DIMENSIONS });
}
```

Şemada köken alanı **yok** (`createdAt` bile yok):

```
$ awk '/^model Chunk/,/^}/' prisma/schema.prisma
model Chunk {
  id         String @id @default(cuid())
  documentId String
  tenantId   String?
  ordinal    Int
  text       String
  embedding  Unsupported("vector(1536)")?
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@index([documentId])
}
```

**Yanlış detektör uyarısı (önemli):** ilk denemem "norm ≠ 1 olanı sahte say" idi ve **yanlıştı** —
eski `mockEmbedding` çıktıyı kendisi normalize ediyordu, yani sahte vektörün de normu 1:

```
$ git show 45580ed^:src/lib/rag.ts | grep -A9 "function mockEmbedding"
function mockEmbedding(text: string): number[] {
  const vec = new Array(1536).fill(0);
  for (let i = 0; i < text.length && i < 1536; i++) {
    vec[i] = (text.charCodeAt(i) % 100) / 100;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}
```

Geçerli imza şu ikisi: (a) `charCodeAt(i) % 100 / 100` asla negatif üretmez → **hiç negatif
bileşen yok**; gerçek OpenAI `text-embedding-3-*` vektöründe işaretler karışıktır. (b) metin
uzunluğundan sonrası sıfır kalır → **boyutların çoğu tam sıfır**.

**Dev DB ölçümü** (`localhost/fabrika`, repodaki `pg` sürücüsüyle):

```
Document satırı        : 109
Chunk satırı           : 10
Chunk.embedding IS NULL: 0
ÖZET → negatif bileşeni HİÇ olmayan (sahte imzası): 10 / 10
EK BULGU → hiç chunk'ı olmayan Document: 99
```

```
┌─────────┬─────────┬─────────────────┬───────────────┬─────────────────┐
│ (index) │ textlen │ negatif_bilesen │ sifir_bilesen │ karar           │
├─────────┼─────────┼─────────────────┼───────────────┼─────────────────┤
│ 0..6    │ 90      │ 0               │ 0             │ (düzgün-dağılım │
│         │         │                 │               │  ama yine sahte)│
│ 7       │ 90      │ 0               │ 1448          │ 'SAHTE-ŞÜPHELİ' │
│ 8       │ 90      │ 0               │ 1448          │ 'SAHTE-ŞÜPHELİ' │
│ 9       │ 90      │ 0               │ 1448          │ 'SAHTE-ŞÜPHELİ' │
└─────────┴─────────┴─────────────────┴───────────────┴─────────────────┘
```

Kaynağı bulundu — bir **doğrulama script'inin** dev korpusunda bıraktığı satırlar:

```
$ grep -rn "policy document text for testing" . | grep -v node_modules
docs/agent-results/TASK-MTSWVADF7RQ1B-evidence/closing-verification.mts:49:
  'This is policy document text for testing RAG ingestion under NOBYPASSRLS role fabrika_app.'
```

Yani riskin somut hâli teorik değil: bir doğrulama koşusu, dev korpusuna **10 işaretsiz chunk**
bıraktı; bunlar `retrieveChunks` için diğerlerinden ayırt edilemez ve `formatRagPrompt`
(`src/lib/rag.ts:420`) onları `[Source N | Score: %]` etiketiyle modele "kanıt" diye verir.

**ÜRETİM DB'Sİ ÖLÇÜLEMEDİ — "muhtemelen yoktur" demiyorum.** Bu makinede tanımlı tek
`DATABASE_URL` `localhost/fabrika`; `psql` kurulu değil; uzak bir üretim bağlantı dizesi yok.
**Ölçüm reçetesi** (üretim `DATABASE_URL`'ine erişimi olan biri, salt-okunur, tek sorgu):

```sql
-- Sahte-vektör sayımı. Gerçek OpenAI vektöründe bileşenlerin ~yarısı negatiftir;
-- negatifi HİÇ olmayan bir satır provider'dan gelmiş olamaz.
WITH v AS (
  SELECT c.id, c."documentId", length(c.text) AS textlen,
         (SELECT count(*) FROM unnest(c.embedding::real[]) x WHERE x < 0) AS neg,
         (SELECT count(*) FROM unnest(c.embedding::real[]) x WHERE x = 0) AS zero
  FROM "Chunk" c WHERE c.embedding IS NOT NULL
)
SELECT count(*) FILTER (WHERE neg = 0)                          AS sahte_kesin,
       count(*) FILTER (WHERE neg = 0 AND zero > 1000)          AS eski_mockembedding_imzasi,
       count(*)                                                  AS toplam
FROM v;
```

`sahte_kesin > 0` ise üretim korpusunda kullanıcıya kanıt diye dönebilecek uydurma vektör var demektir.

### Seçenekler

- **A — `Chunk`'a köken sütunları ekle.** `embeddingModel` (ör. `text-embedding-3-small`),
  `chunkSize`, `source` (`ingest`|`test`|`backfill`), `createdAt`; migration + RLS + seed +
  `docs/DATA_MODEL.md` aynı PR'da (CLAUDE.md "Kod stili").
  *Artı:* geçmiş satırlar da sınıflandırılabilir; `chunkSize` K3'ün ölçülemezliğini de kapatır; geri dönüşsüz veri kaybı yok.
  *Eksi:* mevcut 10 satır için köken **bilinmiyor** → `NULL`/`unknown` ile başlar, tek başına temizlemez; retrieval'ın bu sütunu filtre olarak kullanması ayrı iş.
- **B — Sahte vektörün saklanmasını tümden yasakla, mevcutları sil.** `ingestDocument` yolunu
  yalnız gerçek provider çağrısıyla çalışır kıl (bugün öyle), testler için ayrı şema/DB zorunlu kıl,
  ve dev korpusundaki sentetik satırları sil.
  *Artı:* şema değişmez, en ucuz; "sahte satır yok" invaryantı tek cümleyle ifade edilir.
  *Eksi:* invaryantı **zorlayan bir şey yok** — bir sonraki doğrulama script'i yine yazar; silme geri alınamaz ve üretimde ölçüm yapılmadan silme yapılamaz.
- **C — A + B birlikte.** Köken sütunları eklenir; `source='test'` yazan satırlar retrieval'da
  filtrelenir; dev korpusundaki 10 satır silinir; üretimde önce yukarıdaki SQL ile ölçülür.
  *Artı:* hem geçmişi sınıflandırır hem geleceği kapatır; invaryant şemayla zorlanır, niyetle değil.
  *Eksi:* en büyük iş; migration + RLS + retrieval filtresi + doküman güncellemesi.

### Öneri

**C.** B tek başına aynı hatayı tekrar üretmeye açık — kanıtı elimizde: fallback kaldırıldıktan
*sonra* bile bir doğrulama script'i dev korpusuna 10 işaretsiz satır yazdı. A tek başına da
yetmez, çünkü sütun eklemek mevcut sahte satırları kullanıcıdan uzak tutmaz. Retrieval filtresi
şart. Not: bu, kullanıcıya gösterilen "kanıt"ı ilgilendirdiği için CLAUDE.md kural 7 kapsamında;
kaynak denetim (`TASK-MTSYCMWFL22CA` §5.1) bunu bağımsız olarak P1 işaretledi.

---

## K2 — Prompt'lar nerede yaşayacak, dili neye bağlanacak

**Problem:** Değerlendirici persona'sında bir kelime değiştirmek bugün kod deploy'u gerektiriyor ve prompt değişikliği prompt değişikliği olarak görünmüyor.

### Kanıt

```
$ find src -iname "*prompt*" -o -iname "*.prompt*"
(çıktı yok — sıfır prompt dosyası)
```

**14 prompt, 8 dosya** (devralınan "7 dosya" tashih edildi; satır numaraları bugünden):

| # | konum | tür |
|---|---|---|
| 1 | `src/modules/m6/server/esr-parser.ts:28` | `ESR_PARSER_PROMPT` (`{{documentText}}` şablonlu) |
| 2 | `src/modules/m6/server/esr-parser.ts:66` | system |
| 3 | `src/modules/m6/server/actions.ts:60` | `AI_EVALUATION_PROMPT` (`{{opportunityId}}` şablonlu) |
| 4 | `src/modules/m6/server/actions.ts:91` | system — *"official European Commission Horizon Europe Proposal Evaluator"* |
| 5 | `src/modules/m7/server/actions.ts:114` | inline user |
| 6 | `src/modules/m7/server/actions.ts:133` | system |
| 7 | `src/modules/m9/server/actions.ts:40` | inline user |
| 8 | `src/modules/m9/server/actions.ts:72` | system |
| 9 | `src/modules/m10/server/actions.ts:63` | inline user |
| 10 | `src/modules/m10/server/actions.ts:98` | system |
| 11 | `src/modules/m2/server/actions.ts:115` | inline user (**bu çağrının system prompt'u yok**) |
| 12 | `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:108` | system (mesaj dizisi içinde) |
| 13 | `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:116` | inline user |
| 14 | `src/lib/rag.ts:427` | `formatRagPrompt` — **modüller arası ortak şablon**, kütüphane fonksiyonu içinde |

**Borcun şekli, sayının ötesinde:** yalnız #1 ve #3 `{{placeholder}}` ile şablonlaşmış, yani
dosyaya taşınmaya bir adım uzakta. Kalan 12'si yerel değişkenleri doğrudan interpolasyon ile
gömüyor (`${maxWords}`, `${kind}`, `${partnerName}`) — dosyaya çıkarmak önce **parametreleştirmeyi**
gerektiriyor. Bu, "prompt'ları .md'ye taşı" işini basit bir kes-yapıştır olmaktan çıkarır.

**i18n aynı kararda çözülmeli** — dil bugün prompt metnine sabit gömülü ve modüller çelişiyor:

```
$ grep -rn "in Turkish\|Always write in" --include="*.ts" src/ | grep -v test
src/modules/m7/server/actions.ts:115:  Include 4 structured checklist categories in Turkish:
src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:107:Always write in English unless specifically requested otherwise.
```

`m10` ise İngilizce prompt'tan Türkçe belge türü ürettiriyor (`TÜBİTAK Eşik Üstü Ödülü`).
**Hiçbiri kiracının/kullanıcının locale'ine bağlı değil** — `[locale]` rota segmentinde duruyor
ama prompt'a ulaşmıyor. UI'da `t()` zorunluyken (kural 8) modelin ürettiği metnin dili sabit.

**Bulgu değil, teyit edildi:** prompt *metni* DB'ye yazılmıyor — `llm.ts` yalnız sha256 saklıyor
(`hashPrompt`, `src/lib/llm.ts:490-492`). Bu karar bir gizlilik kararı değil, bir sürdürülebilirlik/i18n kararı.

### Seçenekler

- **A — Modül yanında: `src/modules/<mX>/prompts/*.md`.**
  *Artı:* CLAUDE.md kural 2'nin modül sınırıyla uyumlu; manifest'in `tables[]`'ı gibi prompt'lar da modülün malı olur; PR'da prompt diff'i ayrı dosyada görünür.
  *Eksi:* #14 (`formatRagPrompt`) hiçbir modüle ait değil — ortak prompt'lar için yine bir yer gerekir; `concept-notes` bir modül değil app rotası.
- **B — Merkezî `prompts/` ağacı + sürüm kaydı.** Tüm prompt'lar tek ağaçta, dosya adında sürüm,
  `AiUsageLog`'a `promptId`+`promptVersion` yazılır.
  *Artı:* "hangi prompt sürümü bu çıktıyı üretti" sorusu cevaplanabilir hâle gelir — evaluator çıktısı için ciddi bir denetlenebilirlik kazancı; ortak prompt'un doğal yeri.
  *Eksi:* modül izolasyonunu (kural 2) zayıflatır; `AiUsageLog` şema değişikliği ister, yani K1'in migration'ıyla yarışır.
- **C — A + `locale` parametresi (dil prompt metninden çıkarılır).** Prompt dosyaları modül yanında,
  ortak olanlar `src/core/prompts/`'ta; dil prompt gövdesinde yazmaz, `renderPrompt(id, { locale, ...vars })` çağrısına parametre olarak geçer.
  *Artı:* iki soruyu (yer + i18n) tek hamlede kapatır; `m7`/`concept-notes` çelişkisi tanım gereği ortadan kalkar; parametreleştirme zaten 12 prompt için şart.
  *Eksi:* en geniş dokunuş (8 dosya + yeni yükleyici); iki dilde prompt bakımı gerektirir — ya iki dosya ya da tek dosya + dil talimatı değişkeni (hangisi olduğu ayrı ve küçük bir karar).

### Öneri

**C**, ama **tek PR'da değil**: önce yükleyici + `formatRagPrompt` (#14) ve iki şablonlaşmış
prompt (#1, #3) taşınır — bu üçü parametreleştirme gerektirmiyor, deseni ucuza kanıtlar.
Kalan 11'i modül modül izler. Gerekçe: B'nin sürüm kaydı cazip ama `AiUsageLog` şema değişikliği
K1'in migration'ıyla aynı sprint'e düşerse ikisi de gecikir; sürüm kaydı C'nin üstüne sonradan eklenebilir,
tersi (merkezî ağacı modüllere dağıtmak) daha pahalı.

---

## K3 — `src/lib/ai/rag.ts` yaşayacak mı

**Problem:** İkinci RAG dosyasının akıbeti belirsiz sanılıyordu; belirsiz değil, ama altındaki ölçülemezlik açık.

### Kanıt

```
$ ls -la src/lib/ai
ls: src/lib/ai: No such file or directory

$ grep -rn "lib/ai" --include="*.ts" --include="*.tsx" src/ | grep -v node_modules
src/lib/rag.ts:10:  * TASK-MTU6KE36HAFJR — this used to be two files. `src/lib/ai/rag.ts` held a
src/lib/llm.ts:5:   * Until TASK-MTSXGXBCJ007W there were two: this file and `src/lib/ai/llm.ts`.
… (tamamı yorum/test açıklaması — tek bir üretim import'u yok)
```

**Soru kapandı: dosya yok, import eden yok.** `src/lib/ai/llm.ts` TASK-MTSXGXBCJ007W'de (aynı
çağrıyı 7 kat farklı fiyatlayan adaptör), `src/lib/ai/rag.ts` ise TASK-MTU6KE36HAFJR'de
`src/lib/rag.ts`'e birleştirildi. Birleşme üç gerçek ayrışmayı çözmüş: DB istemcisi (`withTenant`
sarmalayıcısı vs global istemci — bu, ana bağlantı `fabrika_app`'e taşındığında kiracının kendi
belgelerini **sessizce** düşürecek bir hataydı), hata yolu (uydurma 3 CORDIS projesi), chunk boyutu.

**Kapanmayan kısım — asıl karar burada.** İki chunk boyutu *bilerek* korundu:

```
$ sed -n '47,49p' src/lib/rag.ts
const CHUNK_SIZE = 1500;
/** Characters per chunk for PDF ingest — finer, and what the PDF corpus was written at. */
const PDF_CHUNK_SIZE = 1000;
```

Gerekçe kodda yazılı ve savunulabilir: birini birleştirmek o korpusu yeniden gömmek demek, bu bir
maliyet kararıdır. Ama K1'in eksik dediği şey bunu **ölçülemez** kılıyor: satırda hangi boyutla
yazıldığı kayıtlı olmadığı için "karışık boyutlu korpusta retrieval bozuluyor mu" sorusu bugün
cevaplanamaz — ne doğrulanabilir ne çürütülebilir. Bu yüzden K3, K1'in kapsamını daraltıyor.

### Seçenekler

- **A — Boyut ayrımını olduğu gibi bırak, hiçbir şey yapma.**
  *Artı:* sıfır maliyet; kod zaten tek yerde ve gerekçesi yazılı.
  *Eksi:* "retrieval bozuluyor mu" sorusu süresiz cevapsız kalır; iddia edilen risk ne kanıtlanır ne çürütülür.
- **B — Tek boyuta yakınsa, bir korpusu yeniden göm.** Örneğin PDF korpusunu 1500'e taşı.
  *Artı:* soru tanım gereği ortadan kalkar; retrieval tek rejimde çalışır.
  *Eksi:* gerçek para (yeniden gömme maliyeti) ve ölçülmemiş bir problemi çözmek için harcanır; hangi korpusun ne kadar büyük olduğu bile üretimde ölçülmedi.
- **C — Önce ölç: `chunkSize`'ı K1'in köken sütunlarına ekle, sonra karar ver.**
  *Artı:* K1 zaten migration açıyor; `chunkSize` bir sütun daha, marjinal maliyet ~sıfır; kararı veriyle alırız, sezgiyle değil.
  *Eksi:* karar bir tur daha ertelenir; geçmiş satırlarda boyut geriye dönük **çıkarsanabilir değil** (`length(text)` yaklaşık bir gösterge verir ama örtüşme nedeniyle kesin değil).

### Öneri

**C.** K3'ün asıl sorusu ("dosya yaşayacak mı") kod tarafından zaten cevaplanmış; geriye kalan
gerçek soru ölçüm eksikliği ve o ölçümün doğal yeri K1'in migration'ı. Bu, K1'in kapsamına
somut bir madde ekler: köken sütunları **`chunkSize`'ı da taşımalı**.

---

## Karar zinciri (patrona tek cümlelik özet)

**K3 → K1 → K2.** K3'ün cevabı "dosya zaten yok, ama boyut ölçülemiyor" olduğu için K1'in
migration'ına bir sütun ekler; K1 kararı verilmeden K2'nin `AiUsageLog` sürüm kaydı (K2/B)
değerlendirilemez, çünkü ikisi aynı şema turunu paylaşır. Üçü de tek oturumda bağlanabilir:
**K1=C, K2=C (kademeli), K3=C.**

---

## Onay sonrası açılacak kart taslakları (KART AÇILMADI)

> Bunlar taslaktır; patron onayı gelmeden board'a girilmeyecek.

**Taslak 1 — `Chunk` köken sütunları + sahte vektör filtresi** (K1=C, K3=C birlikte)
Kabul kriteri:
- [ ] `Chunk`'a `embeddingModel`, `chunkSize`, `source` (`ingest|test|backfill`), `createdAt` eklendi; migration + RLS politikası + `docs/DATA_MODEL.md` **aynı PR'da**
- [ ] `retrieveChunks` `source='test'` satırlarını döndürmüyor; bunu kanıtlayan birim test düzeltmeden önce KIRMIZI gösterildi
- [ ] Dev DB'deki 10 sentetik satır silindi; silme sonrası sayım çıktısı raporda
- [ ] Üretim DB'si §K1'deki SQL ile ölçüldü ve sonuç (0 olsa bile) raporda yazılı
- [ ] `pnpm gate` yeşil; platform beyanı var

**Taslak 2 — Prompt yükleyici + üç prompt'un taşınması** (K2=C, 1. faz)
Kabul kriteri:
- [ ] `renderPrompt(id, { locale, ...vars })` yükleyicisi var; prompt dosyaları `.md`
- [ ] #14 (`formatRagPrompt`), #1 (`ESR_PARSER_PROMPT`), #3 (`AI_EVALUATION_PROMPT`) dosyaya taşındı; davranış birebir aynı (mevcut testler dokunulmadan yeşil)
- [ ] Dil prompt gövdesinde geçmiyor; `locale` parametreden geliyor
- [ ] `find src -iname "*prompt*"` artık boş değil; taşınmayan 11 prompt adıyla listelendi
- [ ] `pnpm gate` yeşil; platform beyanı var

**Taslak 3 — Kalan 11 prompt'un parametreleştirilip taşınması** (K2=C, 2. faz — Taslak 2'ye bağımlı)
Kabul kriteri:
- [ ] `m2`, `m7`, `m9`, `m10`, `concept-notes` prompt'ları interpolasyondan parametreye çevrildi ve dosyaya taşındı
- [ ] `m7`/`concept-notes` dil çelişkisi kalktı; her ikisi de `locale`'e uyuyor
- [ ] `m2`'nin system prompt'u olmayan çağrısı için karar verildi (eklendi ya da gerekçesi yazıldı)
- [ ] `find src -iname "*prompt*"` 14/14 kapsıyor; `pnpm gate` yeşil; platform beyanı var

---

## Ne yapıldı

1. Devralınan beş iddianın tamamı kendi grep'imle teyit/tashih edildi (§0) — üçü eskimişti.
2. Dev DB'de sahte vektör **ölçüldü** (10/10 sentetik, 3'ü eski `mockEmbedding` imzalı) ve kaynağı bulundu.
3. Üretim ölçümü yapılamadığı **söylendi** ve yerine çalıştırılabilir SQL reçetesi yazıldı.
4. Yanlış bir detektör (norm testi) kendi kanıtımla çürütüldü ve nedeni yazıldı.
5. Üç karar `docs/ROADMAP.md` "Açık kararlar"a **18, 19, 20** numaralı maddeler olarak eklendi.
6. Onay sonrası üç kart taslağı (başlık + kabul kriteri) hazırlandı — **kart açılmadı**.

## Kanıt

Tüm komut çıktıları yukarıda ilgili bölümlerde yapıştırıldı. `git diff --stat`:

```
 docs/ROADMAP.md | 6 ++++++
 1 file changed, 6 insertions(+)
```

## Değişen dosyalar

- `docs/ROADMAP.md` — "Açık kararlar" bölümüne 18/19/20 maddeleri (yalnız ekleme, 6 satır)
- `docs/agent-results/TASK-MTVBN6YXERLHO-blockzincir-pm.md` — bu dosya
- **Kod tabanına dokunulmadı** — `git show --name-only` çıktısı aşağıda (§Riskler sonrası commit bölümünde)

## Riskler

- **Dev DB ölçümü üretimi temsil etmiyor.** 10 chunk küçük bir örneklem ve tamamı bir doğrulama
  script'inden geliyor; üretimde korpus büyüklüğü ve karışımı bambaşka olabilir. §K1'deki SQL
  çalıştırılmadan K1 kararının *aciliyeti* bilinmiyor (yönü biliniyor).
- **99 `Document` satırının hiç `Chunk`'ı yok.** Bu notun konusu değil ama ölçüm sırasında çıktı:
  belgeler var, gömülmemişler. Ayrı bir kart konusu olabilir; burada karar önerilmiyor.
- **Geçmiş satırlarda chunk boyutu geriye dönük çıkarsanamaz** (K3/C'nin eksisi) — `chunkSize`
  sütunu yalnız bundan sonrasını kayda geçirir.

## Açık sorular

1. Üretim `DATABASE_URL`'ine kim erişebiliyor? §K1'deki SQL'i çalıştıracak kişi/rol belirlenmeli.
2. K2/C'de iki dil için **iki dosya mı, tek dosya + dil talimatı değişkeni mi**? Küçük ama
   yükleyicinin şeklini belirleyen bir alt karar.
3. `AiUsageLog`'a prompt sürümü yazmak (K2/B'nin cazip yanı) K1'in migration'ıyla aynı tura mı
   girsin, sonraki tura mı?

## Sonraki adım

Patron onayı bekleniyor: **K1=C, K2=C (kademeli), K3=C**. Onay gelirse yukarıdaki üç taslak
board'a kart olarak açılır (Taslak 3, Taslak 2'ye bağımlı).

## Definition of Done

- [x] Devralınan her sayı kendi grep'imle teyit ya da tashih edildi, komut çıktısı yapıştırıldı
- [x] K1 için sahte vektör **ölçüldü** (dev); üretim ölçülemedi ve **nasıl ölçüleceği SQL olarak yazıldı** — "muhtemelen yoktur" denmedi
- [x] Üç karar `docs/ROADMAP.md` "Açık kararlar"a madde olarak eklendi; `git diff` gösterildi
- [x] Her karar 1-3-1 formatında: tek cümlelik problem + tam üç seçenek (artı/eksi) + tek öneri
- [x] Onay sonrası kart taslakları (başlık + kabul kriteri) hazır, **kart AÇILMADI**
- [x] Kod tabanına dokunulmadığı `git show --name-only` ile kanıtlandı
- [x] Sır/kişisel veri maskelendi — `DATABASE_URL` değeri hiçbir yerde yazılmadı, yalnız host sınıfı (`localhost`) belirtildi
- [x] Platform beyanı yapıldı (macOS; platforma bağlı kod yolu yok, gerekçesi yazılı)
