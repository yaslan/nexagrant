# İNCELEME-52 (Sprint FB-GAP-1) — be-fb

İncelenen: **TASK-MULQL8QB679LQ** (cs-fb), `25282b80` (kod) + `9efb584d` (rapor), İNCELEME-45 B-1/B-2 düzeltmesi. `25282b80..dev` arasında bu dosyalara dokunan başka commit yok.
Kod değiştirilmedi. İnceleme temiz bir worktree'de yapıldı: `git worktree add --detach … dev` (HEAD `1ff82bed`), `pnpm install --frozen-lockfile`, `prisma generate`. DB olarak izole `befb_i52` kullanıldı. Paylaşılan `fabrika` DB'sine yazılmadı.

## 1) Karar: **DÜZELTME GEREKLİ** (B-1 kısmen kapandı, B-2 kapandı)

| İNCELEME-45 bulgusu | Durum |
|---|---|
| B-1a: maliyet ve parça sayısında sınır yok | **Kapandı.** Hiçbir senaryoda gömme çağrısı yapılmadı ve `Document` yaratılmadı. |
| B-1b: ayrıştırma süresince web süreci yanıt vermiyor | **Kapanmadı.** Yeni bulgu **B-1'** aşağıda. |
| B-2: taranmış PDF'te `no_text` tetiklenmiyor | **Kapandı.** Tarama, damgalı tarama ve 15 MB metinsiz PDF `422 no_text` döndü, gömme 0. |
| Ö-1: M7, M9, M10 hayatta | **Kapandı.** cs-fb testleri ekledi, mutantlar kırmızı. |

### Bulgular

**B-1' (DÜZELTME): Sayfa sınırı ve 20 sayfalık dilimleme, tek bir sayfanın içindeki işi bölmüyor. Sıkıştırılmış içerik akışlı 37 KB'lık bir PDF, web sürecini 20 saniye boyunca tamamen yanıtsız bırakıyor.**
- **Nasıl oluyor:** `extractPdfText` sayfa sayısını baştan okuyor. Uzunluk kontrolünü ise yalnız bir dilim (20 sayfa) bittikten sonra yapıyor.
- **Açık:** tek bir sayfanın `/FlateDecode` içerik akışı çok yüksek oranda sıkışır. Örneğin 100 000 kez tekrar eden `1 0 0 1 40 400 Tm (…) Tj` satırı birkaç KB'a iner. pdf.js bu sayfanın metnini ana thread'de, araya olay döngüsü turu koymadan çıkarıyor.
- **Sonuç:** sayfa sayısı 1 ya da 20 olduğu için `maxPages` sınırı devreye girmiyor. Metin, `maxChunks` kontrolüne ancak sayfa ya da dilim tamamen çıkarıldıktan sonra ulaşıyor.
- Canlı HTTP ölçümü (§2.2): `inplace-20pages-100k` (36 898 B) için `413 too_many_chunks` **20,2 sn** sonra geldi. Bu sürede 336 pingden **1**'i yanıtlandı, en yavaşı 20 132 ms. `inplace-1page-500k` (167 KB): 5,6 sn, 92 pingden 2'si yanıtlandı.
- Süreç içi ölçüm (§2.1): 1 sayfa × 500k satırda 11,9 sn ve +431 MB RSS; 20 sayfa × 100k satırda 21,3 sn ve +524 MB. Bu ikisinde olay döngüsü hiç dönmedi (`ticks 0`). Süre içerikle doğrusal büyüyor: 100k satır 2,2 sn, 500k satır 11,9 sn.
- **Tahmin (koşulmadı):** 20 MB dosya sınırı içinde bu şekil yüzlerce kat büyüyebilir. Bu, süreci dakikalarca kilitler ve bellekten (OOM) öldürebilir. Süreç ölürse bütün kiracılar etkilenir. Makineyi korumak için bu ölçek koşulmadı; yukarıdaki doğrusal ölçümlerden türetilmiş bir tahmindir.
- Yükleme yalnız platform yöneticisine açık, bu yüzden saldırı yüzeyi dar. İNCELEME-45 B-1 de aynı dar yüzeyle "DÜZELTME" sayılmıştı. Kartın açık sorusu "taşınmadıysa sınırlar yeterli mi" idi. Cevap **hayır**: sınırlar maliyeti bağlıyor, ama yanıt verebilirliği yalnız sayfa başı içeriği küçük PDF'lerde bağlıyor.
- **Önerilen düzeltme (küçük, migration yok):** `extractPdfText`'i `node:worker_threads` içinde bir `Worker`'da koşturmak.
  - Bellek sınırı verilmeli: `resourceLimits: { maxOldGenerationSizeMb: ~512 }`.
  - Duvar saati zaman aşımı konmalı (ör. 30 sn). Aşılınca `worker.terminate()` çağrılmalı ve `413` dönmeli (ör. yeni kod `parse_too_heavy`).
  - Bu yol hem olay döngüsünü hem de OOM'u ana süreçten ayırır. cs-fb'nin önerdiği graphile-worker taşıması (§6) ayrı ve daha büyük bir iş olarak kalabilir.
  - Kilitlenmeli test: yukarıdaki sıkıştırılmış PDF'le, istek sürerken ana thread'deki ping sayısı sıfır olmamalı.

