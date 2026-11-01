# TASK-MTUH5L8MJ6S8E — RAG kütüphanesindeki iki uydurma-veri geri düşüşü

**Ajan:** blok-zincir-dse · **Commit:** `45580ed` · **Platform:** macOS (darwin 25.6.0, Node/vitest 4.1.11)

## 1. Ne yapıldı

Denetimin iki bulgusu da kapatıldı ve — asıl eksik olan — **her ikisi de regresyon testiyle kilitlendi**.

### BULGU-1 — `retrieveChunks` uydurma CORDIS kayıtları döndürüyordu

Doğrulandı. `src/lib/rag.ts` içindeki `catch` bloğu, DB/sağlayıcı hatasında **ve boş sonuçta** üç sabit kodlanmış
kayıt döndürüyordu (ZERO-EMISSION-EV/€4.500.000, HYDROGEN-CATALYST/€3.200.000, RECYCLED-COMPOSITE/€5.800.000;
skorlar 0.94/0.88/0.81). Zincir denetimin tarif ettiği gibi: `concept-notes/actions.ts` → `buildRagPrompt` →
`retrieveChunks` → hata → sahte kayıtlar → `formatRagPrompt` bunları `[Source 1 | Score: 94.0%]` etiketiyle
prompt'a gömüyor. Bir DB kesintisi, var olmayan projelere dayanan bir concept-note üretiyordu. Admin RAG
test aracı (`handleTestRagQuery`) da aynı üç satırı "korpus çalışıyor" kanıtı olarak gösteriyordu.

**Bu fix, ben çalışırken eşzamanlı olarak TASK-MTU6KE36HAFJR (blok-zincir-denet-i) tarafından `src/lib/rag.ts`'e
indi** — o kart `src/lib/ai/rag.ts`'i bu dosyaya birleştirirken sahte kayıtları kaldırdı. Benim düzenlemem
üzerine yazıldı; kavga etmedim, onların sürümünü esas aldım. Şu an davranış doğru: hata fırlar, boş korpus `[]`
döner, `formatRagPrompt` zaten `[]` durumunda çıplak soruyu geçiriyor.

**Ama o birleştirme HİÇBİR regresyon testi eklemedi** — ölçtüm (aşağıda). Bu kartın asıl teslimi bu boşluk.

### BULGU-2 — `getEmbedding` anlamsız vektör uyduruyordu

Doğrulandı. `OPENAI_API_KEY` yoksa metnin ilk 1536 karakter kodundan bir vektör üretiliyor ve `ingestDocument`
bunu **gerçek `Chunk` tablosuna** yazıyordu; arama sonra onu gerçek bir gömme sanıp kosinüs mesafesiyle
sıralıyordu. Satır "yazılmış" görünüyor, sayılıyor, ama aramadan anlamlı biçimde dönmüyor.

Karar: **fırlatma yönünde** (kardeş yol zaten böyleydi). Bu da eşzamanlı olarak dosyaya indi (22:23'teki
düzenleme benim kart numaramı ve helper dosyamı atıf veriyor). Ara bir aşamada `allowMockFallback` seçeneği
vardı — ingest için kapalı, **arama için açık**. Onu da kapattım gerekçesiyle birlikte: korpus anahtar varken
doldurulmuş, sonra anahtar döndürülmüş/kaldırılmışsa, arama **gerçek** chunk'ları anlamsız bir vektöre göre
sıralar ve `formatRagPrompt` bunları ölçülmemiş bir skorla ("%87,3") kanıt diye modele verir. Aynı sınıf hata,
daha sessiz hâli. Şimdi üretim kodu hiçbir yerde vektör uydurmuyor.

### Testlerin fallback'e bel bağlaması — ölçüldü, sonra açık yoldan beslendi

Kart "önce ölç" dedi; ölçtüm (kanıt §2.1). Süite anahtarsız koşuyor, dolayısıyla `cordis-rag`, `cordis-delta` ve
`rag-ingest-silent-failure` **üretimdeki uydurma fallback'in sırtında** koşuyordu. Sahte vektörü üretim
kodundan çıkarıp `tests/helpers/fake-embedding.ts`'e taşıdım ve bu üç dosyayı `embedText`'i sağlayıcı sınırında
stub'layacak şekilde bağladım — sahtelik artık **adıyla** ve testin içinde. Helper'ın kendi yorumu, onunla
alaka/sıralama iddiası kurulamayacağını söylüyor.

