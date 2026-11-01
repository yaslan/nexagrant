# TASK-MUO9VDM7OXZ83 — FB İNCELEME-98: statik dosya 404 CSP düzeltmesi (TASK-MUO06ANN5D3RM) — crw-fb

**Durum:** TAMAM
**Karar:** **ONAY.** Bloke eden bulgu yok. Merge (`3eb40805`) CSP açısından baseline'dan kesin daha iyi, gerileme yok ve bütün kapılar temiz. Bir kapsam boşluğu var (Y-1): büyük/küçük harf farkıyla yazılan gerçek dosya adları ve `_next/static`/`_next/image` yazımları hâlâ CSP'siz 404 dönüyor. Rapor ve kod yorumu bu boşluğu olduğundan küçük gösteriyor. Takip kartı öneriyorum; düzeltmenin nasıl yapılabileceği spike ile ölçüldü (§2.5).
**İncelenen:** cs-fb `80a57df1`, dev merge `3eb40805`. Dosyalar: `src/lib/security-headers.ts`, `next.config.ts`, `src/proxy.ts`, `src/lib/security-headers.test.ts`.
**Ağaç:** Ayrı worktree, dev HEAD `d5fcd0ec` (içinde `3eb40805` var). İzole DB `crwfb98-pg` (127.0.0.1:5598, `pgvector:pg16`), CI'daki "Prepare database" sırasıyla kuruldu. Paylaşılan :5433'e yazılmadı. Repo kodu **değiştirilmedi**: mutantlar koşudan sonra geri yüklendi (`git status` temiz), spike ayrı bir worktree'de yapıldı ve silindi. Konteyner, worktree'ler ve kendi `next-server` süreçlerim iş bitince kaldırıldı.
**Platform beyanı:** Doğrulama **macOS'ta** yapıldı (Darwin 27, arm64, Node 26.5, Next 16.3.4, Dockerfile düzeniyle standalone `node server.js`, yani `public/` ve `.next/static` kopyalandı; Chromium headless-shell 1243). **Linux** (prod `node:22-alpine`, CI Node 22) koşulamadı, bu makinede yok. Koddan değerlendirme:
- Değişiklik yalnız regex üretiyor ve başlık ekliyor. Header eşleşmesi path-to-regexp ile `sensitive:false` çalışıyor, proxy matcher ise harfe duyarlı. Bu davranış Next'in kendisinde, platforma bağlı değil.
- Y-1'deki `/Logo.png` 404'ü macOS'un harfe duyarsız dosya sisteminde bile 404 döndü. Next public dosyalarını build listesinden eşliyor, diskten değil. Harfe duyarlı Linux'ta da 404 olur, yani bulgu Linux'ta da geçerli.
- **Windows** koşulamadı, makine yok. `servedStaticFiles` yolu `path.sep` ile bölüyor, liste `/logo.png` biçiminde çıkıyor.

## 1. Ne yapıldı