**Ö-1 (küçük): iki mutant hayatta.**
- **K5:** anlamlı karakter sayımından rakamlar (`\p{N}`) çıkarıldığında testler yeşil kalıyor. Eşiğin "harf **ya da** rakam" tanımı kilitli değil. Pratik etkisi: çoğunlukla sayı olan bir bütçe tablosu PDF'i yanlışlıkla `no_text` alabilir.
- **K7:** `parser.destroy()` silindiğinde testler yeşil kalıyor. Gözlemlenebilir bir davranış değil, ama pdf.js belgesinin belleği GC'ye kalır.
- Her ikisi için birer test satırı yeterli.

**Ö-2 (önceden açık, dokunulmadı):** `upload_failed` yanıtı hâlâ sağlayıcının ham hata gövdesini döndürüyor (§2.2, `text-2-pages` 401). Bu İNCELEME-45 Ö-3 ile aynı bulgu; cs-fb bunu ayrı iş olarak bıraktı.

### Doğru çalışanlar (kanıtlı)
- **Anlamlı ret, gömme yok:**
  - 30 000 sayfa → 413 `too_many_pages` (0,45 sn).
  - 1000 yoğun sayfa → 413 `too_many_chunks` (360. sayfada duruyor).
  - 300 sayfalık tarama ve 15 MB metinsiz PDF → 422 `no_text`.
  - Hepsinde `embedCalls 0`, `docsCreated 0`. Canlıda DB 0/0 → 0/0.
- **Hata ortasında yarım `Chunk` kalmıyor (canlı):** sunucu, OpenAI gömme çağrısını yerelde yanıtlayan ve 4. çağrıda 500 dönen bir test preload'ıyla başlatıldı (harcama 0). 3 parça yazıldı (3 `AiUsageLog` satırı), 4.'sü düştü. Yanıt 500 oldu ve DB `Document/Chunk` **0/0 → 0/0**.
- **Gerçek gömme:** 2 sayfalık sentetik PDF → 200, 8 parça, 8/8 vektörlü, `vector_dims 1536`, `tenantId NULL`, ayırıcı içeren parça yok.
  - Maliyet: 1574 token × 0,13 USD/M ≈ **0,0002 USD**.
  - Test verisi tek id ile silindi: `DELETE 8`, `DELETE 1`, sonra 0/0.
- **Sınır değerlerinin gerekçesi: kabul.**
  - `maxPages 1000`: bir HE iş programı parçası birkaç yüz sayfa.
  - `maxChunks 2500` ≈ 2 M karakter. Sayfa başına ~3000 karakterle ~650 sayfa eder; ~370 sayfalık bir cluster iş programı rahat sığar.
  - `maxEmbeddingUsd 0,20`: varsayılan ayarlarla `maxChunks`'tan önce devreye girmiyor (en fazla ≈0,11 USD). Parça boyu ya da model değişirse diye konmuş bir yedek; bu raporda ve kod yorumunda açıkça yazılı. Kontrolün `Document` yaratılmadan önce yapılması K6 mutantıyla kilitli.
  - Tek zayıflık B-1': sınırlar **sayfa başına** içerik yoğunluğunu bağlamıyor.