### `fabricated-fallbacks.test.ts` ailesinin bunu neden kaçırdığı — kapatıldı

Ölçtüm: o dosya yalnızca M1/M8/M10 **sayfalarını** okuyordu, `src/lib/` altına hiç bakmıyordu. Artık `src/lib`
ağacını yürüyen bir süpürme var (`libSources()`), ve süpürmenin gerçekten dosya okuduğunu doğrulayan bir
kontrol de ekli (boş tarayıp yeşil geçemesin diye).

## 2. Kanıt

### 2.1 Ölçüm: testler fallback'e bel bağlıyor muydu? (fix'ten ÖNCE)

`env.OPENAI_API_KEY` süitte tanımsız (vitest `.env`'i `process.env`'e taşımıyor):

```
PROBE env.OPENAI_API_KEY = unset
```

Bu yüzden gerçek `embedText` fırlatıyor ve mock fallback devreye giriyordu:

```
$ npx vitest run tests/cordis-rag.test.ts --reporter=verbose
stderr | tests/cordis-rag.test.ts > syncCordisBigData writes to the real CORDIS tables > persists a project...
[getEmbedding] no OPENAI_API_KEY; using the mock embedding: OPENAI_API_KEY not set
... (dosyadaki 10 testin tamamında tekrarlanıyor)
```

### 2.2 Ölçüm: BULGU-1'i hiçbir test kapsamıyordu

Denetimin tespiti doğru. Birleştirme sahte kayıtları kaldırdı ama test eklemedi:

```
$ grep -rn "ZERO-EMISSION-EV\|doc-cordis\|4,500,000\|94.0%" tests src --include="*.ts" | grep -i test
tests/cordis-rag.test.ts:42:    acronym: 'ZERO-EMISSION-EV',            # test fixture'ı, guard değil
tests/rag-ingest-silent-failure.test.ts:65:  acronym: 'ZERO-EMISSION-EV',  # test fixture'ı, guard değil
```

### 2.3 MUTASYON TESTİ — yeşil test kanıt değildir, kusuru geri koydum

**Mutasyon 1 — sahte CORDIS kayıtlarını geri koy:**

```
MUTATION APPLIED: demo CORDIS fallback restored
$ npx vitest run src/lib/rag.test.ts tests/fabricated-fallbacks.test.ts
     × no library serves the invented CORDIS dataset
     × the RAG retrieval path has no fallback catch left to hide a failure
     × propagates a failed Chunk query instead of answering with demo projects
     × reports an empty corpus as empty, not as three CORDIS projects
     × never emits any of the invented rows, whatever the database does
     × sends the bare question through when the corpus matched nothing
     × does not reach the model at all when retrieval fails
 Test Files  2 failed (2)
      Tests  7 failed | 33 passed (40)
```

**Mutasyon 2 — `mockEmbedding` fallback'ini geri koy:**

```
MUTATION APPLIED: mockEmbedding fallback restored
$ npx vitest run src/lib/rag.test.ts tests/rag-ingest-silent-failure.test.ts tests/fabricated-fallbacks.test.ts
     × refuses when no key is configured, instead of inventing one
     × rethrows a provider failure when a key IS configured
     × the RAG retrieval path has no fallback catch left to hide a failure
     × refuses to invent a vector when no key is configured
     × refuses to invent a vector when the provider fails mid-call
     × does not write a chunk when the embedding call fails
     × rethrows a failed usage-log write rather than falling back
     × ingestDocument does not swallow a failed usage-log write
     × retrieveChunks does not fall back to demo chunks on a failed usage-log write
 Test Files  3 failed (3)
      Tests  9 failed | 39 passed (48)
```

Her iki mutasyon sonrası dosya yedekten geri yüklendi; `grep -n mockEmbedding src/lib/rag.ts` → yalnız 125.
satırdaki **yorum** kaldı (kod değil; `fabricated-fallbacks` süpürmesi yorumları zaten soyuyor).

### 2.4 Kapı (koşmama izin verilen kısım)

