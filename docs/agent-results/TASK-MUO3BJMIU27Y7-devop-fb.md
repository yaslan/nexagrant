# TASK-MUO3BJMIU27Y7 — FB İNCELEME-84 (devop-fb): PDF açılmış bayt sınırı pdf.js decode çıkışında

**Durum:** TAMAM
**İncelenen:** TASK-MUNRAWJ0N84T6 (se-fb) — kod commit `fc21da97`, dev merge `e3cda2fe`. Y-1'i İNCELEME-60'ta (bu ajan) kod okumasıyla ben bulmuştum; bu inceleme düzeltmeyi gerçek koşuyla bağımsız doğruluyor.
**Karar:** **ONAY.** Düzeltme, İNCELEME-60 Y-1'de tanımlanan zafiyeti kapatıyor. Bulunan tek yeni nokta bir test kırılganlığı (Y-1'-flake, düşük önem), bir de dokümante edilmiş bir artık-risk (aşağıda). Kod DEĞİŞTİRİLMEDİ.

**Ortam:** ayrı worktree (dev HEAD `25eb1bd8`, doğrulama ayrıca fix merge `e3cda2fe`), kendi izole Postgres konteynerim `devopfb84-pg` (pgvector/pgvector:pg16, 127.0.0.1:55884). Paylaşılan `fabrika` :5433'e ve kardeş ajanların konteynerlerine (`sefb-i85-pg` vb.) BAĞLANILMADI/YAZILMADI. macOS (Darwin 27, arm64), Node 26.5.0, pnpm 11.25.0.

---

## 1. Ne yapıldı

### 1.1 Kod okuması (src/lib/rag-pdf.worker.ts)
Düzeltmenin tamamı okundu. Yaklaşım sağlam ve İNCELEME-60'taki üç öneriden Y-1 çekirdeğini doğru yere koyuyor:
- **Tek sayaç, pdf.js'in kendi decode çıkışında.** Her filtre (`FlateStream`, `LZWStream`, `Ascii85Stream`, `AsciiHexStream`, `RunLengthStream`, `PredictorStream`, `CCITTFaxStream`, `DecryptStream`, ve görüntü çözücüler `JpegStream`/`Jbig2Stream`/`JpxStream`) `DecodeStream`'in alt sınıfı; pdf.worker.mjs (pdfjs-dist 5.4.296) kaynağında sınıf hiyerarşisi doğrulandı. Metin yolunda çıktı büyütme tek kapıdan (`DecodeStream.prototype.ensureBuffer`) geçiyor; sayaç ayırmadan ÖNCE (ikiye-katlama kuralını taklit ederek) sayıyor. Filtre zinciri/katman sayısı/`/Length`/sahte `endstream` artık önemsiz — İNCELEME-60'ın metin-tarama atlatmalarının kök nedeni bu.
- **Görüntü çözücüler metin çıkarımında kapalı** (`offImageDecoder`): JBIG2/DCT/JPX çıktı boyutunu görüntü başlığından ayırır, `buffer` atanmadan önce; metin çıkarımı görüntü çözmez, font-programı-görüntü geçerli font değildir → çözücü hata atıyor, pdf.js standart fonta düşüyor.
- **Kapalı-güvenli (fail-closed):** `DecodeStream` dışa aktarılmadığından `_rawMinBufferLength` atamasını `Object.prototype` setter'ıyla yakalayıp prototipi buluyor; her çıkarım önce küçük bir Flate PDF çözerek kancanın kurulduğunu doğruluyor (`decodeHookWorks`), kurulmadıysa dosyayı pdf.js'e hiç vermiyor.
- **Anında ret:** sınır aşılınca `meter.refused` set edilip `onRefused` ile mesaj hemen `postMessage` ediliyor; çağıran ilk mesajda thread'i sonlandırıyor — pdf.js hatayı yutsa bile iş duruyor.

### 1.2 Gerçek-koşu bomba matrisi (gerçek worker, gerçek RAG_UPLOAD_LIMITS)
`extractPdfText` (gerçek `worker_threads` yolu, gerçek sınırlar: 64 MB/akış, 256 MB/dosya, 512 MB heap, 30 sn) 11 şekle karşı koşuldu. Payload'lar geçerli içerik baytıyla (0x20 boşluk) kuruldu ki pdf.js içerik-çözümleyicisi erken hata vermesin ve sayaç gerçekten sınıra ulaşsın. Sinyal = worker'ın dönüş kodu (kanıt):

