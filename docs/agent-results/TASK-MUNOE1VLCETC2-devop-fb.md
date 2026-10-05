# TASK-MUNOE1VLCETC2 — İNCELEME-60 (devop-fb): PDF ayrıştırma worker düzeltmesi (362cbb82)

**Durum:** TAMAM
**Karar:** ONAY. Asıl bulgu (İNCELEME-52 B-1': bir PDF sunucunun event loop'unu kilitliyordu) kapandı. Y-1 için ayrı bir takip kartı öneriyorum; merge'ü engellemiyor.

- İncelenen: `362cbb82` (TASK-MULQL8QB679LQ, cs-fb). Dal `dev` @ `480326f8`. Commit'ten sonra `rag-pdf-extract.ts`, `rag-pdf.worker.ts`, `route.ts`, `rag.ts` ve `rag-upload.ts` dosyalarına dokunan başka commit yok (`git log 362cbb82..dev -- <dosyalar>` boş döndü).
- Worktree: `scratchpad/wt60` (`git worktree add --detach … dev`). Kaynak kodda kalıcı değişiklik yapmadım: mutantların hepsi geri alındı, `git status --short` boş.
- Kapsam: kodu okudum ve reponun MEVCUT testlerini koştum. Yeni saldırı PDF'i ya da dosyası ÜRETİLMEDİ. Kullandığım tek girdi, reponun kendi `syntheticPdf()` yardımcısıyla üretilen 2 sayfalık zararsız bir PDF oldu (standalone duman testi).
- DB: Hiçbir teste DB gerekmedi (hepsi mock'lu ya da saf). Paylaşılan DB'ye yazan canlı test (`*.live.test.ts`) koşulmadı.

## 1. Ne yapıldı / bulgular

### Kod okuması

**Thread yaşam döngüsü (`src/lib/rag-pdf-extract.ts:83-122`)** — doğru.
- `settle()` idempotent (`settled` bayrağı). Her yol (`message` / `error` / `exit` / deadline) `clearTimeout` ve `worker.terminate().then(fn, fn)` üzerinden geçiyor. Yani cevap, thread gittikten sonra dönüyor. Terminate reddedilse de cevap dönüyor.
- Yarışlar:
  - deadline ile `message` aynı anda gelirse ilk gelen kazanır, ikincisi yok sayılır.
  - `error` gelip ardından `exit` gelirse `error` kazanır.
  - Zaten çıkmış bir thread'de `terminate()` hemen resolve olur.
  - `new Worker` senkron olarak atarsa executor içinden reject olur. `deadline` henüz kurulmadığı için sızan timer kalmaz.
- `ERR_WORKER_OUT_OF_MEMORY` hatası `parse_too_heavy` olarak dönüyor. Diğer worker hataları olduğu gibi yukarı iletiliyor.

**Eşzamanlılık kilidi (`:57-67`)** — doğru.
- `queue = run.catch(() => undefined)`: bir iş reddedilince kilit serbest kalıyor.
- Senkron bir throw da `then` içinde rejection'a dönüşüyor.
- Zincir her çağrıda yeni promise ile değişiyor, eski halkalar GC'ye kalıyor. Sızıntı yok.
- Test kanıtı: aşağıdaki M9 ve M10 mutantları öldürüldü.

**Hata mesajında içerik sızıntısı** — dosya baytı sızmıyor.
- Worker yalnız `e.message` gönderiyor (`rag-pdf.worker.ts:163`).
- `PdfLimitError.detail` yalnız sayı taşıyor.
- pdf.js mesajı 500 yolunda istemciye dönüyor. Ayrıntı O-1'de.

**Route eşlemesi (`route.ts:104-114`)** — doğru.
- `PdfLimitError` (artık `parse_too_heavy` dahil) → 413 + `detail`.
- `NoExtractableTextError` → 422.
- Okunamayan PDF → 500 `upload_failed` (önceden de böyleydi).
- 400'ler (`bad_form`, `no_file`, `bad_kind`, `bad_title`) değişmedi.
- `parse_too_heavy`, `RAG_UPLOAD_ERRORS` listesinde var ve i18n anahtarı tr/en'e eklenmiş.

**Yetki** — değişmedi.
- Commit route'ta yalnız yorumu değiştiriyor. `requirePlatformAdminApi()` hâlâ body okunmadan önce çalışıyor (`route.ts:40-41`).
- `tests/admin-upload-authz.test.ts` bu commit'te değişmedi ve yeşil.

### Bulgular

**B — engelleyici bulgu yok.**

**Y-1 (orta, kod okumasına dayanıyor, çalıştırılarak doğrulanmadı): açılmış bayt sınırı yalnız "ilk katmanı zlib olan" ve metin olarak `stream…endstream` arasında bulunan akışları ölçüyor.**

`inflateCheck` (`rag-pdf.worker.ts:84-119`) `/Length` ve `/Filter` alanlarını okumuyor. Ölçüm şu yollarla atlanabilir:
- (a) Flate ilk katman değilse. Örnek: `[/ASCII85Decode /FlateDecode]` ya da `[/ASCIIHexDecode /FlateDecode]`. Bu durumda `looksLikeZlib` false döner ve akış 0 sayılır.
- (b) `LZWDecode` / `RunLengthDecode` hiç ölçülmüyor.
- (c) Sıkıştırılmış veri içinde `endstream` baytları geçebilir (deflate stored blokları mümkün kılar). O zaman tarayıcı yalnız öndeki kısmı ölçer. pdf.js ise `/Length` ile akışın tamamını çözer.

Bu yollarda geriye yalnız 30 sn süre sınırı ve 512 MB V8 heap sınırı kalıyor. Commit mesajının kendisi de şunu söylüyor: çözülmüş akışlar heap dışında typed array olarak tutulur, heap sınırı onları görmez. Worker aynı süreçte çalıştığı için 30 sn içinde büyük external bellek birikebilir ve bu doğrudan web sürecinin RSS'ine yazar.

Etkiyi azaltan etkenler:
- Route yalnız platform-admin'e açık.
- Deadline iş süresini sınırlıyor.
- Event loop kilidi (asıl B-1') kapandı.

Öneriler (biri yeter):
1. `/Filter` dizisini okuyup ASCII85/Hex/LZW katmanlarını da çözerek ölçmek ve `/Length` doğrudan sayıysa onu kullanmak.
2. Ayrıştırmayı `child_process` içinde ve süreç düzeyinde bellek sınırıyla koşturmak.
3. En azından runner container'ına bir bellek sınırı ve OOM uyarısı koymak.

Test boşluğu: mevcut testlerde bu üç şekil yok. Kapsam gereği girdi üretmedim.

**Y-2 (düşük, yazar da bildirdi):** Aynı akışı paylaşan N sayfa, N kat iş yapar ve bayt sınırına takılmaz. Bunu yalnız süre ve heap sınırı bağlıyor. Mevcut "20 sayfa, 100 000 operatör, paylaşılan akış" testi süre sınırı içinde geçiyor ve event loop dönmeye devam ediyor (`worstGapMs < 500`). Kabul edilebilir.

**O-1:** 500 yolu `message: errorMessage(error)` döndürüyor, yani istemci "PDF could not be read: <pdf.js mesajı>" görüyor. pdf.js mesajları dosyadan gelen token'lar içerebilir (ör. filtre adı), ama dosya baytı dökülmüyor. Mesaj yalnız dosyayı yükleyen admin'e gidiyor ve bu davranış commit'ten önce de vardı. Öneri: ayrıntıyı logla, istemciye genel bir mesaj dön.

**O-2 (test boşluğu):** `admin-upload-authz` testi `too_many_pages` / `too_many_chunks` / `over_budget` → 413 eşlemesini kontrol ediyor, `parse_too_heavy` → 413 eşlemesini kontrol etmiyor. Eşleme `instanceof` ile genel olduğu için şu an doğru (M14 öldü), ama kod adına özel bir dal eklenirse bu eşlemeyi kilitleyen bir test olmayacak.

**O-3 (test boşluğu):** `import 'pdf-parse/worker'` satırını silen M15 mutantı HAYATTA KALDI. Testler kaynaktan koşuyor ve orada canvas zaten çözülüyor. Bu satırın gerekliliği yalnız standalone build'de görünüyor. Aşağıda build ve standalone duman testiyle elle doğruladım. Öneri: CI'a standalone worker chunk'ı için bir duman adımı eklemek.

**O-4:** Kuyruk bekleme süresi sınırsız. N paralel yükleme en kötü durumda N×30 sn bekleyebilir ve her biri 20 MB'a kadar buffer tutar. İstemci bağlantıyı kopardığında kuyruktaki iş iptal olmuyor. `terminate()` hiç resolve olmazsa kuyruk kalıcı olarak kilitlenir. Node'da bunun olasılığı düşük: zlib çağrısı `maxOutputLength` ile sınırlı, pdf.js ise saf JS. Route admin'e özel olduğu için düşük risk.

**O-5:** Turbopack, çalışan JS chunk'ının yanında kullanılmayan bir `.next/server/assets/rag-pdf.worker.<hash>.ts` dosyası da çıkarıyor. Zararsız. Testlerde çıkan `MODULE_TYPELESS_PACKAGE_JSON` uyarısı da yalnız gürültü.

## 2. Kanıt

### Hedef testler (Node 26.5.0)
```
npx vitest run tests/rag-pdf-worker-isolation.test.ts tests/rag-pdf-real-parse.test.ts tests/rag-pdf-ingest-partial.test.ts tests/admin-upload-authz.test.ts
 Test Files  4 passed (4)
      Tests  61 passed (61)
```
Not: ilk koşuda `admin-upload-authz` şu hatayla düştü: `Cannot find module '.prisma/client/default'`. Sebebi temiz worktree'de Prisma client'ının üretilmemiş olması. `npx prisma generate` sonrası yeşil. CI'da bu adım var (`pnpm db:generate`).

### Geniş RAG kümesi
Kümeye şu dosyalar dahil: hedef 4 dosya, cordis-rag, rag-ingest-silent-failure, prompt-snapshots, server-action-rbac, admin-actions-authz, modules/ai-module-gate, src/modules/m2/server/actions.test, k1-daily-calls, cordis-import.
```
 Test Files  12 passed | 1 skipped (13)
      Tests  207 passed | 4 skipped (211)
```
Atlanan dosya `k1-daily-calls`: `describe.skipIf(!process.env.RUN_LIVE_ADAPTER_TESTS)` ile atlanıyor (canlı adaptör).

### typecheck / lint / build
```
pnpm typecheck  → $ tsc --noEmit   TC_EXIT=0
pnpm lint       → $ eslint         LINT_EXIT=0
pnpm build      → ▲ Next.js 16.3.4 (Turbopack) … BUILD_EXIT=0
```

### Standalone izleme
```
.next/standalone/node_modules/.pnpm/@napi-rs+canvas@0.1.80/node_modules/@napi-rs/canvas
.next/standalone/node_modules/.pnpm/@napi-rs+canvas-darwin-arm64@0.1.80/.../skia.darwin-arm64.node
.next/standalone/node_modules/.pnpm/pdf-parse@2.4.5
.next/standalone/.next/server/chunks/[worker thread]-src_lib_rag-pdf_worker_ts_13k1dmb._.js
.next/standalone/.next/server/assets/rag-pdf.worker.0jqanil37cxur.ts   (kullanılmıyor, O-5)
```
Route chunk'ı Worker'ı JS chunk modülüyle kuruyor (`e.r(828786)(t.Worker,{workerData:u,…resourceLimits:{maxOld…`). 828786 modülü şuna çözülüyor: `__dirname+"/[worker thread]-src_lib_rag-pdf_worker_ts_13k1dmb._.js"`.

Duman testi: standalone'u repo dışına kopyaladım (`scratchpad/iso60/sa`; üst dizinlerde node_modules yok) ve derlenmiş worker chunk'ını 2 sayfalık `syntheticPdf` ile koşturdum:
```
MSG {"kind":"ok","pages":2,"text":"Standalone smoke line one\nline two\n\nStandalone smoke line one\nline two"}
EXIT 0
```
Sonuç: standalone ortamda canvas ve pdf-parse yükleniyor, "DOMMatrix is not defined" hatası yok.

Docker notu: builder `node:22-alpine`. Lockfile'da `@napi-rs/canvas-linux-x64-musl@0.1.80` ve `linux-arm64-musl` girdileri var. Docker imajını bu incelemede derlemedim.

### Node 22 (CI `node-version: 22`)
- Belge: Node v22.18.0 sürüm notu, "Notable Changes": *"Type stripping is enabled by default — Node.js will be able to execute TypeScript files without additional configuration"* (https://nodejs.org/en/blog/release/v22.18.0). `setup-node` `22` değerini en güncel 22.x'e çözer, yani ≥22.18 gelir.
- Gerçek koşu: global Node'u değiştirmedim. `node@22` npm paketini `scratchpad/n22` içine kurdum:
```
v22.23.3
process.features.typescript → strip
<n22>/node node_modules/vitest/vitest.mjs run <hedef 4 dosya>
 Test Files  4 passed (4)
      Tests  61 passed (61)
```
- Sınır: 22.6 ile 22.17 arası sürümler worker'ı `.ts` olarak yükleyemez. CI bu sürümlere pinlenirse testler kırılır. Canlı ortam (Docker) derlenmiş JS chunk'ı koşturduğu için bundan etkilenmez.

### Mutasyon
Mutasyonlar yalnız kaynak kodda ve geçiciydi. Betik `scratchpad/mut60.sh`, hedef 4 test dosyasını koşturuyor. Her mutanttan sonra dosya geri yüklendi.

| # | Mutant | Sonuç | Öldüren test |
|---|---|---|---|
| M1 | deadline callback no-op | ÖLDÜ | past maxParseMs … parse_too_heavy |
| M2 | `resourceLimits` kaldırıldı | ÖLDÜ | out of heap kills the thread |
| M3 | OOM → parse_too_heavy eşlemesi kaldırıldı | ÖLDÜ | out of heap kills the thread |
| M4 | `inflateCheck` kapatıldı | ÖLDÜ | 4 decompression-bomb testi |
| M5 | dosya toplam sınırı yok sayıldı | ÖLDÜ | streams … add up past maxInflatedMb |
| M6 | akış başına sınır yok sayıldı | ÖLDÜ | 3 bomb testi |
| M7 | iç içe Flate takip edilmiyor (DEPTH=1) | ÖLDÜ | compressed twice |
| M8 | sınır off-by-one (`>=`) | ÖLDÜ | exactly at maxStreamInflatedMb |
| M9 | kilit serbest bırakılmıyor (`queue = run`) | ÖLDÜ | ilk hatadan sonraki testler zincirleme kırmızı |
| M10 | kilit yok | ÖLDÜ | parallel uploads … one at a time |
| M11 | thread çıkmadan cevap dönüyor | ÖLDÜ | parallel uploads (maxAlive=1) |
| M12 | `exit` handler kaldırıldı | ÖLDÜ | thread that dies … at once (30004 ms) |
| M13 | terminate hiç çağrılmıyor | ÖLDÜ | parallel uploads (maxAlive=1) |
| M14 | route 413 → 400 | ÖLDÜ | admin-upload-authz 413 testi |
| M15 | `import 'pdf-parse/worker'` kaldırıldı | **HAYATTA** | yok (O-3; build ve standalone duman testiyle elle doğrulandı) |

Not: betik M4, M6, M9 ve M16'yı (sağlama mutantı) ilk başta "SURVIVED" olarak etiketledi. Sebep, betiğin çıktıyı `head -6` ile kesmesi ve "Tests … failed" satırının kesilen kısımda kalmasıydı. Aynı çıktıdaki `×` satırları bu mutantların öldüğünü gösteriyor. Tabloda gerçek sonuç var.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNOE1VLCETC2-devop-fb.md` (yalnız bu rapor). Kaynak kod değişmedi.

## 4. Riskler
- Y-1: açılmış bayt sınırı atlanabiliyor ve typed-array belleği süreç düzeyinde sınırsız. Pratikte bağlayan tek şey 30 sn deadline.
- CI Node sürümü 22.18'in altına pinlenirse worker testleri kırılır.

## 5. Açık sorular
- Y-1 için hangi yol tercih edilecek: filtre zincirini ölçmek, child_process ile süreç sınırı ya da container bellek limiti? Bu bir ürün/altyapı kararı.

## 6. Sonraki adım
- Y-1 için takip kartı (öneri: cs-fb). Kart ayrıca O-2 (`parse_too_heavy` 413 testi) ve O-3'ü (CI'da standalone worker duman adımı) kapsayabilir.

## Platform beyanı
- **Doğrulandı:** macOS (Darwin 27, arm64). Testler Node 26.5.0 ve Node 22.23.3 ile, build Node 26 ile koşuldu.
- **Linux (Docker `node:22-alpine`):** koşulamadı, bu incelemede Docker imajını derlemedim. Koddan beklenen:
  - `worker_threads`, `resourceLimits` ve `terminate` platformdan bağımsız.
  - Standalone'daki canvas ikilisi build'in yapıldığı platforma göre izleniyor. Alpine builder'da `canvas-linux-*-musl` gelir; lockfile'da bu girdiler var.
  - Mac'te üretilen bir standalone'u Linux'a taşımak çalışmaz (darwin ikilisi). Dockerfile zaten imaj içinde derliyor.
- **Windows:** koşulamadı, Windows makinesi yok. Kodda yol ya da süreç öldürmeye bağlı platform dalı yok; `new URL(..., import.meta.url)` platformdan bağımsız.