```
$ npx tsc --noEmit -p tsconfig.json        → TYPECHECK EXIT: 0
$ npx eslint <değişen 7 dosya>             → LINT EXIT: 0   (çıktı yok)

$ npx vitest run          # BASELINE, işe başlarken
 Test Files  137 passed | 2 skipped (139)
      Tests  1634 passed | 8 skipped (1642)

$ npx vitest run          # FINAL
 Test Files  137 passed | 2 skipped (139)
      Tests  1649 passed | 8 skipped (1657)
```

+15 test, 0 başarısız, 0 regresyon.

`AiUsageLogWriteError`'ın hâlâ yeniden fırlatıldığı doğrulandı — mutasyon 2 tam olarak o üç testi de kırdı,
yani koruma gerçekten yük taşıyor.

### 2.5 Commit yalıtımda tutarlı mı (paylaşımlı ağaç)

`git worktree` izni reddedildiği için, commit'in tek başına bozuk olmadığını doğrudan doğruladım:

```
$ git show HEAD:src/lib/rag.ts | grep "^import"
import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { embedText, PLATFORM_SCOPE_TENANT_ID, type AiCallAttribution } from '@/lib/llm';
import { recordAlert } from '@/lib/observability/system-alert';

embedText / PLATFORM_SCOPE_TENANT_ID / AiCallAttribution → present at HEAD
errorMessage → present at HEAD ; recordAlert → present at HEAD
```

HEAD'de `src/lib/ai/rag.ts` hâlâ duruyor (silinmesi başka kartın işi, commit'lemedim); yeni `src/lib` süpürmesi
o dosyaya karşı da geçiyor — dokuz uydurma dizgenin tamamı `absent`.

### 2.6 Commit

```
$ git commit -F ... -- <7 yol>
→ eslint (staged files)
→ tsc --noEmit (proje geneli, yalnız staged dosyalar bloke eder)
✓ Kapı temiz (staged kapsamı).
45580ed fix(k6): stop the RAG layer inventing evidence, and lock both fabrications out
```