1. `3eb40805^1..3eb40805` diff'ini satır satır okudum. `routes-manifest.json` içindeki derlenmiş header regex'ini ve `functions-config-manifest.json` içindeki proxy matcher regex'ini çıkardım.
2. İzole DB'yi kurdum: `db push`, `db:rls-role`, `apply-migrations.sh` iki kez (41 dosya, ikinci geçiş idempotent), `db:rls`, `db:seed`. Bu makinede `psql` olmadığı için `PSQL` değişkeni `docker exec psql` sarmalayıcısını gösterdi.
3. Tam `vitest` ve skip kapısını CI ortamıyla koştum (`CI=true`, CI'daki `AUTH_SECRET` fikstürü, `DATABASE_URL_RLS_TEST`). Ardından tsc, lint, i18n ve build.
4. Standalone sunucuyu :3698'de açıp iki curl matrisi koştum (`curl --path-as-is`, istemci tarafında normalizasyon yok):
   - **matrix-1** (45 yol): var olan varlıklar, yokların hepsi, segment eşleşmesi.
   - **matrix-2** (48 yol): harf varyantları, `%2F`/`%5F`/`%2E` kodlamaları, çift eğik çizgi, `..`, sonda `/`, `%00`, `;`.
5. Gerçek Chromium'da 9 yolu açtım ve parser'ın eklediği `onerror` enjeksiyonunu denedim (cs-fb'nin düzeneğinin aynısı).
6. Regex maliyetini ölçtüm: 8 KB'lık patolojik yollarla hem header regex'i hem proxy matcher için, ayrıca canlı gecikme.
7. Kendi 8 mutantımı koştum (X1–X8). cs-fb'nin M1–M16'sının kapsamadığı yerlere yöneldim.
8. **Spike:** Y-1 için önerdiğim düzeltmeyi ikinci bir worktree'de derledim (dosya bazlı istisnaları kaldırmak, yalnız `api/` istisnasını tutmak). Sunucuyu :3699'da açtım; curl ve gerçek sayfa yükünü dev ile karşılaştırdım.

## 2. Kanıt

Ekler: `docs/agent-results/TASK-MUO9VDM7OXZ83-crw-fb-ekler/`. İçinde `matrix.sh`, `matrix-1.txt`, `matrix-2.txt`, `matrix-spike.txt`, `browser.mjs`, `browser.txt`, `mutants.py`, `mutants.txt`, `spike-page.txt`, `vitest-ozet.txt` ve 2 kare var.

### 2.1 Kapılar (dev `d5fcd0ec`, izole DB)

| Kapı | Sonuç |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm i18n:check` | exit 0 |
| `pnpm build` | exit 0, `ƒ Proxy (Middleware)` |
| `vitest run` (tam, CI env) | **exit 0**. 296 dosya geçti, 2 atlandı. **3754 test geçti, 0 başarısız**, 41 atlandı |
| `check-live-skips.ts` | exit 0 (atlananların hepsi izin listesinde) |

### 2.2 cs-fb'nin iddiaları: hepsi doğrulandı (`matrix-1.txt`)

```
PATH                            CODE CONTENT-TYPE      CSP SCR CACHE-CONTROL                         CSP-HEAD
/logo.png                       200  image/png         0   0   public, max-age=0
/favicon.ico                    200  image/x-icon      0   0   public, max-age=0, must-revalidate
/_next/static/chunks/<x>.js     200  application/js…   0   0   public, max-age=31536000, immutable
/_next/static/media/<favicon>   200  image/x-icon      0   0   public, max-age=31536000, immutable
/_next/image?url=%2Flogo.png…   200  image/png         1   0   public, max-age=14400, must-revalid…  script-src 'none'; frame-src 'none'; san  (Next'in kendisi)
/robots.txt | /sitemap.xml      404  text/html         1   32  private, no-cache, no-store…          default-src 'none'; style-src 'self' 'un
/yok.png | /x.js | /api.png     404  text/html         1   31  …                                     default-src 'none'; …
/_next | /_next/yok | /_vercel  404  text/html         1   19–31 …                                   default-src 'none'; …
/api | /api/yok | /api/yok.png  404  text/html         1   19–31 …                                   default-src 'none'; script-src 'unsafe-h  (API)
/apifoo /api-docs /_nextfoo /_vercelfoo /API /Api/yok  307 → /tr/…   1   nonce
/api.html /yok.PNG /foo.bar /wp-login.php /tr/yok.png /en/x.js  404   1   nonce
/TR/yok.png                     404                    1   static
/_next/static/chunks/yok.js     404  text/plain        0   0   (HTML değil)
/api/ | /_next/                 308 → /api, /_next     0   0   (gövde yok)
```

- Her satırda CSP başlığı en fazla **1** tane. Proxy ile header kuralının çakıştığı yerlerde (`/yok.PNG`, `/tr/yok.png`) tek başlık kalıyor, o da nonce'lu olanı.
- Tam segment eşlemesi doğru çalışıyor: `/api`, `/api/` ve `/api/x` proxy'ye girmiyor; `/apifoo`, `/api-docs`, `/_nextfoo`, `/_vercelfoo` giriyor. `/API` ve `/Api/yok` da proxy'den geçip nonce alıyor (matcher harfe duyarlı).
- Kodlama ve normalizasyon (`matrix-2.txt`): `//yok.png`, `//api/yok`, `///x.js`, `/logo.png/` ve `/yok.png/` hepsi 308 dönüyor, gövdesiz. `/_next/static/../yok.png` ve `/_next/static/%2e%2e/yok.png` statik politikayı alıyor. `/api%2Fyok.png`, `/%5fnext/static/x.js` ve `/_next%2Fstatic/x.js` da statik politikayı alıyor. `/%61pi/yok`, `/logo%2Epng`, `/logo.png%00` ve `/logo.png;x` proxy'den geçip nonce alıyor. `/a/../logo.png` 200 PNG dönüyor, CSP yok. **Kodlamayla açılan bir delik bulamadım.**
- Tarayıcı (`browser.txt`): `/yok.png`, `/robots.txt` ve `/_next/yok` yollarında `pwned=false`, 20–33 CSP ihlali var. `/apifoo` hydrate oluyor ve `pwned=false`. Kontrol olarak `/logo.png`'de `pwned=true`, yani düzenek çalışıyor.
- R-1 (boş sayfa) doğrulandı: `/yok.png` gövde metni `""` (kare `_yok_png.png`). `/_next/yok` ise SSR metnini gösteriyor.

### 2.3 Regex maliyeti / performans

| Ölçüm | Sonuç |
|---|---|
| Header regex, `/yok.png`, 250.000 eşleşme | 5,5 ms (~22 ns/eşleşme) |
| Header regex, 8 KB patolojik yol (`a.`×4000, `_next/`+`a/`×4000, `.png/`×1600, `api`×2600) | 0,007–0,018 ms/eşleşme, doğrusal. **ReDoS yok** |
| Proxy matcher, aynı 8 KB yollar | ≤0,022 ms/eşleşme |
| Canlı, 200 ardışık istek (curl süreç açılışı dahil) | `/yok.png` 15,4 ms · `/apifoo` 10,8 ms · `/tr/yok` 13,3 ms · 6 KB noktalı yol 16,5 ms |

Proxy'den geçen yeni yollar (`/apifoo` vb.) yalnız next-intl yönlendirmesi yapıyor. Ek maliyet ölçülebilir değil.

### 2.4 Mutantlar (kendi setim, `mutants.txt`; hedef dosya `security-headers.test.ts`, 93 test)

| # | Mutant | Sonuç |
|---|---|---|
| X1 | public dosya istisnasında sondaki `$` yok (önek eşleşmesi) | KILLED (kardeş-dosya testi) |
| X2 | `'_next/image$'` → `'_next/image'` | **SURVIVED**. `/_next/imagex` CSP'siz HTML 404'e döner |
| X3 | `'_next/static/'` → `'_next/static'` | **SURVIVED**. `/_next/static` ve `/_next/staticfoo` CSP'siz HTML 404'e döner |
| X4 | statik politikaya `script-src-elem 'unsafe-inline'` eklendi | **SURVIVED**. "runs no script" testi yalnız `script-src` yokluğunu arıyor |
| X5 | statik politikada `img-src *` | SURVIVED (kozmetik; pin'lenmemiş) |
| X6 | `public/` taraması `recursive` değil | SURVIVED. **Eşdeğer**: bugün `public/`'te alt dizin yok |
| X7 | statik kurala API politikası verildi | KILLED (17) |
| X8 | kapsamda `_next(?:/.*)?` → `_next/.*` | KILLED |

### 2.5 Spike: Y-1'in düzeltmesi (`matrix-spike.txt`, `spike-page.txt`)

Yerel değişiklik şu: `staticFileNotFoundSource` içinde `skip = ['api(?:/|$)']`. Yani `_next/static/`, `_next/image$` ve public/metadata dosya istisnaları kaldırıldı. Build exit 0.

- Y-1'deki 4 yolun (`/Logo.png`, `/Favicon.ico`, `/_next/STATIC/x.js`, `/_next/Image`) hepsi statik CSP aldı.
- Gerçek varlıklarda gövde, tür ve Cache-Control aynı kaldı: `/logo.png` 200 `max-age=0`, chunk 200 `immutable`, `If-None-Match` → **304**. Tek fark zararsız bir `Content-Security-Policy` başlığının eklenmesi.
- `/_next/image` tek CSP başlığıyla çıkıyor, o da Next'in kendi başlığı.
- Gerçek sayfa (`/tr/login` ve `/tr`, networkidle) iki build'de de aynı davrandı: hydrate oldu, logo `naturalWidth` 64/96, **0 CSP ihlali**. Başarısız isteklerin kümesi iki tarafta da aynı: navigasyonla iptal edilen RSC prefetch'leri, varlık hatası yok.
- Tarayıcıda Worker yok. `src`'deki tek `new Worker` sunucu tarafında (`src/lib/rag-pdf-extract.ts:85`, Node worker_threads). Bu yüzden chunk yanıtındaki CSP hiçbir şeyi etkilemiyor.

## 3. Bulgular (önem sırasıyla)

### Y-1 (düşük-orta, derinlemesine savunma; bloke etmiyor, takip kartı). Harf varyantları hâlâ CSP'siz 404 dönüyor.

**Kanıt.** `matrix-2.txt` ve `browser.txt`:
```
/Logo.png  /Next.svg  /Favicon.ico                         404 text/html CSP=0 scripts=31–32
/_next/STATIC/x.js  /_next/Static/chunks/x.js
/_next/Image  /_next/IMAGE  /_NEXT/static/x.js             404 text/html CSP=0 scripts=19
Chromium: /Logo.png, /Favicon.ico, /_next/STATIC/x.js, /_next/Image → nextRan=true, pwned=true, 0 ihlal
```

**Kök neden:**
- `src/lib/security-headers.ts` `staticFileNotFoundSource` içindeki istisnalar (`served` dosyaları, `_next/static/`, `_next/image$`), header eşleşmesinin `sensitive:false` olması yüzünden **harfe duyarsız** uygulanıyor.
- Proxy matcher'ın uzantı istisnası (`src/proxy.ts` `config.matcher[2]`) ise harfe **duyarlı**.
- Sonuç: uzantısı küçük harfle yazılmış, adı farklı harflerle yazılmış bir yol iki taraftan da düşüyor. Hem header kuralından hem proxy'den dışlanıyor, gerçek dosya da olmadığı için Next'in tam uygulama 404'ü CSP'siz gidiyor.
- Kapsam: 7 dosyanın (`logo.png`, `favicon.ico`, 5 svg) her harf varyantı, artık küçük harfli `_next/` altındaki `static` ve `image` yazımları da.

**Gerileme mi?** Hayır. Baseline'da bu yollar da CSP'sizdi.

**Belgelemedeki sorun:**
- Rapordaki R-2 ile `security-headers.ts`'teki yorum ("The one thing case-folding costs: `/_NEXT/static/x.js` is left out as well") boşluğu tek bir yola indiriyor.
- Gerçek boşluk daha geniş ve daha doğal görünen yazımları kapsıyor: `/_next/Image`, `/Logo.png`.
- "Regex'le çözülemez" tespiti doğru (Node 22'de inline modifier yok).

**İstismar:** Bugün yok. Yansıtılan değerler kaçışlanıyor (devop-fb İNCELEME-78 §2.5). Durum Y-1'in orijinal sınıfıyla aynı: 404 şablonuna yansıyan bir alan eklenirse bu yollar korumasız kalır.

**Önerilen düzeltme (spike ile ölçüldü, §2.5):**
- Dosya bazlı istisnaları tamamen kaldır; yalnız `api(?:/|$)` kalsın.
- Script'siz bir CSP'nin PNG, SVG, ICO veya chunk yanıtında görünür bir etkisi yok. SVG doğrudan açıldığında üstelik koruma kazanır.
- Bu değişiklikle `servedStaticFiles`, `APP_METADATA_FILE` ve `readdirSync` kodu da (~25 satır) gereksizleşir, R-4 (rebuild'siz dosya) da ortadan kalkar.
- Testlerde gerçek dosyalar için beklenen değer `'none'`'dan `'static'`'e dönmeli. Buna `/Logo.png` ve `/_next/Image` pozitif vakaları eklenmeli.
- Alternatif: istisnaları olduğu gibi bırakmak, ama R-2'yi ve kod yorumunu gerçek kapsamla düzeltmek.

### D-1 (düşük, test boşluğu). Üç anlamlı mutant hayatta kaldı (X2, X3, X4)

- **X4 en önemlisi.** Test "the static-file policy runs no script" adını taşıyor ama yalnız `script-src` yokluğuna bakıyor. `script-src-elem 'unsafe-inline'` ya da `script-src-attr` eklenirse inline script'ler yeniden çalışır ve test yeşil kalır. Öneri: politikada `script-src*` ile başlayan hiçbir yönerge olmadığını iddia eden bir test.
- **X2 ve X3.** Matriste `/_next/imagex`, `/_next/static` (sonda `/` olmadan) ve `/_next/staticfoo` → `'static'` satırları yok. Y-1 önerisi uygulanırsa bu istisnalar zaten kalkar.

### Ö-1 (öneri). R-1 (boş beyaz 404) için takip kartı

R-1'i doğruladım ve cs-fb'nin önerisine katılıyorum: geçersiz locale için SSR 404. Gerekçe: statik politika altında `[locale]`'e düşen 404 metin göstermiyor, `/_next/yok` ise gösteriyor.

### Doğru bulunanlar (bulgu değil)

- Çift CSP yok.
- API ile statik politika birbirinden ayrık.
- Kural sırası doğru: `/api/:path*` ve statik kural ayrık, accept-invite'tan önce.
- Kaçışlı dosya adı eşleşmesi literal (test `(x)+.js` ile pin'li).
- `report-uri`'nin bilerek konmaması gerekçeli.
- Gerçek varlıklarda cache ve ETag davranışı aynı kaldı.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUO9VDM7OXZ83-crw-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO9VDM7OXZ83-crw-fb-ekler/` (matrisler, betikler, mutant çıktısı, tarayıcı çıktısı, spike çıktısı, vitest özeti, 2 kare)
- Kod değişmedi.

## 5. Riskler

- R-3 (report-only modunda çift politika) yeniden ölçülmedi, cs-fb'nin ölçümüne güvenildi.
- Linux ve Windows'ta koşulmadı (platform beyanına bakın). Y-1 Linux'ta da geçerli; gerekçesi koddan (header eşleşmesinin harfe duyarsızlığı Next'te sabit).

## 6. Açık sorular

1. Y-1 için hangi yol? (a) istisnaları kaldırmak (önerim; spike ile ölçüldü) ya da (b) istisnaları koruyup belgeyi düzeltmek.
2. R-1 takip kartı cs-fb'nin raporundaki önerilerle birleştirilsin mi?

## 7. Sonraki adım

- Lider: Y-1 ve D-1 için bir takip kartı (cs-fb), R-1 için bir kart.
- Push kararı liderde. Bu inceleme yalnız rapor commit'i ekliyor, push yok.
