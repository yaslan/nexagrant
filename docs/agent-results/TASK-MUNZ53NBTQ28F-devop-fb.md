# TASK-MUNZ53NBTQ28F — FB İNCELEME-78 (devop-fb)

**Durum:** TAMAM
**Karar:** ONAY. Birleştirilen kod doğru, gerileme yok ve bütün kapılar temiz. Tek eksik: Y-1 açığı yalnız kısmen kapandı, bunun için bir takip kartı açılmalı (aşağıda).
**İncelenen:** TASK-MUNRAZC9Q758W (cs-fb): 37c17d7a (CSP), e49feaf7 (CI), dev merge 68e48e11
**Ağaç:** Ayrı worktree, dev HEAD `e317f285` (68e48e11'i içeriyor). İzole DB `devopfb78-pg` (:5478). Paylaşılan :5433'e hiç yazılmadı. Kod DEĞİŞTİRİLMEDİ.
**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, arm64, Node 26.5, Chromium headless-shell 1243). Linux: CI'nin Test adımı yerelde CI=true ile benzetildi, gerçek GitHub Actions koşusu yok (aşağıda R-1). Windows koşulamadı, makine yok. Koddan değerlendirme: proxy matcher, csp-report ve live-skip-gate platforma bağlı değil. `live-skip-gate.relative()` yolu `'/tests/'` ile kesiyor; vitest JSON raporu Windows'ta da `/` ayraçlı yol yazar, bu yüzden izin listesi eşleşmesi aynı davranır (Windows'ta ayrıca koşulmadı).

## 1. Ne yapıldı

1. Üç commit'in diff'ini okudum: `src/proxy.ts`, `src/lib/security-headers.ts`, `src/lib/csp-report.ts`, `src/app/api/csp-report/route.ts`, `scripts/live-skip-gate.ts`, `scripts/check-live-skips.ts`, `.github/workflows/ci.yml` ve testleri.
2. İzole DB'yi CI'nin "Prepare database" sırasıyla kurdum: db push, rls-role, apply-migrations ×2 (40 dosya, ikinci geçiş idempotent), db:rls, seed.
3. **Tam vitest'i CI benzetimiyle koştum.** Worktree'de `.env` yoktu (CI ile aynı). CI=true, job env'i, CI'daki komutun birebiri ve ardından gate.
4. **Skip kapısını DB'siz koştum**, bir kez CI=true ile, bir kez yerel olarak.
5. **29 mutant** koştum: gate, ci.yml pin'i, guard'lar, matcher, proxy ve csp-report için.
6. `next build`, ardından standalone `next start` (NODE_ENV=production, :3178) ve üzerinde:
   - 28 yollu CSP curl matrisi,
   - `/api/csp-report` üzerinde 13 kötüye kullanım denemesi ve hız sınırı ölçümü,
   - gerçek Chromium ile rapor gönderimi, pozitif kontrol ve açık yolda karşı kontrol.
7. tsc, lint, i18n ve ci.yml YAML ayrıştırma kontrolleri.

## 2. Kanıt

### 2.1 Tam test ve kapılar (dev HEAD e317f285)

| Kapı | Sonuç |
|---|---|
| `vitest run` (CI komutunun birebiri, CI=true, `.env` yok) | **exit 0**. 281 dosya geçti, 2 dosya atlandı. **3384 test geçti, 0 başarısız**, 30 atlandı |
| `tsx scripts/check-live-skips.ts vitest-report.json` | **exit 0**. İzinli skip 22: `evidence-upload-s3.live` 21 + `k1-embeddings.live` REAL OpenAI 1 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm i18n:check` | exit 0 ("both catalogs agree …") |
| `pnpm build` | exit 0 (4 dk 20 sn). `ƒ Proxy (Middleware)` derlendi |
| ci.yml `yaml.safe_load` | OK |

`.live` olmayan skip'ler 8 tane: `adapters` 2, `sedia-adapter` 2, `k1-daily-calls` 4. Hepsi `describe.skipIf(!RUN_LIVE_ADAPTER_TESTS)` ile atlanıyor, yani ağ gerektiren bilinçli opt-in adaptör testleri. Gate bunları görmez, görmesi de gerekmez (D-3).

### 2.2 CI skip kapısı, DB'siz

Koşulan dosyalar: `system-scope.live`, `auditevent-null-system-only.live`, `oauth-registration.live`. DB değişkenleri ve AUTH_SECRET verilmedi.

| Koşum | vitest | gate |
|---|---|---|
| CI=true, DB yok | **exit 1**, "refusing to skip in CI — DATABASE_URL_RLS_TEST is not set" | Gerek kalmıyor: `bash -e` adımı burada durdurur |
| Yerel (CI yok), DB yok | **exit 0**. 30 atlandı, 1 geçti (statik purpose-list testi, DB istemiyor) | **exit 1**: "live-skip gate: FAILED — a live test did not run" |

Sonuç: CI'da Test adımı DB olmadan kırmızı yanıyor. Yerelde `pnpm test` serbest; gate yalnız CI adımında koşuyor, istenen de buydu. O-2 düzeltmesi de doğrulandı: `ctx.skip` olan testler artık "passed" değil "skipped" olarak raporlanıyor.

### 2.3 Mutantlar: 29 mutanttan 26'sı öldü

| # | Mutant | Sonuç |
|---|---|---|
| G1 | gate: `skipped` koşmuş sayılıyor | KILLED (3 test) |
| G2 | gate: `livePassed===0` kontrolü kaldırıldı | KILLED |
| G3 | gate: boş rapor kabul ediliyor | KILLED |
| G4 | gate: izin listesinde dosya adı yok sayılıyor | KILLED (6 test) |
| G5 | gate: sonuçsuz dosya kabul ediliyor | KILLED |
| G6 | gate: `todo` skip sayılmıyor | KILLED |
| Y1 | ci.yml: gate satırı silindi | KILLED |
| Y2 | ci.yml: `pnpm test`'e geri dönüldü | KILLED |
| Y3 | ci.yml: `check-live-skips … \|\| true` | KILLED |
| Y4 | ci.yml: rapor yolu uyuşmuyor | KILLED |
| H1 | `skipOrFailInCi` hiç throw etmiyor | KILLED (3 test) |
| C1 | matcher eski `.*\\..*` haline döndü | KILLED (4 test) |
| C2 | matcher'dan `svg` düştü | KILLED |
| C3 | matcher'da `$` çapası yok | KILLED |
| C4 | noktalı yol next-intl'e gidiyor | KILLED |
| C5 | passthrough istek başlığı olmadan (nonce yok) | KILLED |
| C6 | `report-uri` kaldırıldı | KILLED |
| R1 | alanlardan kontrol karakteri temizlenmiyor | KILLED |
| R2 | alan uzunluğu kesilmiyor | KILLED |
| R3 | sayfa query'si loglanıyor | KILLED (3 test) |
| R4 | engellenen URL tam haliyle loglanıyor | KILLED |
| R5 | global sınır kapalı | KILLED |
| R6 | istemci sınırı kapalı | KILLED |
| R7 | stream üst sınırı kapalı | KILLED |
| R8 | content-length ön kontrolü kapalı | **SURVIVED**. Eşdeğer mutant: stream sınırı aynı 413'ü veriyor |
| R9 | her content-type kabul ediliyor | KILLED |
| R10 | gövde başına 10 rapor sınırı kapalı | **SURVIVED**, D-1 |
| R11 | IPv6 /64 kovası kapalı | **SURVIVED**, D-2 |
| R12 | pencere hiç sıfırlanmıyor | KILLED |

### 2.4 CSP curl matrisi (prod `next start`)

Tam tablo: `TASK-MUNZ53NBTQ28F-devop-fb-evidence/csp-matrix.txt`. SCRPT sütunu sayfadaki `<script` sayısı.

| Yol | Kod | CSP | nonce | report-uri | SCRPT | Önbellek |
|---|---|---|---|---|---|---|
| /foo.bar | 404 | ✅ | ✅ | ✅ | 31 | no-store |
| /tr/yok.html | 404 | ✅ | ✅ | ✅ | 19 | no-store |
| /a.b/c, /blog/v1.2, /en/x.y/z, /x.json, /FOO.PNG, /tr/logo.png | 404 | ✅ | ✅ | ✅ | 19–31 | no-store |
| / , /yok | 307 | ✅ | ✅ | ✅ | 0 | — |
| /favicon.ico | 200 | — (doğru) | | | 0 | `public, max-age=0, must-revalidate` |
| /logo.png, /globe.svg | 200 | — (doğru) | | | 0 | `public, max-age=0` |
| /_next/static/chunks/…js | 200 | — (doğru) | | | 0 | `public, max-age=31536000, immutable` |
| /_next/image?… | 200 | Next'in kendi `script-src 'none'; sandbox` politikası | | | 0 | `max-age=14400` |
| /api/health (404) | 404 | API politikası (nonce'suz, doğru) | | | 19 | no-store |
| **/robots.txt, /sitemap.xml** | **404** | **YOK** | | | **32** | no-store |
| **/.well-known/security.txt** | **404** | **YOK** | | | **19** | no-store |
| **/foo.js, /foo.txt, /x.svg, /foo.css, /foo.js.map** | **404** | **YOK** | | | **31–32** | no-store |
| **/api.html, /apifoo** | **404** | **YOK** | | | **31** | no-store |

### 2.5 Gerçek Chromium ile doğrulama

Yöntem: `route.fulfill` ile `<head>`'e nonce'suz bir `<script>window.__pwned=1</script>` enjekte edildi.

- `/tr` ve `/foo.bar`: `pwned=0`. `securitypolicyviolation` `script-src-elem inline` ×2 yakalandı. Tarayıcı `POST application/csp-report` ×2 gönderdi. Sunucu logu:
  `[WARN] csp violation {"directive":"script-src-elem","blocked":"inline","page":"/foo.bar","disposition":"enforce"}`
- Karşı kontrol: `/robots.txt`, `/.well-known/security.txt` ve `/apifoo` yollarında **`pwned=1`**. İhlal ve rapor 0. Y-1 açığının gerçek olduğunu tarayıcı gösteriyor.
- 404 sayfası yolu ve query'yi RSC payload'ına yansıtıyor. `?q=</script><script>alert(1)</script>` ve `"><img onerror>` denendi. Next `<`'yi `<` olarak kaçışlıyor, **kaçış yok**. Yani açık bugün istismar edilebilir değil, derinlemesine savunma eksiği.

### 2.6 `/api/csp-report` kötüye kullanım denemeleri (prod)

| Deneme | Sonuç |
|---|---|
| legacy `{"csp-report":…}` + `?token=SECRET`, `script-sample` | 204. Logda `page:"/tr/davet"`, `blocked:"https://evil.example"`. Token, query ve sample **yok** |
| Reporting API dizisi (`application/reports+json`) | 204, loglandı |
| `text/plain` / content-type yok | 415 / 415 |
| 9 KiB gövde, content-length ile | 413 |
| 9 KiB gövde, chunked (uzunluk yok) | 413 |
| 50 MB chunked | 413, 16 ms'de kesildi |
| `content-length: abc` | 400 |
| JSON değil / rapor olmayan JSON | 400 / 204, hiçbir şey loglanmadı |
| CR/LF/ESC/U+2028/NUL + sahte JSON satırı | 204. Kontrol karakterleri `?` oldu, kayıt tek JSON satırı kaldı, `javascript:…` yalnız `javascript:` olarak yazıldı |
| GET | 405 |
| 60 rapor içeren tek gövde | 204, **10** log satırı |
| Aynı istemciden 25 istek | 20 × 204, 5 × 429 |
| Aynı IPv6 /64'ten 25 farklı adres | 20 × 204, 5 × 429 (/64 tek istemci sayılıyor) |
| Değişen IPv4 adreslerinden 350 istek | 240 × 204, 110 × 429. Global 300/dk sınırı, önceki isteklerle birlikte tuttu |
| Oturum çerezi olmadan | 204 (tasarım gereği oturumsuz) |

## 3. Değişen dosyalar

Kod değiştirilmedi. Yalnız bu rapor ve kanıt dizini:
- `docs/agent-results/TASK-MUNZ53NBTQ28F-devop-fb.md`
- `docs/agent-results/TASK-MUNZ53NBTQ28F-devop-fb-evidence/` (`csp-matrix.txt`, `csp-report-log-sample.txt`, `vitest-ci-summary.txt`)

## 4. Riskler ve bulgular

**Y-1 (orta, takip kartı). Y-1 açığının sınıfı hâlâ açık: statik uzantılı veya `api` ile başlayan var olmayan yollar, 404 HTML'ini CSP'siz döndürüyor.**
- Matcher yalnız noktalı yolları değil, `ico|png|…|txt|xml|svg|css|js|map` uzantılı her yolu dışarıda bırakıyor. Dosya `public/`'te yoksa Next tam uygulama 404'ünü (19–32 script) proxy'siz, yani CSP'siz basıyor.
- Tarayıcıda kanıtlı: `pwned=1`.
- En çok tarayıcı ve bot trafiği alan yollar tam bu sınıfta: repoda `robots.txt`, `sitemap.xml` ve `.well-known/security.txt` **yok**.
- Ayrıca `(?!api|…)` lookahead'inde `/` yok. Bu yüzden `/api.html`, `/apifoo` ve `/api-docs` da dışarıda kalıyor. Bu durum eskiden beri var, ama "matcher sabitleme" kapsamında yakalanmalıydı.
- Bugün istismar yok (yansıtma kaçışlı). Yine de 404 şablonuna bir gün yansıyan bir alan eklenirse CSP bu sayfayı korumaz.
- Öneri:
  - (a) next.config `headers()`'a, matcher'ın dışarıda bıraktığı uzantılar için script'siz statik bir politika ekle: `default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`. Bu yollar proxy'den geçmediği için çift politika oluşmaz; gerçek public dosyalar için de zararsız.
  - (b) Lookahead'i `api(?:/|$)` yap.
  - (c) İsteğe bağlı: `app/robots.ts` ve `app/sitemap.ts` ekle.
  - Test: `/robots.txt` ve `/apifoo` 404'lerinde CSP bulunmasını pin'le.

**D-1 (düşük).** Gövde başına 10 rapor sınırı (`MAX_REPORTS_PER_BODY`) pin'lenmemiş, mutant R10 hayatta kaldı. Sınır kalkarsa 8 KiB'lık bir gövde ~200 log satırı üretir; 300 istek/dk ile bu dakikada ~60 bin satıra çıkar. Canlıda sınır çalışıyor (60 rapor → 10 satır), yalnız testi eksik.

**D-2 (düşük).** csp-report'un IPv6 /64 kovası testte pin'lenmemiş, mutant R11 hayatta kaldı. `ipBucket`'ın kendi testi var, ama uçta çağrıldığını kilitleyen bir test yok. Canlıda doğru çalışıyor.

**D-3 (bilgi).** Gate yalnız `*.live.test.ts` adına bakıyor. Bugün `.live` olmayan skip'lerin hepsi bilinçli adaptör opt-in'leri. DB'ye bağlı ama `.live` adı taşımayan testler (`cron-tenant-scope`, `schema-contract`, `double-charge-prevention`) `skipOrFailInCi` guard'ına dayanıyor. İsimlendirme kuralı bir yere yazılmalı.

**D-4 (bilgi, tasarım gereği).** Global sınır 300/dk. Adres döndüren bir saldırgan o dakika için gerçek raporları düşürebilir. Kod yorumu bunu bilinçli olarak kabul ediyor ("a lost report is harmless").

**D-5 (bilgi, önceden var).** Public dosyalar `public, max-age=0` ile sunuluyor (Next varsayılanı), yani "önbellekli" değil, her istekte yeniden doğrulanıyor. Bu commit'le ilgili değil. `_next/static` doğru şekilde `immutable`.

**R-1 (süreç).** origin/dev `c5aa48d7`'de, 68e48e11 henüz push edilmedi. Yeni Test adımı ve gate **GitHub Actions'ta hiç koşmadı**. Burada yalnız yerel CI=true benzetimiyle kanıtlandı. İlk push'taki Test adımının logunda `live-skip gate: … 22 allowed skip(s)` satırı ve exit 0 aranmalı.

## 5. Açık sorular

1. Y-1 takip kartı: (a)+(b) mi, yoksa yalnız (b) + `robots.ts`/`sitemap.ts` mi? Karar leed-fb'de.
2. `evidence-upload-s3.live` CI'da tamamen izinli skip (21 test). CI'a bir MinIO servisi eklenmesi planlanıyor mu?

## 6. Sonraki adım

- Y-1 + D-1 + D-2 için tek takip kartı: matcher/statik politika, `api/` çapası, iki eksik pin.
- İlk dev push'unda Test adımının gate satırını kontrol et (R-1).

## Not: sonuç yolu

Görev metninin sonundaki "KANIT ZORUNLU" bloğu şu yolu veriyordu: `/Users/macbook/alan/docs/agent-results/TASK-MUN80T8IVTPM7-fe-fb-inceleme57-2.md`. Bu yol başka bir görevin ve başka bir ajanın rapor adı, üstelik repo dışı bir kök. O yüzden rapor, görev gövdesindeki SONUÇ DOSYASI yoluna yazıldı: bu dosya.
