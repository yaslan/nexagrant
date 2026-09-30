# TASK-MUO3BNKECJAO8 — FB İNCELEME-85 (se-fb): K1 embedding düzeltmesi (TASK-MUNEGYCFJQZ9S, be-fb, merge 30542f9e)

**Durum: TAMAM**

## Karar: **ONAY** (merge geri alınmasın) + 2 engellemeyen bulgu + test boşlukları

Düzeltme asıl hedefini tutturuyor: uzun Yunanca/Kiril satırı artık koşuyu kilitlemiyor. 401, 429, 5xx, ağ hatası ve yanlış boyut hâlâ 3 ardışık hatada koşuyu durduruyor. Reddedilen satır sonraki gecelerde bir daha gönderilmiyor. Profiller konulardan önce işleniyor. Bayt öneki sigortası (8000 UTF-8 bayt ≤ 8000 token) denediğim her girdide tuttu, uzunluk yüzünden kalıcı 400 kalmıyor.

İki bulgu takip kartı gerektiriyor:
- **Y-1 (orta).** İsteğin kendisinden kaynaklanan kalıcı bir 400, her gece 5 satır işaretleyerek bütün kataloğu kademeli olarak kalıcı "rejected" durumuna düşürüyor. Profiller önce işlendiği için ilk kurban kiracı profilleri oluyor.
- **Y-2 (düşük).** Token tahmini BÜYÜK HARFLİ Yunanca/Kiril ve birkaç nadir yazı sisteminde gerçek değerin altında kalıyor. Raporda "doğal dilde altına düşmüyor" deniyor, bu büyük harfli metin için doğru değil. Uzunluk güvenliği yine de korunuyor. Etkisi yalnızca maliyet tavanında görülüyor (en kötü ≈1,6 kat) ve fazladan, ücretlendirilmeyen bir 400 çağrısı yapılıyor.

Kod değiştirilmedi. Çalışma scratchpad worktree'sinde (`wt85`, dev `8ddcb5b6`, 30542f9e'yi içeriyor) ve kendi Postgres konteynerimde yapıldı: `sefb-i85-pg` (pgvector:pg16, 127.0.0.1:55785, DB `sefb_i85`). CI hazırlama sırası uygulandı: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied" ×2) → `db:rls` (28→112) → `db:seed`. Paylaşılan `fabrika` :5433'e bağlanılmadı.

## 1. Ne yapıldı
1. Diff satır satır okundu: `embeddings.ts`, `llm.ts` (`LlmProviderError(status)`), `k1-embeddings.ts`, `events.ts`.
2. **Tahmin tabanı**, gerçek cl100k tokenizer'ıyla denendi. `gpt-tokenizer` yalnızca scratch'e kuruldu. Tahmin fonksiyonları kaynak dosyadan **olduğu gibi** çekilip çalıştırıldı, kopya yazılmadı. 29 örnek × 3 uzunluk (200 / 16k / 40k karakter) üretildi ve her biri `clean()` ile aynı kesmeden geçirildi.
3. **Davranış denemeleri**, izole DB'de gerçek SQL/RLS ile yapıldı (kod `fabrika_app` olarak koştu). Scratch live test S1–S7, commit'lenmedi.
4. **Kendi mutantlarım:** 17 mutant, be-fb'nin M1–M12'siyle çakışmayacak şekilde seçildi.
5. Tam `npx vitest run` (2 kez), live-skip kapısı, `typecheck`, `lint` ve `build` koşuldu.
6. Gerçek OpenAI çağrısı **yapılmadı, harcama 0 USD**. be-fb cl100k sayısının OpenAI'ın `prompt_tokens` değeriyle 4/4 birebir aynı olduğunu zaten gösterdi. Bu yüzden gerçek tokenizer bu soru için API'ye eşdeğer.

## 2. Bulgular

### Y-1 (orta, engellemeyen): Kalıcı istek düzeyi 400 kataloğu ve profilleri kademeli olarak "rejected"a kilitliyor
- **Konum:** `src/lib/scoring/embeddings.ts`, `Run.vector` içinde. `isInputRejection` her 400/413'ü satırın suçu sayıyor, `embedTopics` ve `embedProfile` ise `rejected:` işaretini hemen yazıyor. `MAX_CONSECUTIVE_REJECTIONS = 5` koşuyu durduruyor ama o 5 işaret kalıcı oluyor.
- **Kanıt (S5):** 12 kısa konu var ve sağlayıcı her isteğe 400 dönüyor (model, `dimensions` ya da ağ geçidi hatası gibi):
  ```
  night1: rejected=5 aborted=true  marked_total=5/12
  night2: rejected=5 aborted=true  marked_total=10/12
  night3: rejected=2 aborted=false marked_total=12/12
  night4: rejected=0 aborted=false marked_total=12/12   ← sorun giderilse bile hiçbir satır bir daha denenmiyor
  ```
