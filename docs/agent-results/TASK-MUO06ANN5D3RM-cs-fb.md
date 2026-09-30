# TASK-MUO06ANN5D3RM — FB TAKİP (İNCELEME-78 Y-1): CSP'siz 404'ler — cs-fb

**Durum:** TAMAM
**Dal:** `cs-fb/muo06a-csp-404` (dev `413aca46`'dan), ayrı worktree. Kod commit'i `80a57df1`, rapor `a9352e20`; dev'e `3eb40805` olarak merge edildi, **push yok**.
**DB:** Kendi konteynerim `csfb06-pg` (127.0.0.1:55606, :5433'ün salt-okunur dump'ı + şema farkı yalnız bu DB'ye). Paylaşılan :5433'e yazılmadı.
**Platform beyanı:** Doğrulama **macOS'ta** yapıldı (Darwin 27, arm64, Node 26.5, standalone `next start`, Chromium headless-shell 1243). **Linux** (prod Docker `node:22-alpine`, CI Node 22) koşulamadı: bu makinede yok. Koddan değerlendirme: değişiklik yalnız regex ve `headers()` üretimi. Bilerek Node 22'de olmayan regex modifier'ı (`(?-i:…)`) kullanılmadı. `readdirSync({recursive, withFileTypes})` + `parentPath` Node ≥20.12'de var. **Windows** koşulamadı, makine yok. Koddan: `servedStaticFiles` yolu `path.sep` ile bölüp `/` ile birleştiriyor, bu yüzden liste Windows'ta da `/logo.png` biçiminde çıkar.

## 1. Ne yapıldı

1. **Baseline ölçüldü** (dev `413aca46`, build + `next start` :3606). Baseline matrisinde uzantılı ya da `api`/`_next`/`_vercel` önekli, arkasında dosya olmayan 13 yol Next'in uygulama 404'ünü (19–32 `<script>`) **CSP'siz** döndürüyordu: `/yok.png`, `/x.js`, `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt`, `/fonts/x.woff2`, `/a/b/c.css`, `/apifoo`, `/api.html`, `/api-docs`, `/api.png`, `/_nextfoo`, `/_vercel/x`. Ara build'de (`_next` henüz kapsam dışıyken) `/_next/yok`, `/_next/yok.js`, `/_next` ve `/_NEXT/x.js` da aynı durumdaydı.
2. **`src/lib/security-headers.ts`:**
   - `STATIC_FILE_EXTENSIONS`: matcher'daki uzantı listesinin tek kaynağı.
   - `STATIC_FILE_CONTENT_SECURITY_POLICY`: `default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. script-src yok. report-uri de bilerek yok: her ziyaret kendi engellenen script'lerini raporlar ve raporlama ucunun 300/dk global bütçesini tüketirdi.
   - `staticFileNotFoundSource(servedFiles)`: next.config header kaynağını üretir.
     - Kapsadığı yollar: statik uzantılı her yol, `/_next/*` ve `/_vercel/*`.
     - Hariç tuttuğu yollar: `api/`, `_next/static/`, `_next/image` ve gerçekte var olan dosyalar (kaçışlı).
3. **`next.config.ts`:** `servedStaticFiles()` build anında `public/` altındaki dosyaları ve `src/app` kökündeki Next metadata dosyalarını (`favicon.ico` vb.) okuyor. Yeni header kuralı `/api/:path*`'ten sonra, accept-invite'tan önce ekleniyor.
4. **`src/proxy.ts` matcher:** `(?!api|_next|_vercel|…)` artık tam segment arıyor: `api(?:/|$)`, `_next(?:/|$)`, `_vercel(?:/|$)`. Böylece `/apifoo`, `/api-docs` ve `/_nextfoo` proxy'den geçip nonce CSP alıyor.
5. **Çakışma ölçüldü.** Header kaynakları büyük/küçük harfe duyarsız, matcher ise duyarlı. Bu yüzden `/yok.PNG` ve `/tr/yok.png` hem header kuralına uyuyor hem proxy'den geçiyor. Canlıda yanıtta **tek** CSP başlığı var, o da proxy'nin nonce'lu politikası (resolve-routes'ta middleware başlığı config başlığının yerine yazılıyor). Bu yüzden `tr|en` hariç tutulmadı; hariç tutulsaydı `/TR/yok.png` boşta kalırdı.
6. **Testler** (`src/lib/security-headers.test.ts`, +134 satır). Next'in kendi derleyicileri kullanıldı: proxy için `getMiddlewareMatchers`, header için router'ın seçenekleriyle `getPathMatch`.
   - 32 yollu "hangi politika" matrisi: nonce / api / static / none.
   - "Aynı yanıta iki CSP header kuralı yok" iddiası.
   - `public/` altındaki her dosya CSP'siz; aynı dizindeki var olmayan kardeşi static politikayı alıyor.
   - 17 uzantının hepsi kapsanıyor.
   - Matcher ile `STATIC_FILE_EXTENSIONS` eşit.
   - Statik politikanın içeriği pin'lendi.
   - Dosya adı kaçışı test edildi.
   - Matcher testlerine yeni pozitif ve negatif yollar eklendi.

## 2. Kanıt

### 2.1 curl matrisi (standalone `next start`, NODE_ENV=production)

Tam tablolar: `…-ekler/matrix-base.txt` (önce) ve `…-ekler/matrix-fix.txt` (sonra). Betik: `…-ekler/matrix.sh`. Seçilmiş satırlar (sonra):

```
PATH                        CODE CONTENT-TYPE              CSP CACHE-CONTROL                        CSP-HEAD
/logo.png                   200  image/png                 0   public, max-age=0
/favicon.ico                200  image/x-icon              0   public, max-age=0, must-revalidate
/_next/static/CHUNK         200  application/javascript;   0   public, max-age=31536000, immutabl
/yok.png                    404  text/html; charset=utf-8  1   private, no-cache, no-store, max-a   default-src 'none'; style-src 'self' 'un
/x.js                       404  text/html; charset=utf-8  1   …                                    default-src 'none'; style-src …
/robots.txt                 404  text/html                 1   …                                    default-src 'none'; …
/.well-known/security.txt   404  text/html                 1   …                                    default-src 'none'; …
/_next/yok                  404  text/html                 1   …                                    default-src 'none'; …
/_vercel/x                  404  text/html                 1   …                                    default-src 'none'; …
/api/yok                    404  text/html                 1   …                                    default-src 'none'; script-src 'unsafe-h   (API politikası)
/api/yok.png                404  text/html                 1   …                                    default-src 'none'; script-src 'unsafe-h
/apifoo                     307  →/tr/apifoo               1                                        default-src 'self'; script-src 'self' 'n   (nonce)
/api-docs, /_nextfoo        307                            1                                        nonce
/yok.PNG, /tr/yok.png       404                            1   (tek başlık)                         nonce
/TR/yok.png                 404                            1                                        default-src 'none' …
/_next/static/chunks/yok.js 404  text/plain                0   (HTML değil, betik yok)
/_next/image                400                            0
```

- **Gerçek dosyalar değişmedi.** Önce/sonra matris satırları `/logo.png`, `/next.svg`, `/favicon.ico` ve `/_next/static/<chunk>` için birebir aynı. Tam başlık listesinde CSP yok. `/_next/static` hâlâ `max-age=31536000, immutable`. `/logo.png` ETag ile `If-None-Match` → **304**.
- **Performans:** Bu yollarda proxy hâlâ çalışmıyor. Header kaynağı regex eşleşmesi 250.000 eşleşmede 25 ms tuttu, yani istek başına ~100 ns.
- Matristeki her yolda en fazla 1 `Content-Security-Policy` başlığı var. `/yok.PNG`, `/tr/yok.png` ve `/yok.png` için ayrı sayım yapıldı, her biri 1 çıktı.

### 2.2 Gerçek tarayıcı (Chromium 1243, `…-ekler/browser.mjs`)

| Yol | Durum | Sonuç |
|---|---|---|
| `/yok.png`, `/x.js`, `/robots.txt` | 404 | Next script'leri çalışmadı (32–33 CSP ihlali konsolda); parser'la eklenen `onerror` **çalışmadı** (`pwned=false`) |
| `/_next/yok` | 404 | "Sayfa Bulunamadı" görünür, script yok, `pwned=false` |
| `/apifoo`, `/tr/yok` | 404 | nonce CSP: sayfa hydrate oldu, `pwned=false` |
| `/logo.png` (CSP'siz gerçek dosya, kontrol) | 200 | `pwned=true`. Enjeksiyon düzeneğinin kendisi çalışıyor, yani yukarıdaki `false` sonuçları anlamlı |

### 2.3 Mutantlar: 16 mutanttan 15'i öldü (`…-ekler/mutants.txt`, `mutants.py`)

| # | Mutant | Sonuç |
|---|---|---|
| M1 | statik kural hiç eşleşmiyor | KILLED (17) |
| M2 | matcher `api(?:/|$)` → `api` | KILLED (6) |
| M3 | matcher `_next`/`_vercel` çapası geri | KILLED (3) |
| M4 | public/ dosyaları dışlanmıyor | KILLED (2) |
| M5 | favicon.ico dışlanmıyor | KILLED (1) |
| M6 | `_next/static/` dışlanmıyor | KILLED (2) |
| M7 | `api/` dışlanmıyor (çift politika) | KILLED (2) |
| M8 | `_next/image` dışlanmıyor | KILLED (1) |
| M9 | `_next`/`_vercel` uzantısız kapsam yok | KILLED (3) |
| M10 | statik politikaya script-src | KILLED |
| M11 | statik politikaya report-uri | KILLED |
| M12 | sabit listeden `map` düştü | KILLED (2) |
| M13 | matcher'dan `map` düştü | KILLED (2) |
| M14 | dosya adı kaçışsız | KILLED |
| M15 | frame-ancestors düştü | KILLED |
| M16 | kapsam regex'inin sonundaki `$` silindi | SURVIVED: **eşdeğer mutant**. path-to-regexp kaynağı zaten `(?:/)?$` ile bağlıyor |

Her mutanttan sonra dosya yedekten geri yüklendi. `git status` yalnız kendi 4 dosyamı gösterdi.

### 2.4 Kapılar (commit `80a57df1` içeriği)

| Kapı | Sonuç |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm i18n:check` | exit 0 |
| `pnpm build` | exit 0, `ƒ Proxy (Middleware)` |
| `npx vitest run` (tam, izole DB) | **exit 0**. 292 dosya geçti, 6 atlandı. **3689 test geçti, 0 başarısız**, 96 atlandı |

**Merge sonrası (dev `3eb40805`).** Dev bu arada fe-fb'nin 3 commit'iyle ilerlemişti (67 dosya); merge çakışmasız geçti. Birleşik ağaçta: tsc 0, lint 0, i18n 0, build 0, `npx vitest run` exit 0 (292 dosya geçti, 6 atlandı; **3696 test geçti, 0 başarısız**, 96 atlandı).

Son adımda `next.config.ts`'te yalnız bir JSDoc bloğunun yeri değişti (kod yok). Bundan sonra tsc 0, eslint 0 ve hedefli testler 94/94 yeniden koşuldu.

## 3. Değişen dosyalar

- `src/lib/security-headers.ts`
- `next.config.ts`
- `src/proxy.ts`
- `src/lib/security-headers.test.ts`
- `docs/agent-results/TASK-MUO06ANN5D3RM-cs-fb.md` ve `…-cs-fb-ekler/`: 2 matris, mutant çıktısı, 3 betik, vitest özeti, 2 ekran görüntüsü

## 4. Riskler

- **R-1 (orta, UX; karar liderde).** `/yok.png` sınıfındaki 404'ler tarayıcıda **boş beyaz sayfa** gösteriyor (kare: `…-ekler/yok-png-404-bos.png`). Durum kodu hâlâ 404.
  - Kök neden bu değişiklik değil. Yerel öneki olmayan yollar `[locale]`'e `locale="yok.png"` olarak düşüyor. `src/app/[locale]/layout.tsx:20` `notFound()` çağırıyor ve Next SSR'da `__next_error__` kabuğu basıyor (`NEXT_HTTP_ERROR_FALLBACK;404`). "Sayfa Bulunamadı" metni HTML'de yok, yalnız JS ile çiziliyor.
  - `/foo.bar` ve `/wp-login.php` de aynı kabuğu alıyor; nonce CSP'leri olduğu için orada JS çalışıyor.
  - Görev "nonce gerekmiyorsa sıkı statik CSP" diyordu. Nonce yalnız bu 404'ün *görünmesi* için gerekiyor, güvenlik için değil. Bu yüzden sıkı politikayı seçtim: bu URL'ler çoğunlukla `<img>`/`<script>` alt kaynağı ya da bot isteği, gövdeleri zaten görüntülenmiyor.
  - Önerilen takip: `[locale]` için gerçek bir SSR 404 (ör. `[locale]/layout`'ta `generateStaticParams` + `dynamicParams = false`, ya da geçersiz locale'i proxy'de erkenden 404'e çevirmek). Böylece statik politika altında da metin görünür.
- **R-2 (düşük).** `/_NEXT/static/x.js` gibi `_next/static` önekinin **büyük harfli** yazımı hâlâ CSP'siz HTML 404 dönüyor. Sebep: header eşleşmesi harfe duyarsız, dolayısıyla hariç tutma da duyarsız. Prod Node 22'de regex modifier olmadığından regex ile çözülemiyor. Bugün yansıtma yok, istismar yok.
- **R-3 (düşük, tasarım gereği).** `CSP_MODE=report-only` açıkken `/yok.PNG` ve `/tr/yok.png` hem zorlayıcı statik politikayı hem report-only nonce politikasını alıyor. Ölçüldü: enforce=1, report-only=1. Etkisi: bu 404'lerde script çalışmaz (R-1 ile aynı sonuç). Diğer sayfalar etkilenmiyor (`/tr`: enforce=0).
- **R-4 (bilgi).** İstisna listesi build anında sabitleniyor. Rebuild'siz eklenen bir `public/` dosyası ya da ileride eklenecek `app/robots.ts` gibi üretilen bir metadata rotası da statik politikayı alır. PNG, text veya XML gövdede bunun etkisi yok. `_vercel` de kapsamda: standalone Docker'da orada gerçek dosya yok.

## 5. Açık sorular

1. R-1 için takip kartı açılsın mı? Önerim `[locale]` geçersiz locale → SSR 404.
2. `app/robots.ts` / `sitemap.ts` eklenmesi (İNCELEME-78 öneri c) ayrı kart mı? Bu karta alınmadı.

## 6. Sonraki adım

- Push kararı liderde. dev'de merge var; push yapılmadı.
- R-1 takip kartı: `[locale]` geçersiz locale için SSR 404.