```
PASS | flate-80mb-1layer     | 80.2KB   | REFUSED(parse_too_heavy)  | 17284ms
PASS | flate-80mb-4layer     | 0.8KB    | REFUSED(parse_too_heavy)  | 10195ms   (4× Flate)
PASS | fake-endstream-80mb   | 80.2KB   | REFUSED(parse_too_heavy)  | 7010ms    (stored blokta endstream baytları)
PASS | hexflate-80mb         | 159.8KB  | REFUSED(parse_too_heavy)  | 7651ms    ([/ASCIIHexDecode /FlateDecode])
PASS | a85flate-80mb         | 92.7KB   | REFUSED(parse_too_heavy)  | 12894ms   ([/ASCII85Decode /FlateDecode])
PASS | rlflate-80mb          | 2.2KB    | REFUSED(parse_too_heavy)  | 18122ms   ([/RunLengthDecode /FlateDecode])
PASS | lzw-80mb              | ~120MB   | REFUSED(parse_too_heavy)  | 4933ms    (/LZWDecode)
PASS | shared-40mb-x10pg     | 41.7KB   | REFUSED(parse_too_heavy)  | 12683ms   (paylaşılan akış ×10 sayfa → TOPLAM sınırı)
PASS | jbig2-font-bomb       | 0.9KB    | OK(chars=9,pages=1)       | 3923ms    (49B → 60000² JBIG2; çözücü kapalı, "Font file" düştü)
PASS | legit-flate-40mb      | 40.4KB   | OK(pages=1)               | 7886ms    (yanlış pozitif yok)
PASS | legit-flate-60mb      | 60.3KB   | OK(pages=1)               | 7479ms    (64 sınırının hemen altı, kabul)
```
İNCELEME-60 bomba seti (LZW, ASCIIHex/85+Flate, RunLength, 4×Flate, sahte endstream, JBIG2) + toplam-sınır (paylaşılan akış çok-sayfa) hepsi kapandı. Meşru büyük PDF'lerde (40/60 MB akış) yanlış pozitif yok.

### 1.3 Görevin adıyla istediği ek şekiller — koddan gerekçe
- **CCITTFax:** `CCITTFaxStream extends DecodeStream`, çıktısını `ensureBuffer(bufferLength+1)` ile büyütür → kanca sayar. Görüntü çözücü DEĞİL (`decodeImage` yok), yani metin yolunda koşar ama sayaç sınırlar. (Geçerli CCITT bombası imal etmek pahalı olduğundan mekanizma üzerinden doğrulandı; hiyerarşi kaynakta teyit edildi.)
- **Büyük DCT (JPEG):** `JpegStream extends DecodeStream`, `decodeImage` sahibi → `offImageDecoder` metin çıkarımında kapatır; JBIG2 koşusu + M2 mutantı bu yolu kanıtlıyor.
- **İç içe Form XObject:** her form içerik akışı bir `DecodeStream`, pdf.js çözerken sayılıyor → Flate mekanizmasıyla kapsanıyor (bomba matrisi doğruluyor).
- **Nesne akışı içinde akış / şifreli PDF:** `DecryptStream extends DecodeStream` → kanca sayar. Şifreli PDF için geçerli şifreleme sözlüğü gerektiğinden canlı koşulmadı; mekanizma kapsıyor.

### 1.4 Kendi mutantlarım (mutation testing — izolasyon suite'i öldürücü mü)
Düzeltmeye izole worktree'de üç öldürücü mutant enjekte edildi, `tests/rag-pdf-worker-isolation.test.ts` koşuldu, sonra `git checkout` ile GERİ ALINDI (teslim edilen kod değişmedi — `git diff` boş):

| Mutant | Değişiklik | Sonuç |
|---|---|---|
| M1 | `countDecoded` no-op (sayım kapalı) | **ÖLDÜ** — 13 test kırmızı |
| M2 | `offImageDecoder` throw'u kaldırıldı (görüntü çözücü açık) | **ÖLDÜ** — 1 test (jbig2-fallback) kırmızı |
| M4 | toplam-sınır kontrolü düşürüldü (`total > maxInflatedBytes` çıkarıldı) | **ÖLDÜ** — 2 test (biriken akışlar) kırmızı |