- **Etki:** Profiller önce işlendiği için (B-4) 1. gece ilk 5 kiracının profili işaretleniyor. Bu kiracılar, profil metni değişene kadar **hiç K1 eşleşmesi almıyor**, yani kiracı başına sessiz bir kesinti oluşuyor. Sorun N gece sürerse 5N satır kalıcı olarak işaretleniyor. Kurtarma elle yapılıyor: be-fb raporundaki `UPDATE … SET "embeddingHash" = NULL WHERE … LIKE 'rejected:%'` gerekiyor, profil tarafı sahip rolüyle. Görünürlük var: her gece `k1-embeddings:failed` uyarısı "N rows refused … run stopped" diyor. Olasılık düşük, çünkü model ve boyut sabit, env'den gelmiyor. Bugün 400 dönen tek "kısa" girdi yok.
- **Kısa metin ipucu:** ≤ 8000 baytlık bir metne gelen 400 uzunluk yüzünden olamaz. Böyle bir 400 büyük olasılıkla isteğin kendisiyle ilgilidir, ama kod bu satırı da ilk denemede işaretliyor.
- **Düzeltme önerisi:** İşaretleri yazmayı ertele. Koşuda en az bir başarılı embed görüldüyse yaz, yani istek geçerli olduğu kanıtlanmışsa. Ya da `rejectedStreak` eşiğe ulaşıp koşu durduğunda o serinin işaretlerini geri al (`embeddingHash` önceki değerine dönsün). Her iki durumda da S5 senaryosu test olarak eklenmeli: "hepsi 400 → 0 kalıcı işaret".

### Y-2 (düşük, engellemeyen): Tahmin büyük harfli Yunanca/Kiril ve bazı yazılarda gerçeğin altında
- **Konum:** `tokenWeight` (`embeddings.ts`). Yunanca 1,2, Kiril 0,8, CJK/Hangul 1,5. Hepsi UTF-8 bayt sayısının (2 ve 3) altında.
- **Kanıt** (tahmin / gerçek cl100k, 16k karakterlik girdi `clean()` ile kesildikten sonra):
  ```
  el-monotonic 8000/6857 1.17 ✓   el-caps     7999/12871 0.62 ✗ (>8191)   el-polytonic 8000/10162 0.79 ✗
  ru           8000/5201 1.54 ✓   ru-caps     8000/9942  0.80 ✗ (>8191)   mn (Moğolca) 8000/8326  0.96 ✗
  uk 1.08 · bg 1.58 · sr 1.19 · kk 1.08 ✓                                   cyr-ext      8000/19998 0.40 ✗
  zh 1.32 · ja 1.34 · katakana 1.41 · ko 1.23 ✓                             zh-rare 0.55 ✗ · ko-rare 0.58 ✗
  emoji (ZWJ/bayrak/VS16) 1.43 ✓ · mixed-el-en 1.17 ✓ · mixed-all (EL/RU/ZH/KO/emoji) 1.09 ✓
  tr 1.11 · vi 1.40 · combining 1.25 · fullwidth 2.10 · digits 1.11 ✓
  ascii-punct 0.51 · ascii-code(JSON/HTML) 0.65 · hex 0.73 · b64 0.51 ✗ (makine dizgisi; bilinen)
  byte-prefix(8000 B) → gerçek token ≤ 8000: 29/29 örnekte tuttu
  ```