- **B-2 kök nedeni doğru:** metin `pages[].text`'ten birleştiriliyor. Canlıda da parçalarda `-- N of M --` yok.

## 2) Kanıt

### 2.1 Süreç içi senaryolar (gerçek pdf-parse; yalnız DB ve `embedText` sahte, 50 ms `setInterval` sayacı)
cs-fb senaryolarının tekrarı:
```
{"name":"pages-30000","bytes":4785221,"ms":559,"ticks":0,"worstGapMs":559,"embedCalls":0,"docsCreated":0,"r":{"code":"too_many_pages","detail":{"pages":30000,"maxPages":1000}}}
{"name":"pages-1001","bytes":163365,"ms":455,"embedCalls":0,"docsCreated":0,"r":{"code":"too_many_pages"}}
{"name":"pages-1000-dense","bytes":163207,"ms":1397,"ticks":11,"expectedIfFree":27,"worstGapMs":528,"embedCalls":0,"docsCreated":0,"r":{"code":"too_many_chunks","detail":{"pagesRead":360,"pages":1000,"maxChunks":2500}}}
{"name":"scan-300","bytes":47017,"ms":536,"embedCalls":0,"docsCreated":0,"r":{"err":"NoExtractableTextError"}}
{"name":"scan-1-stamped","bytes":584,"ms":332,"embedCalls":0,"docsCreated":0,"r":{"err":"NoExtractableTextError"}}
{"name":"notext-15mb","bytes":15729204,"ms":522,"embedCalls":0,"docsCreated":0,"r":{"err":"NoExtractableTextError"}}
```
(İlk koşudaki ~300 ms, pdf-parse'ın soğuk import'u.)

B-1' — sıkıştırılmış (`/FlateDecode`) içerik akışı:
```
{"name":"bomb-1page-8Mchars","bytes":27507,"ms":1242,"ticks":0,"worstGapMs":1242,"embedCalls":7,"r":{"ok":{"storedChunks":7}}}
{"name":"bomb-1page-40Mchars","bytes":134788,"ms":3808,"ticks":0,"worstGapMs":3809,"embedCalls":7,"r":{"ok":{"storedChunks":7}}}
{"name":"bomb-1page-2.5M-lines","bytes":671141,"ms":17278,"ticks":0,"worstGapMs":17279,"rssDeltaMB":214,"embedCalls":7,"r":{"ok":{"storedChunks":7}}}
{"name":"bomb-20pages-x2Mchars","bytes":10316,"ms":3754,"ticks":0,"worstGapMs":3754,"embedCalls":136,"r":{"ok":{"storedChunks":136}}}
{"name":"inplace-1page-100k-lines","bytes":33977,"ms":2155,"ticks":0,"worstGapMs":2155,"rssDeltaMB":173,"embedCalls":0,"r":{"code":"too_many_chunks","detail":{"pagesRead":1,"pages":1}}}
{"name":"inplace-1page-500k-lines","bytes":167046,"ms":11914,"ticks":0,"worstGapMs":11914,"rssDeltaMB":431,"embedCalls":0,"r":{"code":"too_many_chunks","detail":{"pagesRead":1,"pages":1}}}
{"name":"inplace-20pages-x100k-lines","bytes":36898,"ms":21282,"ticks":0,"worstGapMs":21282,"rssDeltaMB":524,"embedCalls":0,"r":{"code":"too_many_chunks","detail":{"pagesRead":20,"pages":20}}}
```
- `bomb-*` satırları sayfanın dışına taşıyor ve pdf-parse bunları atıyor. Metin küçük kalıyor, ama ayrıştırma süresi yine harcanıyor: 671 KB, 17 sn kilit.
- `inplace-*` satırları aynı noktaya çiziliyor. Metnin tamamı tutuluyor ve `too_many_chunks` ancak sayfa ya da dilim bittikten sonra geliyor.
- Maliyet her durumda sınırlı: en fazla 136 çağrı, gerçek harcama yok.