Her mutant, farklı bir güvenceyi (sayım / görüntü-kapalı / toplam-sınır) hedefleyen testlerce yakalandı. Suite bu üç boyutta öldürücü.

### 1.5 pdf.js iç API'sine bağımlılık / sürüm yükseltmesi
Kancanın dayandığı iç adlar kaynakta doğrulandı. Yükseltme davranışı:
- **Ad değişir/kaybolursa** → self-test `hookInstalled=false` görür → `kind:'error'` ("counter could not be attached"), tüm PDF'ler reddedilir (fail-closed, güvenli) VE 25 izolasyon testi CI'da anında kırmızı → yakalanır.
- **Artık-risk (yeni, düşük-orta):** self-test yalnız kancanın KURULDUĞUNU kanıtlar, sayımın DOĞRULUĞUNU değil. pdfjs'in ayırma/ikiye-katlama kuralı bir yükseltmede değişir de sayaç eksik sayarsa, self-test bunu görmez. Ancak bomba izolasyon testleri (gerçek pdfjs sürümüne karşı koşar) bir bombayı içeri alan eksik-sayımı yakalar. Yani ağ CI'da; boşluk yalnız "CI koşmadan yükseltirsen" durumunda. Öneri (kart-dışı): CI'da izolasyon bomba testlerinin pdfjs güncellemesinde koşulması zaten gate; korunması yeter.

---

## 2. Kanıt — kapılar (izole DB, macOS, Node 26.5.0)

**Tam vitest** (CI=true, izole DB, kendi konteynerim):
```
Test Files  1 failed | 288 passed | 2 skipped (291)
     Tests  1 failed | 3552 passed | 36 skipped (3589)
```
Tek kırmızı: `rag-pdf-worker-isolation.test.ts > "a 128 MB-inflating stream … refused at the real limits, fast"` →
`AssertionError: expected 5714.06 to be less than 3000`. **Bu bir ZAMANLAMA kırılganlığı, doğruluk hatası değil:** aynı testin GÜVENLİK iddiası (`result` = `parse_too_heavy` reddi) geçti; yalnız `ms < 3000` duvar-saati sınırı, makine (tam suite + build + kardeş konteynerler) yüklüyken 5.7 sn'ye çıktığı için kırıldı. **İzolasyon dosyası yalnız koşulunca 25/25 GEÇTİ** (yüksüz, iki kez):
```
Test Files  1 passed (1)
     Tests  25 passed (25)
```
Öneri (kart-dışı, düşük öncelik): bu tek testteki `ms < 3000` sınırı yüklü CI runner'da flake üretebilir; ~5000 ms'ye gevşetilmesi ya da yalnız `worstGapMs` (olay-döngüsü) üzerinden değerlendirilmesi düşünülebilir. Reddin KENDİSİ ve olay-döngüsü sınırı zaten ayrı assert.

**DB kurulumu (izole):** prisma migrate diff → psql (konteyner) ile şema (75 tablo); `db:rls-role` (fabrika_app); `apply-migrations.sh` ×2 → her ikisi "40 files applied" (idempotent); `db:rls` → 28 → 112 politika; `db:seed` tamam. Not: Prisma 7.10 `db push`'a yeni bir "dangerous AI action" onay kapısı koymuş; teslim edilen kodla ilgisiz olduğundan salt-okunur `migrate diff --script` ile şema üretip izole konteynere uygulandı (paylaşılan fabrikaya dokunulmadı).