- **Etki:** Uzunluk güvenliği korunuyor. Tahmini aşan satır 400 alıyor, ardından bayt önekiyle embed ediliyor (`shortened`). Bu durumda ilk, ücretlendirilmeyen çağrı da tahmine eklendiği için toplam tahmin yine üst sınır oluyor. Tavanın aşılabildiği durum şu: 8191 tokenin altında kalan ama tahmini düşük olan satırlar. Örnek olarak büyük harfli bir Yunanca başlık ya da açıklama tavanı en çok ≈1,6 kat aşabilir, nadir CJK/Kiril-ek ≈2,5 kat. Yunan resmî çağrı başlıkları sıkça TAMAMI BÜYÜK HARF yazılıyor. Bu yüzden be-fb raporundaki "doğal dilde gerçeğin altına düşmüyor" iddiası bu durum için yanlış. `tests/fixtures/cl100k-token-samples.json` içinde büyük harfli örnek yok.
- **Düzeltme önerisi:** Yunanca ağırlığını 2'ye çek (UTF-8 bayt sayısıyla aynı, büyük harfte 0,62 → ≈1,03). Kiril'i ≥ 1,0'a çek (büyük harf RU 0,80 → 1,0, Moğolca 0,96 → 1,2). Fikstüre `el-caps`, `ru-caps`, `el-polytonic`, `mn` örneklerini ekle. Bedeli şu: küçük harfli Yunanca metin daha kısa kesilir (≈3700 karakter ≈ 5 KB, embedding kalitesi için yeterli).

### T-1 (test boşluğu, düşük): Sağ kalan mutantlar
17 mutantın 11'i öldü. Sağ kalanlar:
| Mutant | Anlamı | Önem |
|---|---|---|
| **N1** 429 da "satır reddi" sayılır | Kartın "sistemik hatalar hâlâ durduruyor" güvencesi 429 için **hiçbir testle sabitlenmemiş**. Bu mutantla bir 429 fırtınası satırları kalıcı olarak işaretler. | orta (test ekle: 429×3 → aborted, 0 işaret) |
| N2 413 red sayılmaz | 413 yolu test edilmiyor | düşük |
| N4 başarı `rejectedStreak`'i sıfırlamaz | Arada başarılar olsa bile toplam 5 dağınık red koşuyu durdurur | düşük |
| N6 profil işaretinde `assertTenantWritable` yok | Süresi dolmuş pilota yazılan işaret yakalanmıyor (TOCTOU koruması) | düşük |
| N13 hata metni tek satıra/200 karaktere kesilmiyor | Sağlayıcı gövdesi iş çıktısına tam olarak girer (önceden de var olan koruma, testsiz) | düşük |
| N16 kesme bütçesi 8000 → 9000 | Kesilmiş fikstürün gerçek token ≤ 8191 olduğu sabitlenmemiş | düşük |

Öldürülenler: N3 (önekte gelen 429/5xx reddi sayılıyor), N5 (işarette updatedAt koruması yok), N7 (Yunanca 1,0), N8 (Kiril 0,6), N9 (astral 2), N10 (CJK 1,0), N11 (önek 32 KB), N12 (kısa satırda ikinci çağrı), N14 (red eşiği 50), N15 (red sistemik sayaca da ekleniyor), N17 (eski 3 karakter/token maliyet).

### N-1 (not, bu merge'le ilgisiz): `tests/rag-pdf-worker-isolation.test.ts` duvar saati sınırları yük altında kırmızı
Tam koşunun ikisinde de aynı 2 test düştü: `ms < 3000` → 6948 / 7825 ve `ms < 5000` → 6402 / 10780. Dosya tek başına koşulunca 2/2 kez 25/25 geçti. Makinenin yük ortalaması 12 çekirdekte **93**'tü (başka ajanların süreçleri). Bu testler benim TASK-MUNRAWJ0N84T6 işimden geliyor. Embedding kodunu çağırmıyorlar. CI'daki yüksüz runner'da büyük olasılıkla geçer, ama yerel tam koşuyu kırmızı gösteriyor. Takip önerisi: sınırları CPU zamanına bağla ya da yük altında gevşet. Olay döngüsü boşluk kontrolü (`worstGapMs`) asıl korumadır ve olduğu gibi kalmalı.

## 3. Kanıt

