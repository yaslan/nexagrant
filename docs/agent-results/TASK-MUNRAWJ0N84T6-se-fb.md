# TASK-MUNRAWJ0N84T6 — PDF açılmış bayt sınırı: pdf.js'in kendi decode çıkışını sayan tek sayaç (se-fb)

**Durum:** TAMAM
**Dal:** `se-fb/munraw-pdf-inflate-cap` (dev `b8788951`'den; kod commit'i `fc21da97`), dev'e merge edildi, push YOK.
**Kaynak bulgu:** İNCELEME-60 Y-1 (devop-fb, `docs/agent-results/TASK-MUNOE1VLCETC2-devop-fb.md`). O incelemede bulgu yalnız kod okumasıyla konmuştu. Burada gerçek koşuyla doğrulandı, düzeltildi ve yeniden test edildi.

## 1. Ne yapıldı

### Bulgu gerçek koşuyla doğrulandı (düzeltme öncesi)
`362cbb82`'deki `inflateCheck`, pdf.js başlamadan dosyayı metin olarak tarıyordu: `stream` ile ilk `endstream` arasını, yalnız zlib başlığıyla başlıyorsa açıyordu. Ürettiğim beş şekil bu taramadan hiç sayılmadan geçti. Gerçek worker dosyası gerçek sınırlarla koşuldu (64 MB/akış, 256 MB/dosya, 512 MB heap, 30 sn). RSS, ana thread'den 20 ms'de bir örneklendi (`scratchpad/bomb-rss.mjs`):

| Dosya (boyut) | Şekil | Eski kod sonucu | RSS artışı |
|---|---|---|---|
| `flate4-1g.pdf` (**852 B**) | `[/FlateDecode ×4]`, 1 GB | `ok` | **+2141 MB** |
| `fake-endstream-1g.pdf` (1,0 MB) | Flate; stored blokta `endstream` baytları | `ok` | **+3159 MB** |
| `hexflate-1g.pdf` (2,0 MB) | `[/ASCIIHexDecode /FlateDecode]` | `ok` | **+2138 MB** |
| `lzw-1.3g.pdf` (0,97 MB) | `/LZWDecode`, 1,33 GB | yalnız 30 sn deadline | **+2601 MB** |
| `jbig2-font-450m.pdf` (~1 KB) | font programı `/JBIG2Decode`, 60000² sayfa | `ok` | **+961 MB** |

Olay döngüsü her durumda döndü (worstGap ≤ 66 ms), yani B-1' kapalı kalıyor. Asıl sorun bellekti: birkaç KB'lık dosya web sürecinin RSS'ini GB'larca şişiriyordu.

**Önem: Orta → Yüksek arası.** Etki süreç düzeyinde bellek tükenmesi (aynı süreçte bütün kiracılar etkilenir). İstismar için platform-admin yetkisi gerekiyor. Bu, istismar edilebilirliği düşürüyor ama sıfırlamıyor: ele geçirilmiş bir admin hesabı ya da admin'e "yükle" diye verilmiş bir dosya yeter.

