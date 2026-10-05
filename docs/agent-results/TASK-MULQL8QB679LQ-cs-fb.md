# TASK-MULQL8QB679LQ — DÜZELTME: K6 yönetici PDF yükleme, İNCELEME-45 B-1 + B-2 — cs-fb

> DURUM: **Tamam, incelemeye hazır.** Kod commit'i `25282b80` (dev). B-1 ve B-2 kapandı. Ö-1'deki M7/M9/M10 için test eklendi. Ö-2 ve Ö-3'e dokunulmadı (bkz. §5).

Kaynak: `docs/agent-results/TASK-MULQL8QB679LQ-be-fb-inceleme45.md` (B-1, B-2, Ö-1..Ö-3), fe-fb raporu `TASK-MULQL8QB679LQ-fe-fb.md`, commit'ler `935ef391`, `b17d2ed2`. İş fe-fb meşgul olduğu için bana verildi.

## 1) Ne yapıldı

### B-1: sayfa, parça ve maliyet sınırı
Yeni `extractPdfText` (`src/lib/rag.ts`) PDF metnini sınırlar içinde çıkarıyor. Bütün retler `Document` satırı yaratılmadan ve ilk gömme çağrısından önce veriliyor.

| Sınır | Değer | Gerekçe | Aşılırsa |
|---|---|---|---|
| `maxPages` | 1000 | Bir çalışma programı parçası birkaç yüz sayfa. 1000, en büyüğünün yaklaşık iki katı. Sayfa sayısı metin çıkarılmadan okunuyor (`getInfo`). | `413 too_many_pages` `{pages, maxPages}` |
| `maxChunks` | 2500 | Parça başına bir gömme çağrısı, istek içinde sırayla. 2500 parça ≈ 2 M karakter ≈ 600 sayfalık yoğun bir belge. Çağrı başına ~0,2 sn ile yönetici zaten ~8 dk bekler. | `413 too_many_chunks` `{maxChunks, …}` |
| `maxEmbeddingUsd` | 0,20 USD | Tahmini maliyet tavanı: karakter / 3 = token (İngilizce için ~4, yani bilerek fazla sayıyor), 0,13 USD / M token (text-embedding-3-large). 1000 karakterlik parçalarla önce `maxChunks` bağlar (en çok ≈0,11 USD). Tavan, parça boyu, model ya da `maxChunks` değişirse kendi başına tutar. | `413 over_budget` `{estimatedUsd, maxUsd}` |

Web sürecini korumak için:
- **Sayfa sayısı önce okunuyor.** 30 000 sayfa artık ayrıştırılmıyor, ~0,2 sn'de reddediliyor.
- **Dilimli çıkarma.** pdf.js Node'da ana thread'de çalışıyor. Metin 20 sayfalık dilimler halinde çıkarılıyor ve her dilimden sonra `setImmediate` ile olay döngüsüne sıra veriliyor. Sunucu artık birkaç on milisaniyede bir başka isteklere yanıt verebiliyor.
- **Erken durdurma.** Metin `maxChunks`'ın taşıyabileceği uzunluğu geçtiği anda çıkarma duruyor. Belgenin sonuna kadar ayrıştırıp sonra reddetmiyoruz. Örnek: 1000 yoğun sayfada 360. sayfada durdu.
- `PDFParse` artık `destroy()` ediliyor (önceden edilmiyordu).

**Neden graphile-worker'a taşınmadı (ADR-0008):** bir iş için PDF baytlarının worker'ın okuyabileceği bir yerde durması gerekir. Bu da yeni bir tablo ya da dosya deposu (migration) demek. Sayfanın sorgulayacağı bir durum alanı da gerekir. Worker'ın barındırması da hâlâ açık (ADR-0008 §4). Ayrıca devop-fb şu an paralel bir migration üzerinde çalışıyor. Bu yüzden şimdilik sınırlar bir isteğin maliyetini ve süresini bağlıyor, dilimleme de olay döngüsünü koruyor. Kuyruğa taşıma için ayrı bir kart öneriyorum (§6). Gerekçe rota başındaki yorumda da yazılı.