**Kartın denemeleri, izole DB'de gerçek SQL ile** (`zz-sefb-i85.live.test.ts`, 7/7 geçti):
```
[S1] 401×3            {"calls":3,"aborted":true,"failed":3,"rejected":0}            işaret 0
[S2] 429×3            {"calls":3,"aborted":true,"rejected":0}                        işaret 0
[S2] 500×3            {"calls":3,"aborted":true,"rejected":0}                        işaret 0
[S2] fetch failed×3   {"calls":3,"aborted":true,"rejected":0}                        işaret 0
[S2] 3-boyutlu vektör {"calls":3,"aborted":true,"rejected":0}                        işaret 0
[S3] 429,400,429,400,429 {"calls":5,"aborted":true,"failed":5,"rejected":2,"marked":["01","03"]}  ← red sistemik seriyi sıfırlamıyor
[S4] 1 red + 11 iyi   gece1 {"calls":12,"rej":1,"emb":11} · gece2+3 çağrı: 0 · previouslyRejected 1/1  ← sonsuz yeniden deneme yok
[S5] hep 400          (Y-1 tablosu)
[S6] sıra             PPTTT   ← profiller önce
[S7] GERÇEK embedText + stub fetch: 400,429,200 → işaretler "R-V" (400 işaretli, 429 işaretsiz ve yarın yeniden denenecek, 200 vektör)
```
Uzun Yunanca/Kiril/CJK/emoji/karışık metinlerin tahmini: Y-2 tablosu. Bayt öneki 29/29 örnekte ≤ 8000 gerçek token.

**Hedefli testler** (izole DB, `CI=true`): `embeddings.test` + job testi + `k1-embeddings.live` + `llm.embed.test` + `topic-match-nightly.live` → `Test Files 5 passed · Tests 108 passed | 1 skipped` (atlanan: REAL OpenAI, izinli).

**Tam koşu** (`npx vitest run`, izole DB, `CI=true`, CI `AUTH_SECRET` fikstürü):
```
1. koşu: Test Files 1 failed | 288 passed | 2 skipped (291) · Tests 2 failed | 3551 passed | 36 skipped (3589)
2. koşu: aynı; 2 kırmızının ikisi de rag-pdf-worker-isolation duvar saati (N-1)
tek başına: npx vitest run tests/rag-pdf-worker-isolation.test.ts → Tests 25 passed (25) ×2
live-skip kapısı: scripts/check-live-skips.ts → exit 0 (yalnız izinli atlamalar)
```
**Kapılar:** `pnpm typecheck` → exit 0 · `pnpm lint` → exit 0 · `env -u NODE_ENV pnpm build` → exit 0.

**OpenAI harcaması:** 0 USD (çağrı yok).

## 4. Değişen dosyalar
- Yalnızca bu rapor. Kod, test ya da fikstür değişmedi. Scratch dosyaları (`zz-sefb-i85.live.test.ts`, `mut.py`, tokenizer probu) repo dışında kaldı ve silindi.

## 5. Riskler
- Y-1 tetiklenirse kiracılar K1'i sessizce kaybeder. Uyarı görünür ama kurtarma elle SQL ile yapılır.
- Y-2 yalnızca maliyet tavanını gevşetir (≤1,6 kat büyük harfli EL, ≤2,5 kat nadir yazılar). Tavan zaten düşük tutulduğu için mutlak etki birkaç sent.
- N-1 yüklü makinede yerel tam koşuyu kırmızı gösteriyor ve başka incelemelerde yanlış alarm üretebilir.

## 6. Açık sorular
- Y-1 düzeltmesi hangisi olsun: "başarı görülmeden işaretleme" mi, yoksa "seri durunca işaretleri geri al" mı? Önerim birincisi, çünkü daha basit ve kalıcı yan etkisi yok. Karar sahibe (be-fb) ve lidere ait.

## 7. Sonraki adım
- Takip kartı (be-fb): Y-1 + Y-2 + T-1'deki N1 testi (429 → işaret yok). N2, N4, N6, N13 ve N16 aynı kartta düşük öncelikli test olarak eklenebilir.
- Takip kartı (se-fb): N-1, PDF testlerinin duvar saati sınırları.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, Node 26, Docker'da Postgres 16 + pgvector). İncelenen kod platformdan bağımsız: saf TS (`for…of` ile kod noktası gezme, `Buffer.byteLength`), SQL ve `fetch`. Süreç, dosya yolu ya da kabuk kullanmıyor, bu yüzden Linux worker ve CI'da (ubuntu) aynı davranması beklenir. N-1'deki süre sınırları makine yüküne bağlı, CI runner'ında farklı sonuç verebilir. **Windows ve Linux'ta koşulamadı**, çünkü bu makinede o ortamlar yok. `psql` için `/opt/homebrew/opt/libpq/bin` PATH'e eklendi. Bu yalnızca bu makinenin kurulumu.