### 2.2 Canlı HTTP
Kurulum:
- Kendi `next dev -p 3952` sürecim, worktree `.env` → `befb_i52`.
- Bu koşu için rastgele bir `AUTH_SECRET` üretildi; çerez repo e2e deseniyle imzalandı (`admin-documents-upload.spec.ts`). Sır basılmadı.
- `OPENAI_API_KEY` bilerek geçersiz.
- Her yükleme sırasında aynı sunucuya 50 ms arayla `GET /api/auth/csrf` pingi atıldı.
```
BEFORE 0|0   (Document|Chunk)
{"name":"pages-30000","bytes":4785221,"status":413,"ms":451,"pingsAnswered":2,"slowestPingMs":415,"body":"{\"error\":\"too_many_pages\",\"pages\":30000,\"maxPages\":1000}"}
{"name":"pages-1000-dense","bytes":163207,"status":413,"ms":1158,"pingsAnswered":3,"slowestPingMs":568,"body":"{\"error\":\"too_many_chunks\",\"pagesRead\":360,\"pages\":1000,\"maxChunks\":2500}"}
{"name":"scan-300","bytes":47017,"status":422,"ms":154,"body":"{\"error\":\"no_text\"}"}
{"name":"notext-15mb","bytes":15729204,"status":422,"ms":169,"body":"{\"error\":\"no_text\"}"}
{"name":"inplace-1page-500k","bytes":167046,"status":413,"ms":5558,"pingsAnswered":2,"expectedIfFree":92,"slowestPingMs":5502,"body":"{\"error\":\"too_many_chunks\",\"pagesRead\":1,\"pages\":1,\"maxChunks\":2500}"}
{"name":"inplace-20pages-100k","bytes":36898,"status":413,"ms":20189,"pingsAnswered":1,"expectedIfFree":336,"slowestPingMs":20132,"body":"{\"error\":\"too_many_chunks\",\"pagesRead\":20,\"pages\":20,\"maxChunks\":2500}"}
{"name":"text-2-pages","bytes":4000,"status":500,"ms":803,"pingsAnswered":14,"slowestPingMs":12,"body":"{\"error\":\"upload_failed\",\"message\":\"OpenAI embeddings error 401: … Incorrect API key provided: sk-befb-*******-i52 …"}
AFTER 0|0
```
Hata ortası (preload `fake-embed.cjs`: `api.openai.com/v1/embeddings` yerelde yanıtlanır, 4. çağrı 500 döner):
```
BEFORE 0|0|0   (Document|Chunk|AiUsageLog rag)
{"name":"text-2-pages","status":500,"ms":854,"body":"{\"error\":\"upload_failed\",\"message\":\"OpenAI embeddings error 500: {\\\"error\\\":\\\"befb injected failure\\\"}\"}"}
AFTER 0|0|3
```
Gerçek anahtar:
```
{"name":"text-2-pages","bytes":4000,"status":200,"ms":4172,"pingsAnswered":64,"expectedIfFree":69,"slowestPingMs":242,"body":"{\"success\":true,\"docId\":\"cmun8a5ee0000nvxkzrbehlgi\",\"chunks\":8}"}
cmun8a5ee0000nvxkzrbehlgi|shared=t|chunks 8|embedded 8|any_sep f|dims 1536
AiUsageLog (son 10 dk, gerçek) → 8 çağrı, 1574 token ≈ 0,0002 USD
DELETE 8 / DELETE 1 → 0|0
```

### 2.3 Mutantlar (kendi seçtiğim 9; paket: `admin-upload-authz` + `rag-pdf-real-parse` + `rag-pdf-ingest-partial` + `rag.test`)
Her mutant tek eşleşme kontrolüyle uygulandı ve yedekten geri yüklendi.
```
BASE 64 passed (64)
RED   K1 dilim boyu 20 -> 1e6 (tek getText, dilimleme yok) -> 2 failed | 62 passed (64)
RED   K2 maxPages kontrolu etkisizlestirildi (total < 0) -> 2 failed | 62 passed (64)
RED   K3 erken durdurma maxChars 10x gevsetildi -> 1 failed | 63 passed (64)
RED   K4 rota PdfLimitError 413 -> 400 -> 1 failed | 63 passed (64)
ALIVE K5 anlamli karakter: yalniz \p{L} (rakamlar sayilmaz) -> 64 passed (64)
RED   K6 butce kontrolu Document create'ten sonra (sira) -> 1 failed | 63 passed (64)
ALIVE K7 parser.destroy() silindi -> 64 passed (64)
RED   K8 sayfa metni tek sayfa (yalniz ilk sayfa tutulur) -> 2 failed | 62 passed (64)
RED   K9 hasMeaningfulText pages yerine 1 -> 1 failed | 63 passed (64)
RESTORED 64 passed (64)
```
Sonuç 7/9 kırmızı. K5 ve K7 için bkz. Ö-1. cs-fb'nin 16/17 iddiası (N1 eşdeğer mutant) okundu. N1'in eşdeğer olduğu gerekçesi doğru: kod `slice.text`'i okumuyor.