### B-2: taranmış PDF artık `422 no_text`
- **Kök neden:** pdf-parse 2.4.5'in `getText().text` alanı her sayfanın sonuna `-- N of M --` ekliyor. Bu yüzden metin katmanı hiç olmayan bir PDF bile boş görünmüyordu.
- **Düzeltme:** sayfalar `pages[].text`'ten birleştiriliyor, ayırıcı hiç girmiyor (`pageJoiner: ''` de veriliyor). Üstüne anlamlı metin eşiği eklendi (`hasMeaningfulText`, `src/lib/rag-upload.ts`). Yalnız harf ve rakamlar (`\p{L}\p{N}`) sayılıyor, boşluk ve semboller sayılmıyor. Kurallar:
  - belgenin tamamında en az 200 harf ya da rakam,
  - sayfa başına ortalama en az 100 (300 sayfalık bir taramanın yazılı bir kapak sayfası olsa da tarama sayılır),
  - boşluk dışı karakterlerin en az %50'si harf ya da rakam (bozuk metin katmanından gelen sembol çöpü reddedilir).

### Yarım `Chunk` satırı
- Sınır ve `no_text` retleri `Document` yaratılmadan önce veriliyor. Bu yollarda yazılan bir şey yok.
- Gömme hatası ortada gelirse mevcut `discardPartialDocument` belgeyi ve parçalarını siliyor. Silme başarısız olursa `SystemAlert` yazılıyor. Bu yol birim testle kilitli ve canlı olarak da doğrulandı (§2.3).

### Ö-1: hayatta kalan üç mutant
M7, M9 ve M10 için birer test eklendi (`tests/admin-upload-authz.test.ts`). Üçü de artık kırmızı (§2.2).

### Arayüz
- `too_many_pages`, `too_many_chunks` ve `over_budget` için tr/en hata metinleri eklendi (`messages/*.json` → `adminDocuments.errors`).
- İstemci sınırları `RAG_UPLOAD_LIMITS`'ten, ölçülen sayfa sayısını yanıttan alıyor.
- Her metin "belgeyi bölümlere ayırıp ayrı yükleyin; hiçbir şey kaydedilmedi" diyor.

## 2) Kanıt

### 2.1 Hedefli testler (ana ağaç ve temiz worktree)
```
npx vitest run tests/admin-upload-authz.test.ts tests/rag-pdf-real-parse.test.ts tests/rag-pdf-ingest-partial.test.ts src/lib/rag.test.ts
 Test Files  4 passed (4)
      Tests  64 passed (64)
```
`tests/rag-pdf-real-parse.test.ts` **gerçek pdf-parse** ile koşuyor. PDF'ler `tests/helpers/synthetic-pdf.ts` ile üretiliyor; yalnız DB ve gömme sağlayıcısı sahte. Kapsadığı senaryolar:
- boş 1 sayfa, 300 sayfa tarama, sayfa numarası basılmış 300 sayfa tarama, sembol çöpü → `NoExtractableTextError`, gömme 0
- ayırıcı metne girmiyor
- yoğun metin saklanıyor ve hiçbir parça ayırıcı değil
- 1000 sayfa kabul, 1001 ret
- İNCELEME-45 şekli (30 000 sayfa, 4,8 MB) 3 sn altında ret
- 1000 yoğun sayfa 500. sayfadan önce `too_many_chunks`
- 300 sayfa çıkarılırken olay döngüsü ≥10 kez dönüyor
- `hasMeaningfulText` için 8 sınır durumu

Mock'lu dosyada (`rag-pdf-ingest-partial`) tam `maxChunks` kabul, bir fazlası ret, bütçe tavanı ve varsayılan sınırlarda `maxChunks × 1000 karakter ≤ maxEmbeddingUsd` kontrolü var.

