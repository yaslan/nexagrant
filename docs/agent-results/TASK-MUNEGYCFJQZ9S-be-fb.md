# TASK-MUNEGYCFJQZ9S — FB K1 embedding takibi (İNCELEME-55 B-1..B-4) — be-fb

**Durum: TAMAM**

Dal: `be-fb/munegy-embedding` (dev `b8788951`'den açıldı, ayrık worktree). İzole Postgres: kendi konteynerim `befb-munegy-pg` (pgvector:pg16, `127.0.0.1:55466`). Paylaşılan `fabrika-postgres` (:5433) hiç kullanılmadı, ne okundu ne yazıldı.

## 1. Ne yapıldı

**B-1: Yunanca/Kiril uzun metin artık koşuyu kilitlemiyor.** Üç katman var:
1. **Yazı sistemine duyarlı token tahmini** (`estimateEmbeddingTokens`). Her kod noktasına bir üst sınır ağırlığı veriliyor: ASCII 0,3, rakam 0,6, aksanlı Latin 2, Yunanca 1,2, Kiril 0,8, CJK/kana/Hangul 1,5, astral (emoji) 4, diğer yazılar 3. Ağırlıklar gerçek cl100k_base tokenizer'ıyla (`gpt-tokenizer`, yalnızca scratch'te kuruldu, repoya bağımlılık eklenmedi) 23 dilde, emoji, rakam ve URL örnekleri üzerinde kalibre edildi. Paketin boyutu 43 MB olduğu için gerçek tokenizer'ı çalışma zamanına almadım. Tahmin, doğal dilde gerçek değerin altına düşmüyor.
2. **Token-güvenli kesme.** Metin önce eskisi gibi 16 000 karaktere, sonra **tahmini 8000 token**a kesiliyor (`MAX_EMBED_TOKENS_ESTIMATE`). Böylece 16 000 karakterlik Yunanca metin, gerçekte 14 368 token yerine 6741 token olarak gidiyor. İngilizce satırların metni ve hash'i değişmiyor, çünkü 16 000 ASCII karakter yaklaşık 4800 tahmini token ediyor ve kesmeye takılmıyor.
3. **400 tek satırı etkiliyor, koşuyu değil.** `embedText` artık `LlmProviderError(message, status)` fırlatıyor. Mesaj aynı kaldı, çağıranlar uyumlu. 400 ya da 413 gelirse metin **bir kez** en çok 8000 UTF-8 baytlık bir önekle yeniden deneniyor. Tokenizer byte-level BPE olduğu için her token en az 1 bayttır, yani bu önek ≤ 8000 token olmak zorunda. Bu yol base64 ve hex gibi tahminin tutmadığı girdileri de kapsıyor. Önek de reddedilirse satır `embeddingHash = 'rejected:<hash>'` ile işaretleniyor ve metni değişene kadar atlanıyor. Metin ya da model değişince hash de değişir ve satır yeniden deneniyor. **Ardışık hata sayacı yalnızca sistemik hataları sayıyor** (401, 429, 5xx, ağ hatası, yanlış boyut). Reddedilen satır bu sayacı ne artırıyor ne sıfırlıyor. Ayrı bir koruma daha var: art arda 5 reddetme "isteğin kendisi yanlış" demektir ve koşu durur (`MAX_CONSECUTIVE_REJECTIONS`).
- Çıktıya üç sayaç eklendi: `rejected` (bu koşuda işaretlenen), `previouslyRejected` (önceki koşuda işaretlendiği için atlanan), `shortened` (önekten embed edilen). Hepsi `K1EmbeddingsOutputSchema`'da. Uyarı metni artık "N rows refused, now skipped until their text changes" diyor. Yalnızca sayı taşıyor, sağlayıcı gövdesi yok.

**B-2: Türkçe tahmini düzeltildi.** Eski kural 3 karakter/token idi. Benim TR 16k fikstürümde bu kural 5334 token tahmin ediyor, gerçek 6439 (%17 düşük). İncelemedeki TR metninde fark %6'ydı. Yeni tahmin 8153 (1,27 kat), yani artık gerçeğin altına düşmüyor.

