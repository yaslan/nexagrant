# TASK-MUO4GPRO92N97 — FB TAKİP (İNCELEME-85 Y-1/Y-2/N1): K1 embedding, istek düzeyi 400 + büyük harf token tahmini (be-fb)

**Durum: TAMAM**

Dal: `be-fb/muo4gp-embed-400` (dev `47c96594`'ten açıldı, sonra dev `aea1a63d` içeri alındı). Kod commit'i `bc0ec6a3`. Kapılar birleşik ağaçta yeşil, dev'e merge edildi. Push yapılmadı.
Önceki koşu ~17:05'teki ağ kesintisinde kesildi. Dal ya da commit kalmamıştı, iş baştan yapıldı.

## 1. Ne yapıldı

### Y-1: Satırdan kaynaklanan 400 ile istekten kaynaklanan 400 ayrıldı (`src/lib/scoring/embeddings.ts`, `Run.vector`)
Bir 400 ya da 413 geldiğinde (bayt öneki denemesinden sonra da ret sürüyorsa) satır artık **yalnızca bu ret üzerine** işaretlenmiyor. Koşu sabit bir **probe** metni gönderiyor: `EMBEDDING_PROBE_TEXT = 'Research and innovation funding call.'`, 6 token. Model ve boyut aynı, maliyet platforma yazılıyor (`tenantId: null`, `purpose: k1_embedding_probe`).

| Probe sonucu | Anlamı | Davranış |
|---|---|---|
| Embed edildi | Aynı model/boyut başka metni kabul ediyor, sorun bu satırda | Satır `rejected:<hash>` olarak işaretlenir (eski davranış) |
| O da 400/413 | Sorun isteğin kendisinde: model, `dimensions` ya da ağ geçidi | **Hiçbir satır işaretlenmez**, koşu hemen durur, `requestRefused: true` |
| 429 / 5xx / ağ hatası | Kesinti var, satır hakkında bilgi yok | Satır işaretlenmez, sistemik hata sayılır (3'lük seriye eklenir), satır sonraki koşuda yeniden denenir |
| Tavan doldu | Soru sorulamadı | Satır işaretlenmez, sonraki koşuda yeniden denenir |

İnceleme iki seçenek önermişti. Bunun yerine probe'u seçtim, çünkü ikisinin de açığı vardı:
- "Başarı görülmeden işaretleme": gecenin ilk 5 satırı gerçekten bozuksa koşu her gece hiç işaretleme yapmadan durur ve katalog kilitlenir. Bu, eski B-1 kilidine geri dönmek demek.
- "Seri durunca geri al": koşunun ortasında başlayan bir istek hatasında, seri 5'e ulaşmadan kalan işaretler geri alınmaz.

Probe her reddi tek tek ve kesin olarak sınıflandırıyor. Bedeli ret başına ~6 token (≈ 0,0000008 USD).

Yan etkiler:
- İncelemedeki S3 senaryosu da kapandı (429 ile 400 karışık gelirken 400'lerin işaretlenmesi). Kesinti sırasında gelen 400 artık işaretlenmiyor.
- `MAX_CONSECUTIVE_REJECTIONS = 5` yerinde duruyor. Bu 5 red artık probe ile doğrulanmış satır redleri. Durma yalnızca bir gecede yapılan işi sınırlıyor, sonraki koşu işaretlerin ötesine geçiyor.
- İş katmanı: `K1EmbeddingsOutputSchema` şemasına `requestRefused` eklendi (`src/lib/jobs/events.ts`). `k1-embeddings:failed` uyarısı artık "the provider refused the request itself: model, dimensions or gateway; no row was marked" diyor ve `meta.requestRefused` alanını taşıyor.

### Kilitli satırları geri açma komutu: `scripts/k1-embeddings-unlock-rejected.ts` (**uygulanmadı, patron onayına bırakıldı**)
```
pnpm tsx scripts/k1-embeddings-unlock-rejected.ts                      # kuru koşu: işaretli konu/profil kimliklerini listeler
pnpm tsx scripts/k1-embeddings-unlock-rejected.ts -- --apply           # önce yedek JSON yazar, sonra işaretleri NULL'a çeker
pnpm tsx scripts/k1-embeddings-unlock-rejected.ts -- --restore=<dosya> # geri alma: yedekteki işaretleri geri koyar
```
- **Idempotent:** Yalnızca hash'i hâlâ `rejected:` ile başlayan satırlara dokunur. İkinci `--apply` "Nothing to clear" der.
- **Güvenli geri alma:** `--restore` yalnızca hash'i hâlâ NULL olan satırları geri koyar, yani arada yeniden embed edilmiş satırı ezmez.
- **Yetki:** `Topic` tablosu RLS'siz. `TenantProfile` her kiracı için kendi kapsamında (`withTenant`) okunup yazılıyor, `fabrika_app` rolüyle denendi. Çıktıya yalnızca kimlikler ve sayılar yazılıyor, profil metni yazılmıyor.
- **Etkisi:** Açılan her satır sonraki gece bir kez daha deneniyor. Satır başına < 0,001 USD. Gerçekten bozuk bir satır o gece probe ile doğrulanıp yeniden işaretleniyor.
- **Ne zaman gerekli:** Canlıda Y-1 hiç tetiklenmediyse gerekmez. Önce kuru koşu çalıştırılıp sayıya bakılmalı.

### Y-2: Büyük harfli Yunanca/Kiril metinde token tahmini artık gerçek sayının üstünde (`tokenWeight`)
cl100k sözlüğünde küçük harfli kelimeler var. Büyük harfler baytlara bölünüyor. Yeni ağırlıklar:
- Yunanca küçük harf (U+03AC–03CE): **1,2**, değişmedi.
- Yunanca büyük harf, diğer Yunanca harfler ve politonik: **2** (UTF-8 bayt uzunluğu).
- Kiril küçük harf (U+0430–045F): **0,8**, değişmedi.
- Kiril büyük harf (U+0400–042F): **1,5**.
- Kiril ek harfler (U+0460–052F: Kazakça, Moğolca, tarihî harfler): **2**.

Küçük harfli metin eskisi kadar uzun kesiliyor. Tabloda cümle başlarındaki büyük harflerden kaynaklanan <%1'lik bir fark var.

### N1 ve sağ kalan 5 mutant için testler
- N1 (429×3): koşu durur, 0 işaret, probe gönderilmez.
- N2: 413 bayt öneki ile embed edilir.
- N4: arada başarılı bir embed olduğunda dağınık redler koşuyu durdurmaz.
- N6: probe sürerken pilotu biten kiracının profili işaretlenmez.
- N13: sağlayıcı gövdesi tek satır ve ≤ 200 karakter kalır.
- N16: fikstür kesilen uzunluğu ve onun gerçek token sayısını sabitliyor.

## 2. Kanıt

### Kartın istediği senaryo: mock istek-400 → 0 işaret ve koşu durur (`embeddings.test.ts`)
```
✓ a refused request is not a refused row: nothing is marked and the run stops (İNCELEME-85 Y-1)
    → {rejected:0, aborted:true, requestRefused:true}, gönderilen = [ilk profil, PROBE] (2 çağrı), 12 konu + 2 profil hash = NULL
✓ night after night of refused requests locks no row; once fixed, every row is embedded (S5)
    → 4 gece: her gece 0 işaret · 5. gece (sağlayıcı düzeldi): profilesEmbedded 2, topicsEmbedded 12, previouslyRejected 0
✓ a refused row is marked only after the probe is embedded, and the probe is booked to the platform
✓ a probe that hits an outage judges nothing …   ✓ no room left under the cap for the probe …
✓ a refused row between system failures does not reset their streak, and is not marked while the provider is down
```
İncelemenin S5 tablosunda eski davranış şuydu: gece 1'de 5/12, gece 2'de 10/12, gece 3'te 12/12 satır kalıcı işaretleniyordu. Yeni davranışta her gece 0/12.

**Canlı, izole DB, gerçek SQL/RLS (`fabrika_app`)**: `tests/k1-embeddings.live.test.ts` dosyasına yeni test eklendi: "a refused request (every input, the probe too) marks no row, profile or topic, and stops the run". Önce ve sonra alınan profil ve 4 konu durumu birebir aynı. Sağlayıcı düzelince profil ve konu embed ediliyor.

### Gerçek OpenAI (bütçe ≤ 0,05 USD, **harcanan 0,001758 USD**; izole DB `AiUsageLog` satırından okundu)
```
[A] probe → dims=1536 prompt_tokens=6
[B] el-caps-16k: whole=27320 (>8191) kept=4590 chars → OpenAI 200, dims=1536, prompt_tokens=7838 (fixture cutTokens=7838)
[B] ru-caps-16k: whole=15117 (>8191) kept=6015 chars → OpenAI 200, dims=1536, prompt_tokens=5682 (fixture cutTokens=5682)
[C] dimensions=99999 over 3 topics → {"rejected":0,"requestRefused":true,"aborted":true,"failed":2}
[C] embeddingHash before=[null,null,null] after=[null,null,null]
[total] prompt_tokens=13526 usd=0.001758
```
- Gerçek bir istek düzeyi 400 (desteklenmeyen `dimensions`) yakalandı: 0 işaret, koşu durdu.
- Tam büyük harfli Yunanca ve Rusça metinde kesilen kısmı OpenAI kabul etti. `prompt_tokens` değeri fikstürdeki cl100k sayısıyla birebir aynı.
- Anahtar `.env` dosyasından ortama okundu, hiçbir çıktıya basılmadı. Betik scratch'teydi, repoya girmedi.

### Dil tablosu: 16 000 karakter `clean()` ile kesildikten sonra gerçek cl100k token sayısı (tahmin/gerçek oranı)
| örnek | ÖNCE: gerçek token (oran) | SONRA: gerçek token (oran) · kalan karakter |
|---|---|---|
| el-caps (TAMAMI BÜYÜK) | 12862 (0,62) **✗ > 8191** | 7854 (1,02) · 4592 |
| el2-caps | 12749 (0,63) ✗ | 7810 (1,02) · 4566 |
| el-caps-16k | 12821 (0,62) ✗ | 7838 (1,02) · 4590 — OpenAI 200 ✓ |
| el-polytonic | 8474 (0,94) ✗ | 7714 (1,04) · 6800 |
| ru-caps | 10606 (0,75) ✗ | 5823 (1,37) · 5937 |
| ru-caps-16k | 10335 (0,77) ✗ | 5682 (1,41) · 6015 — OpenAI 200 ✓ |
| bg-caps / uk-caps / sr-caps | 10022 / 10819 / 10339 ✗ | 5519 (1,45) / 5948 (1,34) / 5704 (1,40) |
| mn / mn-caps (Moğolca) | 8776 (0,91) ✗ / 12080 (0,66) ✗ | 7787 (1,03) / 6447 (1,24) |
| kk / kk-caps (Kazakça) | 9164 (0,87) ✗ / 12971 (0,62) ✗ | 7864 (1,02) / 6857 (1,17) |
| el / el-16k (küçük harf) | 6719 (1,19) · 7516 | 6682 (1,20) · 7474 (değişmedi) |
| ru / ru-16k (küçük harf) | 4718 (1,70) · 10819 | 4690 (1,71) · 10756 (değişmedi) |
| en, tr, zh, ko | 1,80 / 1,29 / 1,39 / 1,20 | aynı (ağırlıklarına dokunulmadı) |

Ölçüm `gpt-tokenizer` 2.x ile yapıldı (yalnızca scratch'e kuruldu). Tahmin fonksiyonu kaynak dosyadan olduğu gibi çekilip çalıştırıldı. Fikstüre 13 örnek eklendi: EL/RU/BG/UK/SR/MN/KK büyük harf, politonik, `el-caps-16k` ve `ru-caps-16k` (`cutChars`/`cutTokens` ile).

### Mutasyon: 18/18 öldü (`embeddings.test.ts` + iş testi)
```
KILLED N1 429 counted as refusal            KILLED N2 413 not a refusal           KILLED N4 success keeps rejectedStreak
KILLED N6 no assertTenantWritable on mark   KILLED N13 error not cut to 1 line    KILLED N16 cut budget 9000
KILLED P1 no probe: mark on own word        KILLED P2 probe 400 marks the row     KILLED P3 probe outage marks the row
KILLED P4 refused request does not stop     KILLED P5 probe cap marks the row     KILLED P6 requestRefused never set
KILLED P7 probe booked to tenant (ilk turda SAĞ KALDI → profil testine platform ataması doğrulaması eklendi → KILLED)
KILLED W1 Greek caps 1.2   KILLED W2 Cyrillic caps 0.8   KILLED W3 Cyrillic extended 0.8   KILLED W4 Greek lower 2 (gereksiz sıkı)
KILLED J1 uyarı requestRefused'u söylemiyor
```

### Geri açma betiği: izole DB, `fabrika_app` rolüyle, iki kez çalıştırıldı
```
before: topics=3 profiles=1
== dry run      DRY RUN — marked rows: topics 3, tenant profiles 1          → after: topics=3 profiles=1
== apply #1     Backup written: k1-unlock-backup-….json · Cleared: topics 3, tenant profiles 1 → after: 0 / 0
== apply #2     APPLY — marked rows: topics 0, tenant profiles 0 · Nothing to clear.          → after: 0 / 0
== restore      RESTORE …: topics 3/3, profiles 1/1 marks put back                             → after: 3 / 1
== restore #2   RESTORE …: topics 0/3, profiles 0/1 marks put back (idempotent)                → after: 3 / 1
== apply #3     Cleared: topics 3, tenant profiles 1                                           → final: 0 / 0
```

### Kapılar
İzole DB: `befb-4gp-pg` (pgvector:pg16, 127.0.0.1:55791, DB `fabrika`). CI hazırlama sırası uygulandı: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied" ×2) → `db:rls` (28→112) → `db:seed`. Ortam: `CI=true` ve CI'daki `AUTH_SECRET` fikstürü. Paylaşılan `fabrika` :5433'e **bağlanılmadı**.
```
dal (dev 47c96594 üstü):
  npx vitest run → Test Files 293 passed | 2 skipped (295) · Tests 3614 passed | 36 skipped (3650)   exit 0
  scripts/check-live-skips.ts → exit 0 (yalnız izinli atlamalar; REAL OpenAI testi dahil)
  pnpm typecheck 0 · pnpm lint 0 · env -u NODE_ENV pnpm build 0 · rls:bypass-check ✅ · rls:check ✅
birleşik ağaç (dev aea1a63d içeri alındıktan sonra, 219860fb):
  hedefli (rbac-guard + k1 live + embeddings + job) → 4 files, 166 passed | 1 skipped · typecheck 0 · lint 0
  npx vitest run → Test Files 293 passed | 2 skipped (295) · Tests 3622 passed | 36 skipped (3658)   exit 0
  scripts/check-live-skips.ts → exit 0 · env -u NODE_ENV pnpm build → exit 0
```

## 3. Değişen dosyalar
- `src/lib/scoring/embeddings.ts`: probe sınıflandırması, `requestRefused`, harf büyüklüğüne göre ağırlıklar
- `src/lib/scoring/embeddings.test.ts`: 14 yeni test, 2 test yeni anlama göre güncellendi (aşağıda)
- `src/lib/jobs/events.ts`, `src/lib/jobs/tasks/k1-embeddings.ts` ve iş testi: `requestRefused` çıktısı ve uyarı metni
- `tests/fixtures/cl100k-token-samples.json`: 13 gerçek cl100k örneği
- `tests/k1-embeddings.live.test.ts`: istek reddi için canlı test
- `scripts/k1-embeddings-unlock-rejected.ts`: geri açma, yedek alma ve geri alma komutu (yeni)
- Bu rapor

**Güncellenen iki test (gevşetme değil, istenen davranış değişikliği):**
- "every input refused … stops after five" testi yerine "a refused request … nothing is marked" testi geldi. Eski test 5 kalıcı işareti **doğru** kabul ediyordu, Y-1 hatası buydu.
- "a refused row between system failures" testi artık 400'ün kesinti sırasında işaretlenmediğini de doğruluyor. Probe 503 aldığı için satır yargılanmıyor.

## 4. Riskler
- **Probe maliyeti ve kaydı:** Her gerçek satır reddinde +1 çağrı (~6 token) ve platform kapsamında bir `AiUsageLog` satırı (`k1_embedding_probe`) oluşuyor. Redler zaten nadir. Bayt öneki sigortasından sonra uzunluk kaynaklı ret kalmadı.
- **Sürekli reddedilen satırda probe kesintiye denk gelirse** o gece satır işaretlenmez ve ertesi gece yeniden denenir. Bedeli en fazla 2 ücretsiz 400 ve 1 probe. Kilit oluşmaz.
- **Büyük harfli metin daha kısa kesiliyor:** EL büyük harf ≈ 4 600 karakter (≈ 9 KB), RU büyük harf ≈ 6 000 karakter. Embedding kalitesi için yeterli ve fatura tavanı artık doğru.
- **Bilinen, kapsam dışı eksikler:**
  - Nadir CJK (ext-A) ve nadir Hangul hâlâ tahminin altında kalıyor (≈0,55, İNCELEME-85 tablosu). Bunlar CJK/Hangul bloklarıyla aynı aralıkta olduğu için ayırt edilemiyor.
  - Makine dizgileri (base64, hex) de tahminin altında kalıyor.
  - Bu iki durumda uzunluk güvenliğini bayt öneki sağlıyor. Tavan en kötü ~2,5 kat aşılabilir, mutlak etkisi birkaç sent.
- **Hata metni:** OpenAI gövdesi çok satırlı JSON olduğunda `errors` alanına yalnızca `"… error 400: {"` düşüyor (ilk satır kuralı, N13). Tanı için kısa ama sızıntı güvenli. İstenirse boşlukları tek satıra indirip 200 karakterde kesmek ayrı bir iş.

## 5. Açık sorular
- Canlıda `rejected:` işaretli satır var mı? Kuru koşunun canlıda **salt okuma** olarak çalıştırılması ve `--apply` kararı patronda. Ben canlıya dokunmadım.

## 6. Sonraki adım
- Patron onayıyla canlıda kuru koşu, gerekirse `--apply`. Yedek JSON saklanmalı.
- İsteğe bağlı takip: nadir CJK/Hangul ağırlığı ve hata metninin tek satıra indirilmesi (düşük öncelik).

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, Node 26, Docker'da Postgres 16 + pgvector, gerçek OpenAI API). Değişen kod platformdan bağımsız: saf TS (kod noktası gezme), SQL, `fetch`. Süreç, kabuk ya da dosya yolu kullanmıyor. Tek istisna geri açma betiğinin yedek dosyasını cwd'ye yazması: dosya adında `:` yok (ISO zamanındaki `:` ve `.` karakterleri `-` ile değiştiriliyor), bu yüzden Windows'ta da geçerli bir ad. Linux worker ve CI'da (ubuntu) aynı davranması beklenir. **Windows ve Linux'ta koşulamadı**, çünkü bu makinede o ortamlar yok.