### Düzeltme (`src/lib/rag-pdf.worker.ts`)
- **Tek sayaç, pdf.js'in kendi decode çıkışı üzerinde.** pdf.js'in bütün filtreleri (Flate, LZW, ASCII85, ASCIIHex, RunLength, Predictor, Decrypt, CCITT, DCT, JBIG2, JPX) iç sınıf `DecodeStream`'in alt sınıfları. Hepsi çıktısını `DecodeStream.prototype.ensureBuffer(requested)` ile büyütüyor. `ensureBuffer`, pdf.js belleği **ayırmadan önce** çağrılacak kapasiteyi (pdf.js'in ikiye katlama kuralı) sayan bir sarmalayıcıyla değiştirildi. Görüntü çözücüler `buffer`'ı doğrudan atıyor; onlar için `buffer`'a prototip üzerinde bir erişimci konuldu ve o da sayıyor. Filtre zinciri, katman sayısı, `/Length` ya da sahte `endstream` artık önemli değil: sayılan şey pdf.js'in gerçekten çözdüğü.
- **Sınır semantiği korundu:** `maxStreamInflatedMb` (tek akış nesnesi) ve `maxInflatedMb` (çıkarımın tamamı). Birden çok sayfanın paylaştığı akış, pdf.js onu her sayfada yeniden çözdüğü için sayfa başına bir kez sayılıyor. Bu Y-2'yi de bayt tarafında sınırlıyor.
- **Güvenli iptal:** sınır aşılınca sayaç pdf.js'in içinde istisna atıyor ve reddi hemen `postMessage` ile gönderiyor. Çağıran taraf ilk mesajda thread'i sonlandırıyor (mevcut `settle()` yolu). Yani pdf.js hatayı yutup devam etse bile iş duruyor. Sonraki her `ensureBuffer` de reddetmeye devam ediyor. Kullanıcı mevcut 413 `parse_too_heavy` iletisini görüyor ("sıkıştırılmış içerik çok büyük … Hiçbir şey kaydedilmedi", tr/en mevcut, değişmedi).
- **Görüntü çözücüler metin çıkarımında kapalı:** JBIG2, DCT ve JPX çıktı boyutunu görüntü başlığından alıyor. 49 baytlık bir JBIG2 akışı 450 MB'lık bitmap'i, `buffer` atanıp sayılmadan önce ayırtıyordu. Metin çıkarımı hiçbir görüntüyü çözmeye ihtiyaç duymaz: pdf.js görüntüleri atlar, bunlara tek ulaşma yolu font programıdır ve görüntü olan bir font programı zaten geçerli bir font değildir. Bu yüzden sayaç etkinken `decodeImage` hata atıyor, pdf.js de standart fonta düşüyor. Metin yine çıkıyor.
- **`DecodeStream`'e erişim:** pdf.js bu sınıfı dışa aktarmıyor. İlk örneğin kurucusu `this._rawMinBufferLength = …` atıyor. `Object.prototype` üzerindeki tek seferlik bir setter bu atamayı yakalıyor, prototipi buluyor ve hemen kendini siliyor. Bu yalnız worker thread'inde oluyor; `rag-pdf-extract.ts` worker'ı `import type` ile alıyor, web süreci etkilenmiyor.
- **Kapalı-güvenli (fail-closed):** pdfjs-dist sürüm yükseltmesinde bu özellik adı değişirse kanca kurulmaz. Bu yüzden her çıkarım önce küçük bir Flate PDF'i çözüyor. Kanca kurulmadıysa kullanıcının dosyası pdf.js'e hiç verilmiyor (`kind: 'error'`, "decoded-bytes counter could not be attached"). Mutant N8 bunu kanıtlıyor.
- Eski metin taraması `inflateCheck` / `inflatedBytes` / `looksLikeZlib` kaldırıldı. Deadline ve heap sınırı olduğu gibi duruyor.