### 2.4 İzole DB kurulumu ve tam süit
Sıra: `prisma db push` → `apply-migrations.sh` → `db:rls-role` → `db:rls` → `db:seed`.
- Bu makinede `psql` yok. Betik `PSQL=<docker exec -i fabrika-postgres psql sarmalayıcısı>` ile koşuldu.
- `apply-migrations` iki kez koşuldu, ikisi de `exit=0`: `37 files applied`.
- `db:rls` sonucu: `Policies in public: 112 → 112`.
- Tam süit çıktısı bu rapora **aktarılamadı**: oturum, çıktı buraya yazılmadan kapandı ve `wt52` worktree'si silindiği için çıktı geri alınamadı. Bu nedenle tam süit sonucu için bir iddia yok. Karar (B-1') tam süite değil, §2.1–2.2'deki ölçümlere dayanıyor. (30.09, İNCELEME-60 sırasında commit'lenirken eklendi.)

## 3) Değişen dosyalar
Kod değişmedi. Yalnız bu rapor eklendi (iskelet `1ff82bed`). Geçici dosyalar worktree'de kaldı ve worktree silindi (§5).

## 4) Riskler
- B-1' düzelene kadar, yöneticinin (ya da ele geçirilmiş bir yönetici oturumunun) yükleyeceği küçük ve kötü biçimli bir PDF, üretim web sürecini onlarca saniye kilitleyebilir. Dosya büyüdükçe süre dakikalara çıkar ve süreç OOM ile ölebilir.
- cs-fb'nin kendi raporunda yazdığı riskler geçerli ve doğru tanımlanmış:
  - uzun istek ve ters vekil (reverse proxy) zaman aşımı,
  - ingest ortasında sürecin ölmesi.

## 5) Temizlik
- Kendi `next dev -p 3952` sürecim kapatıldı; `:3952` üzerinde süreç kalmadı.
- Test verisi tek id ile silindi; izole DB 0/0.
- Worktree (`wt52`) ve `befb_i52` DB'si kaldırıldı (§2.4'teki tam süitten sonra). Geçici betikler, PDF'ler ve `AUTH_SECRET` dosyası silindi.

## 6) Sonraki adım
1. **cs-fb (bu kart):** B-1' için `extractPdfText`'i `worker_threads` Worker'da koşturmak (bellek sınırı + zaman aşımı + terminate). Kilitlenmeli bir test eklenmeli: sıkıştırılmış tek sayfalık PDF'te ana thread pingi 0 olmamalı. Ö-1 (K5, K7) için birer test satırı.
2. Ayrı kartlar (cs-fb §6 ile aynı): graphile-worker'a taşıma; `upload_failed` ham gövdesi (Ö-2).

## Platform beyanı
- Doğrulama **macOS**'ta yapıldı: Darwin 27.0.0, Node, zsh. Postgres Docker'da (`fabrika-postgres`).
- İncelenen kod yolu platformdan bağımsız: bellek içi PDF baytları, pdf.js (Node'da ana thread), `setImmediate`, `FormData`. Olay döngüsü kilidi pdf.js'in Node'daki davranışından geliyor, işletim sisteminden değil. Bu yüzden Linux'ta (CI ve üretim) da aynı olmalı. Üretim konteynerinin bellek sınırı düşükse OOM daha erken gelir.
- Önerilen `worker_threads` ve `resourceLimits` bütün platformlarda aynı Node API'si.
- Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var.