Geniş `git add -A` kullanılmadı; yalnız 7 yol açıkça verildi (paylaşımlı ağaç kuralı).

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/rag.ts` | İki uydurma yol da yok; `getEmbedding` ince sarmalayıcı, `retrieveChunks` fırlatıyor/`[]` dönüyor. **Ortak yazarlı** — bkz. §5. |
| `tests/helpers/fake-embedding.ts` | **YENİ.** Sahte vektör üretimden buraya taşındı, adıyla; alaka iddiası kurulamayacağı yorumda yazılı. |
| `src/lib/rag.test.ts` | +2 describe: `retrieveChunks` ve `buildRagPrompt` davranış kilitleri; `getEmbedding` artık fırlatıyor. |
| `tests/fabricated-fallbacks.test.ts` | Süpürme `src/lib` ağacını da yürüyor + "gerçekten dosya okuyor mu" kontrolü. |
| `tests/cordis-rag.test.ts` | `embedText` açık sahte ile stub'landı (fallback'e bel bağlamayı bıraktı). |
| `tests/cordis-delta.test.ts` | Aynı. |
| `tests/rag-ingest-silent-failure.test.ts` | Kaldırılan davranışı kilitleyen describe güncellendi (fırlatıyor). |

## 4. Riskler

1. **Anahtarsız ortamda ingest artık mümkün değil.** Kasıtlı ve kardeş yolla tutarlı, ama davranış değişikliği:
   `OPENAI_API_KEY` olmayan bir dev/demo kurulumunda CORDIS RAG korpusu doldurulamaz. Sessizce çöp yazmaktansa
   açıkça reddetmek doğru, fakat bunu bilmeyen biri "sync bozuldu" diye okuyabilir. `syncCordisBigData` bunu
   zaten `skippedCount` + `SystemAlert` olarak yüzeye çıkarıyor.
2. **Retrieval hatası artık concept-note üretimini durduruyor.** Kullanıcı taslak alamaz. Alternatif (bağlamsız
   üretmek) sessiz bir başarısızlık olurdu; gürültülü hatayı seçtim. `retrieveChunks` içine `recordAlert`
   **eklemedim** — kapsam disiplini, ve hata zaten çağırana ulaşıyor. Eklenecekse ayrı kart; eklenirken dikkat:
   geniş bir `catch` bu yan etkiyi sessizce yutar (bu depoda bilinen tuzak).
3. **`src/lib/rag.ts` ortak yazarlı bir commit taşıyor** — §5.

## 5. Açık sorular / koordinasyon

- **`src/lib/rag.ts` çakışması.** Ben üzerinde çalışırken TASK-MTU6KE36HAFJR (blok-zincir-denet-i) aynı dosyaya
  `src/lib/ai/rag.ts` birleştirmesini indirdi ve **benim düzenlemelerimi iki kez üzerine yazdı**. O kart 22:09'da
  DONE bildirildi. Dosyayı commit'ledim çünkü testlerim onsuz HEAD'de kırmızı olurdu; commit mesajında ve burada
  ortak yazarlığı açıkça yazdım. **O kartın kardeş dosyalarını commit'lemedim** ve bunlar hâlâ çalışma ağacında
  bekliyor: `src/lib/ai/rag.ts` (silinmiş, staged), `src/modules/m2/server/actions.ts` + testi,
  `src/app/api/admin/documents/upload/route.ts`, `tests/rag-pdf-ingest-partial.test.ts`,
  `tests/admin-upload-authz.test.ts`, `src/lib/llm.ts`, `src/lib/env.ts`. **Bunları o kartın sahibi commit'lemeli.**
- Ara aşamada bu dosyalar yüzünden süit kırmızıydı (`semanticSearch is not defined`, silinmiş `@/lib/ai/rag`
  import'ları, ingest'in anahtarsız reddi). Hepsi düzeldi; **son ölçümde süit yeşil**. Yine de bunların
  hiçbirini ben yazmadım — kırmızıyı ben çözmedim, kendiliğinden kapandı.
- **`src/lib/` dışında kalan üç uydurma fallback** yol üstünde görüldü, kapsam dışı bırakıldı:
  `marketplace/page.tsx:34`, `tto/page.tsx:31`, `turkiyeye-acik-cagrilar/page.tsx:44` — hepsi
  "Fallback demo … if DB is unseeded/offline". `fabricated-fallbacks` ailesi bunları da kapsamıyor. Ayrı kart.

## 6. Sonraki adım

1. TASK-MTU6KE36HAFJR sahibi kalan kardeş dosyalarını commit'lesin (yukarıdaki liste).
2. `pnpm gate` / `pnpm test:e2e` bu turda blok-zincir-dev'e ayrılmıştı, **koşmadım** — kapı bu commit'i de
   kapsayacak şekilde bir kez koşturulmalı.
3. Üç sayfa fallback'i (§5) için kart açılsın; `fabricated-fallbacks` süpürmesi artık `src/lib`'i görüyor ama
   `src/app` sayfalarını hâlâ tek tek adlandırıyor.

## Platform beyanı

**macOS (darwin 25.6.0)** üzerinde doğrulandı: typecheck, eslint ve tüm vitest süiti (1649 test) burada koşuldu.
Dokunulan kodun **hiçbir platforma bağlı yolu yok** — süreç öldürme, kabuk/ikili adı, dosya yolu ayracı,
ekran/DPI veya cihaz izni kullanılmıyor; değişiklikler saf TypeScript kontrol akışı (fırlat/`[]` döndür) ve test
kurulumu. Tek dosya-sistemi teması, `tests/fabricated-fallbacks.test.ts` içindeki `readdirSync` yürüyüşünün
`` `${dir}/${entry.name}` `` ile POSIX ayracı kurması; bu yollar `path.resolve()`'a besleniyor ve Node Windows'ta
da `/` ayracını kabul ettiği için taşınabilir. **Windows ve Linux'ta koşulamadı** (bu ajan yalnız macOS pane'inde
çalışıyor); koddan beklenti: aynı sonuç.

**KOŞULMADI (kasıtlı, çakışma kuralı):** `pnpm dev`, `pnpm test:e2e`, `pnpm gate` ve veritabanına dokunan hiçbir
komut — bu turda blok-zincir-dev'in P0 kapı işine ayrılmıştı. Canlı DB'ye karşı hiçbir ölçüm yapılmadı; bu
rapordaki her rakam vitest'ten ve stub'lanmış Prisma'dan gelir.