### 2.2 Mutantlar (taban 64/64, her biri tek eşleşme assert'iyle uygulandı ve yedekten geri yüklendi)
```
BASE Tests  64 passed (64)
ALIVE N1 pageJoiner '' silindi (varsayilan ayirici) -> Tests  64 passed (64)
RED   N2 anlamli-metin kontrolu silindi -> Tests  2 failed | 62 passed (64)
RED   N3 sayfa-basi esik kaldirildi -> Tests  3 failed | 61 passed (64)
RED   N4 oran esigi kaldirildi -> Tests  1 failed | 63 passed (64)
RED   N5 maxPages kontrolu silindi -> Tests  2 failed | 62 passed (64)
RED   N6 maxPages > yerine >= -> Tests  2 failed | 62 passed (64)
RED   N7 erken uzunluk durdurma silindi -> Tests  1 failed | 63 passed (64)
RED   N8 kesin parca sayisi kontrolu silindi -> Tests  1 failed | 63 passed (64)
RED   N9 parca > yerine >= -> Tests  1 failed | 63 passed (64)
RED   N10 butce kontrolu silindi -> Tests  1 failed | 63 passed (64)
RED   N11 dilimler arasi setImmediate silindi -> Tests  1 failed | 63 passed (64)
RED   N12 rota PdfLimitError eslemesi silindi -> Tests  1 failed | 63 passed (64)
RED   N13 butce tahmini 3 yerine 30 karakter/token -> Tests  1 failed | 63 passed (64)
RED   M7 allowDuplicate herhangi deger -> Tests  1 failed | 63 passed (64)
RED   M9 imza 4 bayt (tire kontrolu silindi) -> Tests  1 failed | 63 passed (64)
RED   N14 eski davranis: slice.text + varsayilan pageJoiner -> Tests  2 failed | 62 passed (64)
RED   M10 declared content-length kontrolu silindi -> Tests  1 failed | 63 passed (64)
RESTORED Tests  64 passed (64)
```
16/17 kırmızı. **N1 eşdeğer bir mutant:** kod `slice.text`'i hiç okumuyor, `pages[].text`'i okuyor. Ayırıcı yalnız `slice.text`'e ekleniyor, bu yüzden `pageJoiner: ''`'ı silmek davranışı değiştirmiyor. B-2'nin asıl eski davranışı (N14: `slice.text` ile varsayılan ayırıcı) kırmızı. Yorum da buna göre yazıldı.

### 2.3 Canlı HTTP (temiz worktree `25282b80`, kendi `next dev -p 3946` sürecim, izole DB `csfb_k6` = `fabrika`'nın `pg_dump` kopyası)
Oturum çerezleri repo e2e deseniyle, bu koşu için üretilmiş rastgele bir `AUTH_SECRET` ile imzalandı (sır basılmadı). Her yükleme sırasında aynı sunucuya 50 ms arayla `GET /api/auth/csrf` pingi atıldı.
```
{"name":"pages-30000","bytes":4785221,"status":413,"ms":443,"pingsAnswered":2,"slowestPingMs":386,"body":"{\"error\":\"too_many_pages\",\"pages\":30000,\"maxPages\":1000}"}
{"name":"pages-1001","bytes":163365,"status":413,"ms":27,"body":"{\"error\":\"too_many_pages\",\"pages\":1001,\"maxPages\":1000}"}
{"name":"pages-1000-dense","bytes":163207,"status":413,"ms":393,"pingsAnswered":3,"slowestPingMs":181,"body":"{\"error\":\"too_many_chunks\",\"pagesRead\":360,\"pages\":1000,\"maxChunks\":2500}"}
{"name":"notext-15mb","bytes":15729212,"status":422,"ms":197,"body":"{\"error\":\"no_text\"}"}
{"name":"scan-300","bytes":47017,"status":422,"ms":54,"body":"{\"error\":\"no_text\"}"}
{"name":"scan-300-stamped","bytes":47050,"status":422,"ms":73,"body":"{\"error\":\"no_text\"}"}
```
be-fb'nin ölçümüyle karşılaştırma:
- `pages-30000`: önce 265,6 sn sürüyordu ve 240 699 parça üretiyordu. Şimdi **0,44 sn'de 413**, gömme 0.
- `notext-15mb`: önce `500 upload_failed` (gömmeye gidiyordu). Şimdi **422 no_text**.