### Testler (`tests/rag-pdf-worker-isolation.test.ts`, `tests/helpers/synthetic-pdf.ts`)
`flatePdf` genelleştirildi: `streamPdf` (keyfi filtre ve sözlük), `fontFilePdf` eklendi. Kodlayıcılar eklendi: `asciiHexEncode`, `ascii85Encode`, `runLengthEncode`, LZW (`lzwLiteral`, `lzwRun`; pdf.js'in kod genişliği kuralıyla birebir), `zlibWithStoredEndstream`, `jbig2BlankPage`. Yeni testler (11):
- LZW; `[/ASCIIHexDecode /FlateDecode]`; `[/ASCII85Decode /FlateDecode]`; `/RunLengthDecode`; `[/FlateDecode ×4]`; sıkıştırılmış veride `endstream` baytları → hepsi `parse_too_heavy`.
- LZW akışları akış başına sınırın altında kalıp dosya toplamında aşıyor → `maxInflatedMb`.
- 1,33 GB'lık LZW bombası (~1 MB dosya), gerçek sınırlarla < 5 sn'de reddediliyor; olay döngüsü dönüyor (worstGap < 500 ms).
- Font programındaki bomba (pdf.js hatayı yutup yedek fonta düşüyor) yine reddediliyor.
- Font programındaki JBIG2 (60000²) çözülmüyor, metin çıkıyor.
- Aynı beş filtre zinciriyle kodlanmış **meşru metin**, düz Flate referansıyla **birebir aynı** metni veriyor.

## 2. Kanıt

### RED (düzeltme öncesi, yeni testler eski kodda)
```
     × LZWDecode 1899ms
     × [/ASCIIHexDecode /FlateDecode] 1022ms
     × [/ASCII85Decode /FlateDecode] 773ms
     × /RunLengthDecode 655ms
     × [/FlateDecode /FlateDecode /FlateDecode /FlateDecode] 714ms
     × `endstream` bytes inside the compressed data do not end the count 893ms
     × LZW streams under the per-stream cap that add up past maxInflatedMb 4392ms
AssertionError: expected { pages: 1, text: '' } to match object { code: 'parse_too_heavy', … }
```

### Düzeltme sonrası, aynı dosyalar, gerçek sınırlar (kaynak worker)
```
lzw-1.3g          parse_too_heavy  ms=3834  rssPeak +231MB  worstGapMs=49
hexflate-1g       parse_too_heavy  ms=1957  rssPeak +228MB  worstGapMs=35
fake-endstream-1g parse_too_heavy  ms=2192  rssPeak +227MB  worstGapMs=29
flate4-1g         parse_too_heavy  ms=1436  rssPeak +233MB  worstGapMs=26
jbig2-font-450m   ok (9 chars)     ms=1067  rssPeak +100MB  (eski: +961MB)
ok-small (3 sf.)  ok               rssPeak +109MB   ← thread + pdf.js taban maliyeti
ok-60mb-stream    ok               rssPeak +224MB   ← sınırın altındaki meşru azami akış
```
Bombalar artık meşru azami dosyayla aynı bellek düzeyinde kalıyor (taban ~+109 MB, üstüne ≤ 64 MB tampon ve ara katmanlar).

### Standalone build (Docker runner'ın koştuğu derlenmiş chunk)
`pnpm build` → `BUILD_EXIT=0`. `.next/standalone`, repo dışına kopyalandı (`scratchpad/iso/sa`), derlenmiş `[worker thread]-src_lib_rag-pdf_worker_ts_13k1dmb._.js` aynı dosyalarla koşuldu:
```
lzw-1.3g:          parse_too_heavy ms=2136 +210MB
flate4-1g:         parse_too_heavy ms=440  +206MB
fake-endstream-1g: parse_too_heavy ms=463  +206MB
hexflate-1g:       parse_too_heavy ms=464  +206MB
jbig2-font-450m:   ok pages=1 chars=9     +80MB
ok-small:          ok pages=3 chars=16822 +82MB
```
`ok` sonuçları, kancanın ve öz-testin bundle edilmiş pdf.js'te de kurulduğunu gösteriyor. Kurulmasaydı her çıkarım `error` dönerdi.

### Meşru gerçek PDF'ler (makinedeki 4 PDF; yalnız sayılar, içerik basılmadı)
| | boyut | eski | yeni |
|---|---|---|---|
| gerçek-1 | 13,0 MB | ok 32 sf. 24788 kr. | ok 32 sf. 24788 kr. (RSS +287 → +139 MB) |
| gerçek-2 | 20,9 MB | **parse_too_heavy (yanlış ret)** | **ok 17 sf. 1148 kr.** |
| gerçek-3 | 3,7 MB | ok 7 sf. 35474 kr. | ok 7 sf. 35474 kr. |
| gerçek-4 | 3,2 MB | ok 12 sf. 43843 kr. | ok 12 sf. 43843 kr. |

Yan kazanım: eski ön-tarama pdf.js'in metin modunda hiç çözmediği görüntü akışlarını da açıyordu. Bu yüzden görüntü ağırlıklı meşru bir PDF'i (gerçek-2) reddediyordu; yeni kod onu işliyor. Metin çıktıları karakter sayısı düzeyinde birebir aynı.

### Performans (erişimci sıcak yolda mı?)
`buffer` erişimcisi pdf.js'in bayt bayt okuma yolunda (`getByte`) çalışıyor. İNCELEME-52 şeklinde (20 sayfa × 100 000 operatör, Flate) süreç CPU süresi, dönüşümlü 4 koşunun ortalamasında eski 13,97 sn, yeni 14,01 sn: fark gürültü içinde. Duvar-saati ölçümü makine yükü yüzünden kullanılamadı (load avg 17–43).

### Mutasyon (kaynak worker, `tests/rag-pdf-worker-isolation.test.ts`; her mutanttan sonra dosya geri yüklendi, `cmp` → RESTORED)
| # | Mutant | Sonuç |
|---|---|---|
| N1 | `countDecoded` no-op | ÖLDÜ (12) |
| N2 | akış başına sınır yok | ÖLDÜ (10) |
| N3 | dosya toplamı sınırı yok | ÖLDÜ (2) |
| N4 | akış sınırı `>=` (off-by-one) | ÖLDÜ (1: "exactly at maxStreamInflatedMb") |
| N5 | `ensureBuffer` ön-sayımı yok | hayatta — setter aynı büyütmeyi sayıyor (yedek katman) |
| N6 | setter sayımı yok | hayatta — ön-sayım aynı büyütmeyi sayıyor (yedek katman) |
| N7 | N5+N6 | ÖLDÜ (12) |
| N8 | kanca özellik adı değişti (pdfjs yükseltmesi) | ÖLDÜ (21) — 14 yerde "counter could not be attached": **kapalı-güvenli** |
| N9 | N8 + öz-test atlandı | ÖLDÜ (12) — bombalar sessizce geçerdi; öz-testin gerekliliği |
| N10 | görüntü çözücüler kapatılmadı | ÖLDÜ (1: JBIG2) |
| N11 | ilk throw'dan sonra ret yapışkan değil | hayatta — yedek katman |
| N12 | ret anında gönderilmiyor | hayatta tek başına |
| N13 | `catch` reddi eşlemiyor | hayatta tek başına |
| N14 | `getText` dilimi sonrası ret kontrolü yok | hayatta tek başına |
| N15 | sayaç hiç kurulmuyor | ÖLDÜ (12) |
| C1 | N12+N13 | ÖLDÜ (12) |
| C3 | N11+N12+N13+N14 | ÖLDÜ (12) |
| C2 | N12+N14 | ilk koşuda hayatta kaldı → **font-programı bombası testi eklendi** (pdf.js hatayı yutuyor) → ÖLDÜ (1) |

Hayatta kalan tekil mutantların hepsi birbirini yedekleyen katmanlar ve her yedek çifti bileşik mutantla öldürüldü. Tek istisna N5, çünkü ön-sayımın farkı yalnız bellekte görünüyor: ayırmadan önce reddetmek, aşımı en fazla bir ikiye katlamayla sınırlıyor. Bu fark birim testle değil, yukarıdaki RSS ölçümüyle görülüyor.

### Kapılar (dal, macOS, Node 26.5.0)
```
pnpm typecheck → TC_EXIT=0
pnpm lint      → LINT_EXIT=0
pnpm build     → BUILD_EXIT=0
hedef 4 dosya (isolation, real-parse, ingest-partial, admin-upload-authz): Tests 71 passed (71) (font-bomba testi öncesi); isolation dosyası son hâli 25/25
Tam vitest, izole DB + CI env (AUTH_SECRET fixture, CI=true, JSON reporter):
 Test Files  282 passed | 2 skipped (284)
      Tests  3421 passed | 30 skipped (3451)
VITEST_EXIT=0
scripts/check-live-skips.ts → LIVESKIP_EXIT=0 (atlananlar izinli: MinIO/OpenAI gerektiren canlı testler)
```
İzole DB: kendi konteynerim `sefb-raw-pg` (pgvector/pgvector:pg16, 127.0.0.1:55731). CI sırası uygulandı: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied" ×2) → `db:rls` (0 → 112 politika) → `db:seed`. Hostta `psql` olmadığından `PSQL=` ile konteyner içindeki psql kullanıldı. Paylaşılan `fabrika` :5433'e bağlanılmadı, yazılmadı. İlk tam koşu DB'siz 43 kırmızı verdi; hepsi `DATABASE_URL` yokluğundan (billing/plan/live), PDF ile ilgisiz. İzole DB ile 0.

Ortam notu: worktree'de `node_modules` symlink'iyle `next build` Turbopack paniği veriyor ("Symlink [project]/node_modules … points out of the filesystem root"). `pnpm install --frozen-lockfile --offline` ile gerçek kurulum yapınca build yeşil oldu.

## 3. Değişen dosyalar
- `src/lib/rag-pdf.worker.ts`: `inflateCheck` kaldırıldı; decode sayacı, `DecodeStream` kancası, görüntü çözücü kapatma, öz-test ve anında ret mesajı eklendi.
- `src/lib/rag-pdf-extract.ts`, `src/lib/rag-upload.ts`: yalnız yorumlar (sınırın artık nerede ve nasıl sayıldığı).
- `tests/helpers/synthetic-pdf.ts`: `streamPdf`, `fontFilePdf` ve kodlayıcılar eklendi; `flatePdf` N katmana genelleştirildi (mevcut çağrılar değişmedi).
- `tests/rag-pdf-worker-isolation.test.ts`: 11 yeni test (dosya 14 → 25).
- `docs/agent-results/TASK-MUNRAWJ0N84T6-se-fb.md`: bu rapor.

## 4. Riskler
- **pdf.js iç API'sine bağımlılık:** kanca `DecodeStream`'in iç adlarına dayanıyor (`_rawMinBufferLength`, `ensureBuffer`, `buffer`, `minBufferLength`, `decodeImage`). Ad değişirse sonuç kapalı-güvenli (N8: her yükleme hata verir, bomba geçmez). Ama bir pdfjs-dist yükseltmesi bütün PDF yüklemelerini kırabilir; CI’daki isolation testleri (25) bunu hemen yakalar. pdfjs-dist 5.4.296 sürümüne pdf-parse 2.4.5 tam sürümle sabitliyor.
- **`buffer` erişimcisinin yan etkisi:** yalnız worker thread'inde ve yalnız `DecodeStream.prototype` üzerinde. Ölçülen CPU farkı yok.
- **Sayılan şey ayrılan kapasite:** ikiye katlama yüzünden bu, çözülen baytın en çok 2 katı. 32 MB'a kadar çözülen her meşru akış kesin kabul ediliyor; 60 MB'lık akış da kabul edildi. Toplamda paylaşılan akışlar sayfa başına sayılıyor, yani ağır bir form XObject'i yüzlerce sayfada tekrar eden meşru bir belge 256 MB toplamına takılabilir. Denenen 4 gerçek PDF'te bu olmadı.
- **İzin verilen üst sınır hâlâ süreç içi:** reddedilen bir dosya bile taban (~110 MB) + ≤ 64 MB tampon + ara katmanlar kadar, yani toplamda ~+230 MB RSS kullanabiliyor. Bu, meşru azami dosyayla aynı düzey. Container bellek limiti (Y-1 öneri 3) ayrı bir altyapı kararı olarak duruyor.

## 5. Açık sorular
- Y-1 öneri 3 (runner container'ına bellek limiti ve OOM uyarısı) ile O-3 (CI'da standalone worker duman adımı) bu kartın kapsamında değildi. Standalone dumanı bu raporda elle koşuldu. CI adımı için ayrı bir kart önerilir: aynı `bomb-rss` yaklaşımı derlenmiş chunk'a karşı koşulabilir.

## 6. Sonraki adım
- Bağımsız inceleme (crw-fb/devop-fb): özellikle kanca yaklaşımı ve bir pdfjs-dist yükseltmesinde izlenecek yol.
- İsteğe bağlı: `scratchpad/bomb-rss.mjs` benzeri bir RSS dumanını standalone build sonrasına CI adımı olarak eklemek.

## Platform beyanı
- **Doğrulandı:** macOS (Darwin 27, arm64), Node 26.5.0: birim ve tam vitest (izole Postgres), tsc, lint, `next build`, repo dışına kopyalanmış standalone chunk'ta bomba ve meşru dosya koşuları.
- **Linux (Docker `node:22-alpine` runner):** koşulamadı, Docker imajını bu kartta derlemedim. Koddan beklenen: değişen kod saf JS (prototip kancası, `worker_threads` mesajı, `zlib.deflateSync`). Dosya yolu, süreç öldürme ya da kabuk kullanmıyor; pdf.js aynı sürüm ve aynı bundle. Node 22'de `Object.defineProperty`/`WeakMap`/`ArrayBuffer.isView` farksız. Standalone chunk'ın Linux'ta aynı davranması beklenir.
- **Windows:** koşulamadı, makine yok. Platforma bağlı dal yok.