**B-3: Tahmin tabanı testi eklendi.** `tests/fixtures/cl100k-token-samples.json` 32 örnek içeriyor: 29 kısa örnek (23 dil + emoji/rakam/URL) ve TR, EL, RU 16k uzun metinleri, her biri gerçek cl100k sayısıyla. `estimate >= real` her örnek için ayrı bir test. Ayrıca katalog dillerinde tahminin gerçeğin 2 katını aşmadığını sınayan bir test var. Tavan testleri eskiden kendi kendini doğruluyordu (K5/K6 bu yüzden sağ kalmıştı). Artık sabit fikstüre dayandıkları için K5/K6 benzeri mutantlar ölüyor.

**B-4: Profiller artık konulardan önce işleniyor.** Gerekçe: profil başına maliyet < 0,0001 USD ve profil vektörü olmadan `k1-topic-match` hiçbir satır yazmıyor. Eski sırada ~1300 konuluk backfill birkaç gece tavanı tüketiyor ve o sürede hiçbir profil embed edilmiyordu. Yeni sırada eşleşme ilk geceden, o ana kadar embed edilmiş konularla çalışıyor. se-fb raporundaki R-2 metnine dokunmadım, çünkü o başka ajanın raporu. Bu değişiklikle R-2'deki "kısmi" ifadesi artık doğru.

## 2. Kanıt