**Olay döngüsü ve hata yolu.** Sunucu bilerek geçersiz bir `OPENAI_API_KEY` ile yeniden başlatıldı, harcama 0. Sınırın hemen altındaki 340 yoğun sayfa (≈1,9 M karakter) sonuna kadar çıkarıldı, sonra ilk gömme çağrısı 401 aldı:
```
148 10 <- BEFORE (Document, Chunk)
{"name":"dense-340-pages-invalid-key","status":500,"ms":1444,"pingsAnswered":17,"expectedIfFree":26,"slowestPingMs":346,...}
{"name":"text-2-pages-invalid-key","status":500,"ms":117,"pingsAnswered":3,...}
148 10 <- AFTER
```
- Ayrıştırma sürerken 17 ping yanıtlandı; en yavaşı 346 ms. İNCELEME-45'te 1000 sayfa için bu sayı 0/30 idi.
- Hata sonrası DB'de yarım `Document` ya da `Chunk` satırı kalmadı: 148/10 → 148/10.

**Gerçek gömmeyle başarılı yükleme** (gerçek anahtar, 2 sayfalık sentetik PDF):
```
{"name":"text-2-pages","bytes":7690,"status":200,"ms":6421,"pingsAnswered":111,"slowestPingMs":26,"body":"{\"success\":true,\"docId\":\"cmun79vre00002exk8etu9zay\",\"chunks\":15}"}
SELECT → cmun79vre00002exk8etu9zay|work_programme|csfb K6 live probe …|shared=t|chunks 15|embedded 15|any_separator f|dims 1536
AiUsageLog (son 30 dk, rag_ingest_embedding) → 15 çağrı, 2858 token
```
- Harcama: 2858 token × 0,13 USD/M ≈ **0,0004 USD** (sınır 0,5 USD).
- Tahmin aynı belge için ≈4 670 token dedi. Yani tahmin gerçeğin ~1,6 katı ve bilerek fazla sayıyor.
- Test verisi tek id ile, boş-id korumasıyla silindi: `DELETE 15`, `DELETE 1` → 148/10.

### 2.4 Kapılar (temiz worktree, `git worktree add --detach … 25282b80`, `pnpm install --frozen-lockfile`, `prisma generate`)
```
pnpm typecheck → typecheck=0
eslint <değişen 8 dosya> → eslint=0
pnpm i18n:check → ✅ i18n check passed … exit 0
vitest (hedefli 4 dosya) → Tests 64 passed (64)
pnpm build → build=0 ; ├ ƒ /[locale]/admin/documents  ├ ƒ /api/admin/documents/upload
```
- Ana ağaçta `tsc` kırmızı, ama yalnız başka bir ajanın `src/lib/relationships/stale-reminder.ts` ve `tests/stale-relationship-reminder.live.test.ts` dosyalarında (ana ağaçtaki prisma client eski). Benim dosyalarımla ilgisi yok. Temiz worktree'de typecheck 0.
- **Tam süit koşulmadı.** Değişen modülleri (`pdf-parse`, `processPdfAndStore`, `rag-upload`) import eden test yalnız bu üç dosya (`grep -rl` ile doğrulandı), ve üçü de koşuldu. e2e canlı testin PDF'i (24 satır) yeni metin eşiğini rahatça geçiyor. Tam süit gerekiyorsa izole DB'de inceleyici koşabilir.

## 3) Değişen dosyalar (`25282b80`)
- `src/lib/rag.ts`: `PdfLimitError`, `extractPdfText` (sayfa sayısı önce, 20 sayfalık dilim + `setImmediate`, erken durdurma, `destroy`); `processPdfAndStore` içinde metin eşiği, kesin parça sayısı ve bütçe kontrolü
- `src/lib/rag-upload.ts`: `maxPages`, `maxChunks`, `maxEmbeddingUsd`, `RAG_EMBEDDING_COST`, `estimateEmbeddingUsd`, `RAG_TEXT_THRESHOLDS`, `measureText`, `hasMeaningfulText`, 3 yeni hata kodu
- `src/app/api/admin/documents/upload/route.ts`: `PdfLimitError` → 413 + ayrıntı; kuyruğa neden taşınmadığının gerekçesi
- `src/app/[locale]/admin/documents/client.tsx`: yeni kodlar için parametreler
- `messages/tr.json`, `messages/en.json`: 3 hata metni
- `tests/rag-pdf-real-parse.test.ts` (yeni), `tests/helpers/synthetic-pdf.ts` (yeni), `tests/rag-pdf-ingest-partial.test.ts`, `tests/admin-upload-authz.test.ts`

