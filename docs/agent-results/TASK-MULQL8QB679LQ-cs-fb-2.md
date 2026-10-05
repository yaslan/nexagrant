# TASK-MULQL8QB679LQ — cs-fb (2): İNCELEME-52 B-1' düzeltmesi — PDF ayrıştırma web sürecinden çıkarıldı

Kod commit'i: **`362cbb82`** (dal `dev`). İskelet: `7a363459`.
Kaynak: `docs/agent-results/TASK-MULQL8QB679LQ-be-fb-inceleme52.md` (B-1', Ö-1 K5/K7, Ö-2).

## 1) Ne yapıldı

### Karar: `worker_threads` (graphile-worker değil) — gerekçe
- **Sorunu kökünden bağlayan şey izolasyon.** Sorun "istek uzun sürüyor" değil, "pdf.js bir sayfayı tek senkron parçada işliyor ve bulunduğu thread'i kilitliyor". graphile-worker'a taşımak kilidi web sürecinden jobs-worker sürecine taşır: aynı 37 KB PDF orada da süreci kilitler, arkasındaki bütün işler (CORDIS senk, K1 gece eşleşmesi, e-postalar) bekler. Yani o yol da içeride bir thread + süre sınırına ihtiyaç duyardı.
- **graphile-worker yolu bu kartın kapsamını aşıyor:** PDF baytlarının worker'ın okuyacağı bir yerde saklanması (yeni tablo ya da dosya deposu, migration), ekranın yoklayacağı bir durum alanı ve worker'ın barındırma kararı (ADR-0008 §4, hâlâ açık) gerekir.
- **Sonuç:** ayrıştırma `node:worker_threads` Worker'ında koşuyor. Web sürecinin olay döngüsü hiçbir PDF ile bloklanmıyor. Gömme çağrıları hâlâ istek içinde (sınırlarla bağlı: en fazla 2500 çağrı, ≤0,20 USD). Tüm ingest'i işe taşımak ayrı kart olarak kalıyor (§6).

### Değişiklik
- `src/lib/rag-pdf.worker.ts` (yeni) — thread gövdesi. Yalnız Node yerleşikleri ve pdf-parse'ı içe aktarıyor, sınırları `workerData`'dan alıyor. Bu sayede Next.js'in paketlediği hâliyle de, testlerde Node'un doğrudan yüklediği `.ts` hâliyle de aynı çalışıyor.
  - **Dekompresyon bombası kontrolü (`inflateCheck`), pdf.js başlamadan önce:** dosyadaki her `stream … endstream` gövdesinin açılmış boyu `zlib.inflateSync({ maxOutputLength })` ile ölçülüyor. zlib sınırda durduğu için 1000:1'lik bir akışı ölçmenin maliyeti en fazla sınır kadar. İç içe Flate katmanları (`[/FlateDecode /FlateDecode]`) 3 derinliğe kadar izleniyor. Sınırlar: akış başına **64 MB**, dosya başına **256 MB** → `413 parse_too_heavy`.
  - Neden gerekli: pdf.js'in açtığı akışlar typed array; bunların baytları V8 heap'inin dışında kalıyor. Yani `resourceLimits` onları görmüyor, bu kontrol görüyor.
  - Sayfa sayısı önce okunuyor (`too_many_pages`), 20 sayfalık dilimler arasında uzunluk kontrolü sürüyor (`too_many_chunks`), sayfalar ayırıcısız birleştiriliyor (İNCELEME-45 B-2).
- `src/lib/rag-pdf-extract.ts` (yeni) — web tarafı:
  - **Duvar saati sınırı `maxParseMs = 30 s`** → `worker.terminate()` → `413 parse_too_heavy {maxSeconds: 30}`.
  - **Heap sınırı `maxParseHeapMb = 512`** (`resourceLimits.maxOldGenerationSizeMb`). `ERR_WORKER_OUT_OF_MEMORY` → `413 parse_too_heavy {maxHeapMb}`. Thread ölür, sunucu ölmez.
  - **Aynı anda tek ayrıştırma** (promise kuyruğu). Cevap ancak thread tamamen kapandıktan sonra dönüyor. Testte bulundu: ilk sürümde sıradaki iş, önceki thread kapanırken başlıyordu (aynı anda 2 thread).
  - Cevap vermeden kapanan thread → sıradaki upload beklemez, anında hata.
  - `PdfLimitError` buraya taşındı, `rag.ts`'ten yeniden dışa aktarılıyor. Kod birliğine `parse_too_heavy` eklendi.
- `src/lib/rag.ts` — eski ana-thread `extractPdfText` kaldırıldı. Aynı imzalı sarmalayıcı `maxChars`'ı hesaplayıp worker'a devrediyor.
- `src/lib/rag-upload.ts` — yeni sınırlar (`maxParseMs`, `maxParseHeapMb`, `maxInflatedMb`, `maxStreamInflatedMb`), gerekçeleri yorumda. `RAG_UPLOAD_ERRORS`'a `parse_too_heavy` eklendi.
- `messages/tr.json`, `messages/en.json` — `adminDocuments.errors.parse_too_heavy`. Ekran (`client.tsx`) hata kodunu zaten `t(\`errors.${code}\`)` ile gösteriyor, ek UI değişikliği gerekmedi.
- `route.ts` — yalnız yorum. Rota `PdfLimitError`'ı zaten 413'e çeviriyordu.

### Yolda bulunan, önceden var olan üretim hatası (düzeltildi)
- **Standalone çıktısında (Dockerfile `runner` aşaması yalnız `.next/standalone`'u kopyalıyor) PDF yükleme HİÇ çalışmıyordu.** Hata: `Failed to load external module pdf-parse-…: ReferenceError: DOMMatrix is not defined`.
- **Kök neden:** pdf.js, Node'da `DOMMatrix` polyfill'i için `@napi-rs/canvas`'ı çalışma anında `createRequire` ile yüklüyor. Next'in dosya izleyicisi (nft) bunu takip edemiyor, bu yüzden canvas paketi standalone'a hiç kopyalanmıyordu.
- **Değişiklikten önce de vardı:** standalone yolundan ana thread'de yükleme denendi, aynı hata alındı (§2.5). be-fb ve benim önceki ölçümlerim `next dev` ile yapıldığı için görünmemişti.
- **Düzeltme:** worker'da pdf-parse'tan önce `import 'pdf-parse/worker'`. Bu, pdf-parse'ın Next.js/serverless için belgelediği giriş noktası. `@napi-rs/canvas`'ı statik içe aktarıp global `DOMMatrix/Path2D/ImageData`'yı tanımlıyor; statik import olduğu için izleyici paketi kopyalıyor. Sonuç: standalone'da `.pnpm/@napi-rs+canvas@0.1.80` var, gerçek yükleme 200.

### İNCELEME-52 diğer bulguları
- **Ö-1 K5 (rakamlar):** test eklendi. Mutant X13 kırmızı.
- **Ö-1 K7 (`parser.destroy()`):** `destroy()` duruyor, ama artık belleği bırakan şey thread'in sonlandırılması (her cevaptan sonra `terminate()`; bütün isolate yıkılıyor). `destroy()` silinse bile gözlemlenebilir fark yok, bu yüzden bunu eşdeğer mutant sayıyorum; test yazılmadı.
- **Ö-2 (`upload_failed` ham sağlayıcı gövdesi):** dokunulmadı, ayrı iş (§6).

## 2) Kanıt

### 2.1 Süreç içi: eski (ana thread) ve yeni (worker) karşılaştırması
Aynı makine, aynı PDF'ler. 50 ms `setInterval` sayacı ana thread'de.
```
{"mode":"old","name":"inplace-20pages-shared-100k","bytes":9607,"ms":9990,"ticks":1,"expectedIfFree":199,"worstGapMs":9990,"rssDeltaMB":346,"r":"ok"}
{"mode":"old","name":"inplace-1page-500k","bytes":82140,"ms":6334,"ticks":0,"expectedIfFree":126,"worstGapMs":6334,"r":"too_many_chunks"}
{"mode":"old","name":"inplace-20pages-100k","bytes":333056,"ms":24516,"ticks":0,"expectedIfFree":490,"worstGapMs":24516,"r":"too_many_chunks"}
{"mode":"old","name":"bomb-1gb-1stream","bytes":1044220,"ms":4696,"ticks":1,"expectedIfFree":93,"worstGapMs":4696,"rssDeltaMB":1535,"r":"ok"}
{"mode":"old","name":"bomb-double-512mb","bytes":1542,"ms":2109,"ticks":1,"expectedIfFree":42,"worstGapMs":2109,"r":"ok"}
{"mode":"new","name":"legit-2pages-flate","bytes":1288,"ms":461,"ticks":8,"expectedIfFree":9,"worstGapMs":52,"r":"ok pages=2 chars=7342"}
{"mode":"new","name":"inplace-20pages-shared-100k","bytes":9607,"ms":4713,"ticks":91,"expectedIfFree":94,"worstGapMs":53,"r":"ok pages=20 chars=2000038"}
{"mode":"new","name":"inplace-1page-500k","bytes":82140,"ms":2508,"ticks":48,"expectedIfFree":50,"worstGapMs":52,"r":"too_many_chunks {\"pagesRead\":1,\"pages\":1,\"maxChunks\":2500}"}
{"mode":"new","name":"inplace-20pages-100k","bytes":333056,"ms":12081,"ticks":234,"expectedIfFree":241,"worstGapMs":55,"r":"too_many_chunks {\"pagesRead\":20,\"pages\":20,\"maxChunks\":2500}"}
{"mode":"new","name":"bomb-1gb-1stream","bytes":1044220,"ms":222,"ticks":4,"expectedIfFree":4,"worstGapMs":52,"r":"parse_too_heavy {\"maxInflatedMb\":256,\"maxStreamInflatedMb\":64}"}
{"mode":"new","name":"bomb-double-512mb","bytes":1542,"ms":211,"ticks":4,"expectedIfFree":4,"worstGapMs":52,"r":"parse_too_heavy {\"maxInflatedMb\":256,\"maxStreamInflatedMb\":64}"}
```
- Eski kod: tick 0–1, en uzun boşluk = koşunun tamamı (24,5 sn'ye kadar).
- Eski kodda 1 MB'lık bomba ana süreçte **+1535 MB RSS** yaptı ve **kabul edildi**. Yeni kodda 0,2 sn'de 413.
- Yeni kod: tick ≈ beklenen, en uzun boşluk ≤ 55 ms.
- `inplace-20pages-shared-100k` be-fb'nin şekli: 20 sayfa tek sıkıştırılmış akışı paylaşıyor. Benim üretimim 9,6 KB (be-fb'ninki 37 KB).

### 2.2 Canlı HTTP — **standalone üretim sunucusu** (`node .next/standalone/server.js`, izole DB `csfb2_i52`)
- `OPENAI_API_KEY` bilerek geçersiz.
- Yükleme sürerken aynı sunucuya 50 ms arayla `GET /api/auth/csrf` pingi atıldı (ayrı istemci).
```
BEFORE 0|0   (Document|Chunk)
{"name":"inplace-20pages-shared-100k","bytes":9607,"status":413,"ms":4124,"pingsSent":80,"pingsAnswered":80,"slowestPingMs":26,"body":"{\"error\":\"too_many_chunks\",\"chunks\":2501,\"maxChunks\":2500}"}
{"name":"inplace-1page-500k","bytes":82140,"status":413,"ms":2217,"pingsSent":43,"pingsAnswered":43,"slowestPingMs":4,"body":"{\"error\":\"too_many_chunks\",\"pagesRead\":1,\"pages\":1,\"maxChunks\":2500}"}
{"name":"inplace-20pages-100k","bytes":333056,"status":413,"ms":10099,"pingsSent":195,"pingsAnswered":195,"slowestPingMs":5,"body":"{\"error\":\"too_many_chunks\",\"pagesRead\":20,\"pages\":20,\"maxChunks\":2500}"}
{"name":"bomb-1gb-1stream","bytes":1044220,"status":413,"ms":108,"pingsSent":3,"pingsAnswered":3,"slowestPingMs":4,"body":"{\"error\":\"parse_too_heavy\",\"maxInflatedMb\":256,\"maxStreamInflatedMb\":64}"}
{"name":"bomb-double-512mb","bytes":1542,"status":413,"ms":96,"pingsSent":2,"pingsAnswered":2,"slowestPingMs":3,"body":"{\"error\":\"parse_too_heavy\",\"maxInflatedMb\":256,\"maxStreamInflatedMb\":64}"}
{"name":"legit-2pages-flate","bytes":1288,"status":500,"ms":850,"pingsSent":17,"pingsAnswered":17,"slowestPingMs":7,"body":"{\"error\":\"upload_failed\",\"message\":\"OpenAI embeddings error 401: … Incorrect API key provided: sk-<redacted> …"}
AFTER 0|0
```
**Süre sınırı (canlı):** 80 sayfa, sayfa dışına çizilen 1 M satırlık tek paylaşılan akış (85 KB):
```
{"name":"offpage-80pages-shared-1M","bytes":85565,"status":413,"ms":30029,"pingsSent":579,"pingsAnswered":579,"slowestPingMs":37,"body":"{\"error\":\"parse_too_heavy\",\"maxSeconds\":30}"}
{"name":"legit-2pages-flate","bytes":1288,"status":500,"ms":681,"pingsSent":14,"pingsAnswered":14,"slowestPingMs":4,"body":"…OpenAI embeddings error 401…"}   ← sonlandırmadan sonra sıradaki yükleme normal
```
(Aynı şeklin 20 sayfalık hâli 13,9 sn'de `422 no_text` verdi, 268/268 ping.)

**Saf `curl` ile paralel ölçüm** (`inplace-20pages-100k`; yükleme arka planda, ön planda ardışık `curl` pingleri):
```
upload status=413 total=10.684611s
{"error":"too_many_chunks","pagesRead":20,"pages":20,"maxChunks":2500}
curl pings: 1137 answered 200: 1137 slowest: 0.004149s
```
Karşılaştırma (be-fb, eski kod, aynı şekil): 336 pingden 1'i, en yavaşı 20 132 ms.

### 2.3 Meşru PDF, gerçek gömme (standalone, gerçek anahtar)
```
BEFORE 0|0
{"name":"legit-2pages-flate","bytes":1288,"status":200,"ms":3714,"pingsSent":72,"pingsAnswered":72,"slowestPingMs":27,"body":"{\"success\":true,\"docId\":\"cmuneamfj0000a7xkmh5hc8o9\",\"chunks\":10}"}
cmuneamfj0000a7xkmh5hc8o9|shared=t|chunks 10|embedded 10|any_sep f|dims 1536
AiUsageLog 10|1888          ← 1888 token × 0,13 USD/M ≈ 0,00025 USD
DELETE 10 / DELETE 1  (tek id: cmuneamfj0000a7xkmh5hc8o9) → AFTER-DELETE 0|0
```

### 2.4 `next dev` (Turbopack dev) de aynı
```
{"name":"legit-2pages-flate","status":500,…"OpenAI embeddings error 401…"}     ← ayrıştırma geçti, gömmeye ulaştı
{"name":"bomb-1gb-1stream","status":413,"ms":225,…"parse_too_heavy"…}
{"name":"inplace-20pages-shared-100k","status":413,"ms":7259,"pingsSent":141,"pingsAnswered":141,"slowestPingMs":62,…}
```

### 2.5 Önceden var olan standalone hatasının kanıtı
`import 'pdf-parse/worker'` eklenmeden önceki build'de, standalone sunucu:
```
Warning: Cannot load "@napi-rs/canvas" package: "Error: Cannot find module '@napi-rs/canvas'
Upload error: Error: Failed to load external module pdf-parse-e937620d5720ba7a: ReferenceError: DOMMatrix is not defined
```
Ana thread'de aynı yoldan (yani değişiklikten önceki davranış):
```
$ cd .next/standalone && node -e "import('./.next/node_modules/pdf-parse-e937620d5720ba7a/dist/pdf-parse/esm/index.js')…"
main thread standalone-path FAIL: DOMMatrix is not defined
```
Düzeltmeden sonra: `.next/standalone/node_modules/.pnpm/` içinde `@napi-rs+canvas@0.1.80` ve `@napi-rs+canvas-darwin-arm64@0.1.80` var; §2.2–2.3 bu build ile koşuldu.

### 2.6 Testler
Yeni dosya `tests/rag-pdf-worker-isolation.test.ts`, 15 test, gerçek pdf-parse ile:
- olay döngüsü pingi (be-fb şekli),
- süre sınırı + sonrasında sıradaki yükleme,
- heap sınırı (OOM → `parse_too_heavy`),
- akış başı / toplam / iç içe katman bombası; tam sınırdaki akışın kabulü,
- aynı anda en fazla 1 thread,
- cevap vermeden ölen thread,
- `too_many_chunks` detayı,
- K5.

`rag-pdf-ingest-partial` artık `pdf-parse` yerine `rag-pdf-extract`'ı taklit ediyor, çünkü `vi.mock` worker thread'e ulaşmıyor.
```
$ npx vitest run tests/rag-pdf-worker-isolation.test.ts tests/rag-pdf-real-parse.test.ts tests/rag-pdf-ingest-partial.test.ts tests/admin-upload-authz.test.ts
 Test Files  4 passed (4)
      Tests  61 passed (61)
RAG testleri dahil geniş küme: Tests  112 passed (112)
tsc --noEmit: temiz · eslint (değişen 9 dosya): temiz · i18n-check: passed
```
**Tam süit (izole DB):** `Tests 154 failed | 2823 passed`. Kırmızıların hepsi 28 DB'ye bağlı `.live`/RLS dosyasında; hiçbiri RAG/PDF değil.

Aynı 28 dosya **taban commit'te (`e14fc6ea`, değişikliğim yok), aynı DB'de** de kırmızı:
```
baseline: Test Files 28 failed (28)  Tests 155 failed | 128 passed | 1 skipped (284)
mine:     Test Files 28 failed (28)  Tests 155 failed | 128 passed | 1 skipped (284)
```
Bunlar izole DB ortamından geliyor (ör. `db:rls-role` `DATABASE_URL_RLS_TEST`'i `fabrika`'ya yazıyor). Regresyon değil.

### 2.7 Mutantlar (16; her biri tek eşleşme kontrolüyle uygulandı, yedekten geri yüklendi)
```
BASE 61 passed (61)
RED   X1 ayristirma ana thread'de (Worker yok) -> 7 failed | 54 passed (61)
RED   X2 sure siniri yok (deadline x1000) -> 1 failed | 60 passed (61)
RED   X3 heap siniri yok (resourceLimits silindi) -> 1 failed | 60 passed (61)
RED   X4 OOM -> parse_too_heavy eslemesi yok -> 1 failed | 60 passed (61)
RED   X5 inflateCheck devre disi -> 4 failed | 57 passed (61)
RED   X6 akis basina sinir yok -> 3 failed | 58 passed (61)
RED   X7 toplam biriktirilmiyor -> 1 failed | 60 passed (61)
RED   X8 ic ice katman izlenmiyor (derinlik 1) -> 1 failed | 60 passed (61)
RED   X9 sinir karsilastirmasi gevsek (n > 2*cap) -> 4 failed | 57 passed (61)
ALIVE X10 sinirda ret (>= yerine >) -> 61 passed (61)
RED   X11 too_many_chunks detayina maxChunks eklenmiyor -> 1 failed | 60 passed (61)
RED   X12 dilimler arasi uzunluk kontrolu yok -> 2 failed | 59 passed (61)
RED   X13 K5 rakamlar sayilmiyor -> 1 failed | 60 passed (61)
RED   X14 kuyruk yok (paralel) -> 1 failed | 60 passed (61)
RED   X16 thread kapanmadan cevap (terminate beklenmiyor) -> 1 failed | 60 passed (61)
RED   X15 hata cikisi yakalanmiyor (exit dinleyici yok) -> 1 failed | 60 passed (61)
RESTORED 61 passed (61)
```
- Sonuç **15/16 kırmızı.**
- **X10 pratikte eşdeğer:** fark yalnız dış katmanın açılmış boyu *tam olarak* sınıra eşit olduğunda ve iç katman da zlib olduğunda ortaya çıkıyor. O durumda da bir sonraki akışın `cap`'i 0'a iner ve bomba toplam sınırında yakalanır.
- Mutantlar `pdf-parse/worker` importu eklenmeden hemen önce koşuldu. Bu import sınama mantığını değiştirmiyor; import sonrası aynı 4 dosya 61/61 yeşil.

### 2.8 Temiz worktree build
```
git worktree add --detach …/FONBRIDGE-wt-csfb2-final 362cbb82 → git status: temiz
pnpm install --frozen-lockfile && prisma generate && pnpm build → build exit 0
.next/standalone/node_modules/.pnpm: @napi-rs+canvas@0.1.80, @napi-rs+canvas-darwin-arm64@0.1.80
.next/standalone/.next/server/chunks: [worker thread]-src_lib_rag-pdf_worker_ts_13k1dmb._.js
```
Not: ilk denemede `prisma generate` adımını unuttum. Build `.prisma/client/index-browser` bulunamadı diye düştü; generate sonrası exit 0.

## 3) Değişen dosyalar (`362cbb82`)
- `src/lib/rag-pdf.worker.ts` (yeni), `src/lib/rag-pdf-extract.ts` (yeni)
- `src/lib/rag.ts`, `src/lib/rag-upload.ts`, `src/app/api/admin/documents/upload/route.ts` (yorum)
- `messages/tr.json`, `messages/en.json` (+1 anahtar)
- `tests/rag-pdf-worker-isolation.test.ts` (yeni), `tests/helpers/synthetic-pdf.ts` (`flatePdf`, `inPlaceTextContent`), `tests/rag-pdf-ingest-partial.test.ts`, `tests/rag-pdf-real-parse.test.ts` (yorum)

Başka çalışanların ağaçtaki commit'lenmemiş dosyalarına (m11, relationships, storage, evidence, be-fb raporu…) dokunulmadı. Commit `git commit -- <yollar>` ile yapıldı.

## 4) Riskler
- **Paylaşılan akış açığı:** açılmış bayt sınırı her akışı dosyada **bir kez** sayar. Aynı akışa 80 sayfa işaret ederse pdf.js onu 80 kez çözer. Bunu 30 sn süre sınırı ve heap sınırı bağlıyor (canlıda kanıtlandı, §2.2), bayt sınırı bağlamıyor.
- **Kuyruk:** aynı anda tek ayrıştırma var. İki yönetici aynı anda ağır PDF yüklerse ikincisi ≤30 sn bekler. Olay döngüsü etkilenmez. Yalnız platform yöneticisine açık bir ekran için kabul edilebilir.
- **Thread başına sabit maliyet:** her yükleme yeni bir isolate + pdf.js yüklüyor. Ölçüm: ~0,2–0,5 sn ve geçici ~+100–240 MB RSS; thread kapanınca geri veriliyor.
- **Hâlâ istek içinde:** gömme çağrıları istek içinde sürüyor (en fazla 2500 çağrı). Ters vekil zaman aşımı riski İNCELEME-45'teki gibi duruyor.
- **Yanlış pozitif ihtimali:** Flate ile sıkıştırılmış büyük görüntüler de açılmış bayta sayılıyor. Çok görüntülü (ör. >256 MB açılmış Flate görüntü) bir metin PDF'i `parse_too_heavy` alabilir. Mesaj "PDF yazdırıcıyla yeniden kaydedin / bölün" diyor. İş programları metin ağırlıklı.
- **`@napi-rs/canvas` yerel bir modül.** Docker `deps` aşaması (node:22-alpine) musl ikilisini kuruyor. İmajın içinde koşulmadı (§Platform).

## 5) Açık sorular
- **Sınırlar:** 30 sn / 512 MB / 64+256 MB. Ürün tarafı daha sıkı bir süre isterse `RAG_UPLOAD_LIMITS.maxParseMs` tek satır. Gerçek en büyük HE iş programı parçasıyla ölçüm yapılmadı (elde yok); 1000 yoğun sayfalık sentetik belge 2 sn altında.
- **Standalone hatası:** üretimde bir yükleme denendiyse 500 almış olmalı. Varsa kayıtlara bakmak için ops'a sorulabilir.

## 6) Sonraki adım
1. **be-fb:** İNCELEME-52 B-1' yeniden doğrulaması, §2.2'deki şekillerle, **standalone** build üzerinde.
2. **Ayrı kart:** tüm ingest'i (ayrıştırma + gömme) graphile-worker işine taşımak (baytların saklanması, durum yoklama, ADR-0008 §4 barındırma kararı). Bu thread izolasyonu o işin içinde de gerekli kalır.
3. **Ayrı kart (Ö-2):** `upload_failed` yanıtında sağlayıcının ham hata gövdesi (§2.2'de anahtarın maskelenmiş kısmı yanıtta görünüyor).
4. **Ayrı kart / not:** Docker `runner` imajında bir PDF yükleme dumanı (smoke) testi. Standalone'a özgü izleme (nft) hataları `next dev`'de ve vitest'te görünmüyor.

## Temizlik
- Kendi standalone (`:3962`) ve dev (`:3963`) süreçlerim kapatıldı; iki portta dinleyen yok.
- Test verisi tek id ile silindi.
- `csfb2_i52` DB'si `DROP` edildi.
- Worktree'ler (`FONBRIDGE-wt-csfb2`, `-base`, `-final`) kaldırıldı.
- `AUTH_SECRET` ve çerez dosyaları silindi. Sır basılmadı; yanıtlarda `sk-…` maskelendi.

## Platform beyanı
- **Doğrulandı: macOS** (Darwin 27.0.0, Node v26.5.0, zsh). Postgres Docker'da (`fabrika-postgres`). Build + standalone + dev + vitest hepsi bu makinede.
- **Linux (CI, üretim Docker `node:22-alpine`): koşulamadı** — bu makinede yalnız macOS var. Koddan beklenen:
  - `worker_threads`, `resourceLimits`, `zlib.inflateSync({maxOutputLength})` (Node ≥ 14.5) ve `ERR_WORKER_OUT_OF_MEMORY` platformdan bağımsız, Node 22'de mevcut Node API'leri.
  - Worker dosyası Turbopack tarafından ayrı bir parça olarak paketleniyor (yol ayırıcısı yok, `__dirname` tabanlı).
  - `@napi-rs/canvas` platforma özgü ikili isteğe bağlı bağımlılıkla geliyor. Alpine'da `@napi-rs/canvas-linux-x64-musl` (ya da arm64-musl) kurulmalı. Build aşaması `pnpm install --frozen-lockfile` ile hedef platformunkini kurar ve nft onu standalone'a kopyalar. İmajın içinde doğrulanmadı (Sonraki adım 4).
  - Testlerde worker `.ts` olarak Node'un tip ayıklamasıyla yükleniyor. CI `node-version: 22` en güncel 22.x'i (≥ 22.18, tip ayıklama varsayılan açık) kurar; sorun beklenmez. Daha eski Node 22'de vitest bu testlerde `.ts` worker'ı yükleyemez; üretim build'i etkilenmez.
- **Windows: koşulamadı** (makine yok). Kodda platforma bağlı yol ya da kabuk yok. `new URL('./rag-pdf.worker.ts', import.meta.url)` Windows'ta da dosya URL'si olarak çözülür.