**Önce/sonra, gerçek job ile uçtan uca.** `k1EmbeddingsTask` + gerçek `embedText` + gerçek SQL/RLS (`fabrika_app`) izole DB'de koşuldu. `fetch`, OpenAI'ı **gerçek cl100k tokenizer'ıyla** taklit ediyor: 8191 tokeni aşan girdiye 400 dönüyor. En düşük id'lerde 3 Yunanca, 2 Kiril ve 1 Türkçe 16k konu var (scratch betiği `zz-job-e2e.live.test.ts`, commit'lenmedi).
```
ÖNCE (dev kodu, git stash ile):
[e2e] night 1: {"success":"false","aborted":"true","failed":"3","topicsEmbedded":"0",...}
[e2e] night 1 calls: 3 400s: 14363,14363,14363 max ok tok: 0
[e2e] night 1: open topics still without vector: 26; profiles with vector: 0
[e2e] night 2: {"success":"false","aborted":"true","failed":"3","topicsEmbedded":"0",...}   ← her gece aynı kilit
SONRA (bu dal):
[e2e] night 1 alerts: []
[e2e] night 1: {"success":"true","aborted":"false","failed":"0","rejected":"0","previouslyRejected":"0","shortened":"0","topicsEmbedded":"26",...,"estimatedUsd":"0.006281"}
[e2e] night 1 calls: 26 400s:  max ok tok: 6743 real tokens billed: 36608
[e2e] night 1: open topics still without vector: 0
[e2e] night 2 calls: 0 ... "topicsUpToDate":"26"
```
Tahmini tutar 0,006281 USD. Gerçek tutar 36 608 tok × 0,13/1M = 0,004759 USD. Tahmin gerçeğin altında kalmıyor.

**Gerçek OpenAI (6 çağrı, 2'si 400 döndü ve ücretlendirilmedi).** Anahtar ana repodaki `.env`'den process env'e okundu, hiçbir yere yazılmadı ve basılmadı. Çağrılar doğrudan HTTP ile yapıldı, `AiUsageLog`'a yazılmadı, çünkü bu uygulama kodu değil, bir ölçüm:
```
[real] EL 16k, dev (no cut)   chars 16000 est 17050 cl100k 14368 api 400 Invalid 'input': maximum context length is 8192 tokens.
[real] EL 16k, cut            chars  7507 est  8000 cl100k  6741 api 200 prompt_tokens 6741
[real] TR 16k, cut            chars 15730 est  8000 cl100k  6321 api 200 prompt_tokens 6321
[real] RU 16k, cut            chars 10948 est  8000 cl100k  4931 api 200 prompt_tokens 4931
[real] b64 cut (first try)    chars 16000 est  5452 cl100k 12340 api 400 Invalid 'input': maximum context length is 8192 tokens.
[real] b64 byte-safe prefix   chars  8000 est  2726 cl100k  6169 api 200 prompt_tokens 6169
[real] total billed tokens 24162 ≈ USD 0.003141
```
Bu ölçümden çıkanlar:
- cl100k sayısı OpenAI'ın `prompt_tokens` değeriyle **4/4 birebir aynı**. Bu yüzden fikstürdeki sayılar API'nin göreceği sayılardır.
- Sınır İncelemedeki gibi Yunanca'da aşılıyor.
- Base64 ilk denemede 400 alıyor, ama bayt-güvenli önek bunu kurtarıyor.
- **Harcama ≈ 0,0031 USD** (sınır 0,05 USD).

**Kalibrasyon.** Tahmin/gerçek oranı, gerçek modülün `topicEmbeddingText` çıktısıyla hesaplandı. Her örnek 40k karaktere uzatılıp kesildi:
```
en 1.80 | tr 1.29 | tr2 1.23 | de 1.22 | fr 1.36 | pl 1.07 | cs 1.14 | hu 1.23 | ro 1.14 | vi 1.40
el 1.19 | el2 1.18 | ru 1.69 | bg 1.55 | uk 1.25 | sr 1.28 | zh 1.39 | ja 1.33 | ko 1.20 | ar 3.73
he 2.48 | hi 2.66 | th 3.06 | ka 1.43 | hy 1.43 | emoji 1.49 | digits 1.10 | url 1.07
tr-16k 1.27 | el-16k 1.19 | ru-16k 1.63 | b64 0.44 (← bilinçli: bayt önekine düşüyor)
40k→kesilmiş metnin gerçek tokeni: en çok 7273 (digits), tümü ≤ 8191; yalnız b64 12340 → 400 → önek 6169
```

**Mutantlar** (`scratchpad/mut.py`, hedef `embeddings.ts`, birim ve job testleri; her mutanttan sonra orijinal geri yazıldı):
```
ÖLDÜ M1 ASCII 0.3→0.25 (iyimser, eski K5)   | 3 failed      ÖLDÜ M7 işaret yok sayılır (needsEmbedding) | 1 failed
ÖLDÜ M2 tüm ağırlıklar ÷2 (eski K6)          | 31 failed     ÖLDÜ M8 token-kesmesi yok                   | 2 failed
ÖLDÜ M3 Yunanca 1.2→0.8                      | 3 failed      ÖLDÜ M9 reddetme serisi durdurmaz           | 1 failed
ÖLDÜ M4 aksanlı Latin 2→1                    | 9 failed      ÖLDÜ M10 önek bayt değil karakter           | 3 failed
ÖLDÜ M5 400 sistemik sayılır                 | 5 failed      ÖLDÜ M11 reddetme sistemik seriyi sıfırlar  | 1 failed
ÖLDÜ M6 önek yeniden denemesi yok            | 2 failed      ÖLDÜ M12 konular profillerden önce (B-4)    | 3 failed
```
İlk turda M7 ve M11 sağ çıktı. M7 eşdeğer bir mutanttı, çünkü döngüler işareti zaten önce kontrol ediyor. İkisi için hedefli testler eklendi, ikinci turda **12/12 öldü**.

**Hedefli testler** (izole DB, `CI=true`, kod `fabrika_app` olarak koştu):
```
embeddings.test + k1-embeddings job test + k1-embeddings.live + topic-match-nightly.live + llm.embed.test + rag.test
Test Files 6 passed · Tests 122 passed | 1 skipped   (skipped = K1_EMBEDDINGS_REAL_OPENAI izinli atlaması)
```
Canlı testte yeni `refused rows` bloğu var. Art arda 3 Yunanca satır reddediliyor, gerçek SQL ile `rejected:` işareti yazılıyor, ardından gelen konu embed ediliyor ve ikinci koşu 0 çağrı yapıyor. Başlık değişince işaret kalkıyor ve bayt öneki yoluna giriliyor. Profil işareti RLS altında yazılıyor.

**Kapılar:** `pnpm typecheck` → 0 · `pnpm lint` → 0 · `env -u NODE_ENV pnpm build` → 0 (worktree'de `.env` yok, izole DB).
```
npx vitest run (tam, izole DB :55466, AUTH_SECRET CI fikstürü)
Test Files  278 passed | 6 skipped (284) · Tests  3405 passed | 84 skipped (3489) → exit 0
```
Yerel `check-live-skips` 54 canlı testin atlandığı için FAILED diyor. Bu atlama bilinçli ve beklenen bir durum: DB adı `fabrika` ve CI yok, bu yüzden `invitation-retention`, `k1-embeddings`, `public-lead`, `stale-relationship-reminder` ve `topic-match-nightly` SHARED korumasıyla kendini atlıyor. Bu 5 dosya aynı izole DB'de `CI=true` ile ayrıca koşuldu:
```
Test Files  5 passed (5) · Tests  56 passed | 1 skipped (57)
live-skip gate: 5 live files, 56 live tests passed, 1 allowed skip(s)   (izinli: REAL OpenAI)
```

## 3. Değişen dosyalar
- `src/lib/scoring/embeddings.ts`: tahmin, kesme, önekle yeniden deneme, işaretleme, sayaçlar, profiller önce.
- `src/lib/llm.ts`: `embedText` hatası artık `LlmProviderError` (status taşıyor). Mesaj aynı.
- `src/lib/jobs/events.ts`: çıktı şemasına `rejected`, `previouslyRejected`, `shortened` eklendi.
- `src/lib/jobs/tasks/k1-embeddings.ts`: uyarı metnine ve meta alanına `rejected` eklendi.
- `src/lib/scoring/embeddings.test.ts`, `src/lib/jobs/tasks/__tests__/k1-embeddings.test.ts`, `tests/k1-embeddings.live.test.ts`: testler.
- `tests/fixtures/cl100k-token-samples.json`: yeni fikstür. Metinleri bu görev için ben yazdım, katalog verisi değil.
- Şema ya da migration değişikliği **yok**. `embeddingHash` zaten `TEXT` ve işaret aynı kolonda duruyor.

## 4. Riskler
- **Tek seferlik yeniden embed.** Tahmini 8000 tokeni aşan ve ≤16k karakterlik satırların metni artık kesiliyor, bu yüzden hash'leri değişecek. Bu satırlar ağır Türkçe, Kiril ya da aksanlı metinlerdir. Bunlar bir kez yeniden embed edilir. Bugünkü katalogda ASCII-dışı oranı en çok %18 ve ≥15k karakterlik konu sayısı 15 (İNCELEME-55 ölçümü). Etki en kötü durumda 15 × ~6500 tok ≈ 0,013 USD, tavanın altında.
- **Yanlış yapılandırmada toplu işaretleme.** Model adı dışında bir istek hatası her girdiye 400 döndürürse koşu 5 satırı işaretleyip durur. Uyarı her gece `k1-embeddings:failed` olarak görünür. Geri alma yolu şu:
  ```sql
  UPDATE "Topic"         SET "embeddingHash" = NULL WHERE "embeddingHash" LIKE 'rejected:%';
  UPDATE "TenantProfile" SET "embeddingHash" = NULL WHERE "embeddingHash" LIKE 'rejected:%';  -- sahip rolüyle
  ```
  Model ya da boyut değişirse hash de değiştiği için işaretler zaten kendiliğinden kalkar.
- **İşaretli satırda eski vektör kalıyor.** Bir satırın eski metinden üretilmiş vektörü varsa ve yeni metni reddedilirse, eski vektör yeni vektör gelene kadar kalıyor. Bu, eski davranışla aynı (başarısız satır eski vektörünü korurdu).
- Tahmin, makine dizgilerinde (base64, hex) gerçeğin altında kalıyor, ölçümde 0,44 kat. Uzunluk sorununu önek kapatıyor. Maliyet tavanı ise böyle bir konuda en çok ~2,3 kat gevşeyebilir. Katalog düz yazı olduğu için pratik etkisi yok.

## 5. Açık sorular
- se-fb raporundaki R-2 cümlesi ("backfill sürerken kısmi") B-4 ile artık doğru. Rapora dokunmadım. Düzeltme notu gerekirse sahibi ekleyebilir.

## 6. Sonraki adım
- Merge sonrası ilk gece `k1-embeddings` çıktısında `rejected`, `shortened` ve `previouslyRejected` sayaçlarını izlemek. Bugünkü katalogda üçünün de 0 olması beklenir.
- Temizlik: `befb-munegy-pg` konteyneri ve scratch dosyaları (tokenizer, e2e betiği) iş sonunda silindi. Worktree kaldırıldı.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, Node, Docker'da Postgres 16 + pgvector). Değişen kod platformdan bağımsız: saf TS (`for…of` ile kod noktası gezme, `Buffer.byteLength`), SQL ve `fetch`. Süreç, dosya yolu ya da kabuk kullanmıyor. Linux worker'da ve CI'da (ubuntu) aynı davranmalı. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede o ortamlar yok. `psql` için `/opt/homebrew/opt/libpq/bin` PATH'e eklendi. Bu yalnızca bu makinenin kurulumu, kodun parçası değil.