Başka ajanların dosyalarına dokunulmadı: m11 dosyaları, `FON_BRIDGE.md` ve başka raporlar commit'e girmedi (`git commit -- <yollar>`).

## 4) Riskler
- **Uzun istek hâlâ var.** Sınırın içindeki büyük bir belge (≈2500 parça) sırayla gömülüyor ve dakikalar sürüyor. Olay döngüsü bu sırada boş, çünkü ağ çağrısını bekliyor. Ama bir ters vekil (reverse proxy) zaman aşımı istemciye 504 döndürebilir; sunucu işi sürdürür ve belge yine de saklanır. Kalıcı çözüm kuyruk (§6).
- **Süreç ingest ortasında ölürse** (deploy ya da OOM) yarım belge kalabilir ve alarm yazılmaz (be-fb'nin artık riski). Sınırlar bu pencereyi daraltıyor ama kapatmıyor. Tam çözüm için ya tek transaction gerekir (Prisma'nın 5 sn interaktif transaction süresi; `withTenant` bugün süre parametresi almıyor) ya da kuyruk.
- **Eşik yanlış ret verebilir.** Metin katmanı çok az olan meşru bir PDF (ör. neredeyse tamamı görsel olan bir poster seti) `no_text` alır. Hata metni bunu söylüyor. Böyle bir durumda doğru yol OCR'lı PDF yüklemek.
- **Çıkarma sonrası tek senkron adım.** `join`, regex sayımı ve `chunkText` ≈2 M karakter üzerinde senkron çalışıyor. Ölçülen en uzun ping 346 ms; kabul edilebilir.
- **Tahmin sabitleri.** `usdPerMillionTokens: 0.13` elle yazılmış bir fiyat. OpenAI fiyatı değişirse güncellenmesi gerekir; yorumda kaynağı yazılı.

## 5) Açık sorular
- **Ö-2** (paylaşılan `fabrika` DB'sindeki `rls.spec.ts` kalıntısı "Shared Work Programme" satırları) ayrı kart konusu. Dokunulmadı.
- **Ö-3** (`upload_failed` yanıtı sağlayıcının ham hata gövdesini yöneticiye gösteriyor) dokunulmadı. Kart B-1/B-2 kapsamındaydı. Canlı koşuda da gövde görünüyor (§2.3). Ayrı küçük iş.
- Sınır değerleri (1000 sayfa / 2500 parça / 0,20 USD) için patron ya da ürün tarafından farklı bir tercih varsa, değerler tek yerde: `RAG_UPLOAD_LIMITS`.

## 6) Sonraki adım
1. İnceleme (be-fb ya da crw-fb): §2.2 mutant listesi ve §2.3 senaryoları tekrarlanabilir. Üreteç `tests/helpers/synthetic-pdf.ts`.
2. Ayrı kart önerisi: **K6 yüklemesini graphile-worker işine taşıma.** PDF baytları için depo ya da tablo (migration), `Document.status`, sayfada durum sorgusu. Bu, uzun istek ve süreç ölümü risklerini kapatır.
3. Ayrı küçük kartlar: Ö-2 temizliği, Ö-3 ham hata metni.
4. Temizlik yapıldı: `next dev` sürecim kapatıldı (kalan 0), worktree kaldırıldı, `DROP DATABASE csfb_k6` yapıldı, geçici betikler ve anahtar dosyası silindi. `csfb_invret` DB'si önceki kartımın (TASK-MUN2J9LLXNREG) inceleme için bilerek bırakılmış kopyası; bu işte dokunulmadı.

## Platform beyanı
- Doğrulama **macOS**'ta yapıldı (Darwin 27.0.0, Node 26.5, zsh; Postgres Docker'da, `fabrika-postgres`).
- Dokunulan kod yolu platforma bağlı değil: bellek içi PDF baytları, pdf.js metin çıkarma, `setImmediate`, WHATWG `FormData`. Süreç, dosya yolu, kabuk ya da ikili adı kullanılmıyor. Koddan bakınca Linux'ta (CI ve üretim) aynı çalışmalı. Dilimleme ve olay döngüsü davranışı Node'un kendisine ait, işletim sistemine değil.
- Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var.