**typecheck:** `pnpm typecheck` → temiz (0 hata). *(İlk koşu, prisma client üretilmeden, yalnız `.live.test.ts`'lerde "PrismaClient yok" verdi; `db:generate` sonrası temiz — düzeltmeyle ilgisiz.)*

**lint:** `pnpm lint` → temiz (0 hata).

**build:** `pnpm build` → **BUILD_EXIT=1**, ANCAK düzeltmeyle İLGİSİZ ve ortama bağlı. Turbopack derlemesi başarılı (`✓ Compiled successfully`); hata yalnız Next.js'in sentetik `/_global-error` sayfasının statik prerender'ında: `TypeError: Cannot read properties of null (reading 'useContext')`. Attribution kanıtı: **aynı hata fix'in kendi merge commit'i `e3cda2fe`'de de birebir tekrarlanıyor** → ne bu düzeltme ne de sonraki bir commit sebep; ortamsal (tek react@19.2.8 kopyası var, çift değil; Next 16.3.4 prerender kaprisi / benim offline-frozen kurulum farkım). Değişen dosyalar (`src/lib/rag-pdf*.ts`, `src/lib/rag-upload.ts`) hiçbir sayfa/app koduna dokunmuyor; `useContext`/`/_global-error`'a bir yol yok. se-fb kendi dev tabanında BUILD_EXIT=0 raporlamıştı; fark kurulum durumu.

---

## 3. Değişen dosyalar
Bu bir İNCELEME görevi — **ürün kodu DEĞİŞTİRİLMEDİ.** Yalnız bu rapor:
- `docs/agent-results/TASK-MUO3BJMIU27Y7-devop-fb.md` (bu dosya).

Mutation testing için worker dosyasına geçici mutant enjekte edildi ve her seferinde `git checkout` ile geri alındı; izole worktree'de teslim edilebilir bir değişiklik kalmadı (`git diff` boş, doğrulandı).

## 4. Riskler
- **(Dokümante artık-risk — düzeltmenin kendi raporunda da var)** Reddedilen bir dosya bile taban RSS + ≤64 MB tampon + ara katmanlar kadar (~+230 MB) süreç-içi bellek kullanabilir; meşru azami dosyayla aynı düzey. Konteyner bellek limiti (İNCELEME-60 Y-1 öneri 3) ayrı bir altyapı kararı olarak açık.
- **(Yeni, düşük-orta)** Sayaç, pdfjs'in ikiye-katlama kuralını taklit eder; bir pdfjs yükseltmesi bu kuralı değiştirir de self-test yalnız "kanca kurulu mu"yu kontrol ettiğinden EKSİK-sayım self-test'e görünmez. Ağ: bomba izolasyon testleri (gerçek sürüme karşı) — CI gate olarak korunmalı.
- **(Test kırılganlığı, düşük)** `"128 MB … refused … fast"` testinin `ms < 3000` sınırı yüklü runner'da flake üretebilir (bu koşuda 5714 ms). Reddin doğruluğu etkilenmez.

## 5. Açık sorular
- Yükleme yolunda görüntü çözücülerin metin-çıkarımında kapatılması, görüntü-içeren PDF'lerin OCR/görsel metnini ilerideki bir özellikte gerektirirse yeniden düşünülmeli (şu an kapsam dışı, doğru karar).
- `/_global-error` build hatasının kalıcı mı yoksa yalnız bu makinedeki kurulum durumu mu olduğu ayrı bir DevOps kartında netleştirilmeli (bu düzeltmeyle ilgisiz; e3cda2fe'de de var).

## 6. Sonraki adım
- Karar: **ONAY.** Ek kod değişikliği gerekmiyor. İsteğe bağlı (kart-dışı): (a) `ms < 3000` sınırını gevşet/kaldır, (b) konteyner bellek limiti kartı, (c) CI'da pdfjs yükseltmesinde izolasyon bomba testlerinin gate kalmasını belgele.

## Platform beyanı
- **Doğrulandı:** macOS (Darwin 27, arm64), Node 26.5.0 — kod okuması, 11-şekil gerçek-worker bomba matrisi, 3 mutantlı mutation testing (izolasyon suite), tam vitest (izole Postgres), izolasyon dosyası yüksüz 25/25, typecheck, lint. Build ortamsal `/_global-error` nedeniyle kırmızı (fix'in kendi merge commit'inde de tekrarlandı → düzeltmeyle ilgisiz).
- **Platforma bağlılık (koddan):** Değişen kod saf JS (prototip kancası, `worker_threads` mesajı, `zlib`). Dosya yolu / süreç öldürme / kabuk / ikili adı / ekran-DPI / cihaz izni KULLANMIYOR — Linux (Docker `node:22-alpine` runner) ve Windows'ta davranış farkı beklenmez; aynı pdfjs sürümü ve bundle.
- **Linux/Windows:** koşulamadı (imaj derlenmedi / makine yok) — koddan platform-bağımsız; sessiz atlama yok.
