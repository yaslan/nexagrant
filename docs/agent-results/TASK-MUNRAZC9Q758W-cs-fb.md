# TASK-MUNRAZC9Q758W — cs-fb — FB TAKİP: İNCELEME-57 Y-1/Y-2/Ö-1 + İNCELEME-62 O-1/O-2

**Durum: TAMAM**
Dal: `cs-fb/munraz-csp-ci` → commit'ler `37c17d7a` (CSP) + `e49feaf7` (CI/test), dev'e merge `68e48e11`. **Push yapılmadı.**
Çalışma: kendi worktree'm, izole DB `csfb-80x-pg` (:55880). Paylaşılan :5433'e yazılmadı.
**Platform:** yalnız macOS'ta doğrulandı (Darwin 27, Node 26.5, Chromium 1243 / Playwright). Değişen kodun platforma bağlı bir yolu yok: HTTP başlıkları, Next matcher regex'i, JSON ayrıştırma. Süreç öldürme, dosya yolu ya da kabuk kodu yok. CI kapısı GitHub'ın `ubuntu-latest` runner'ında `bash -e` ile koşacak. Çok satırlı `run:` bloğunda vitest hata verirse kapı adımına geçilmez. Linux ve Windows'ta koşulamadı, bu makinede o ortamlar yok. Gerçek GitHub runner'da da henüz koşulmadı (push yok).

| Bulgu | Sonuç |
|---|---|
| **Y-1** noktalı yolun 404'ünde CSP yok | **Kapandı.** `/foo.bar`, `/wp-login.php`, `/.env`, `/tr/yok.html` → 404 + CSP + nonce; bütün `<script>` etiketleri nonce taşıyor (31/31). Statik dosyalar CSP'siz, 1–17 ms. |
| **Y-2** matcher testsiz, M17 yaşıyor | **Kapandı.** Matcher testte Next'in kendi derleyicisiyle derleniyor. M17 → 16 test kırmızı. |
| **Ö-1** report-uri yok | **Kapandı.** `report-uri /api/csp-report`: oturumsuz, yalnız log, 8 KiB sınır, istemci başına + genel dakika sınırı. Gerçek Chromium ihlali uçtan uca loglandı (enforce ve report-only). `report-to` bilinçli olarak **yok**: ölçüm §2.4'te. |
| **O-1** CI AUTH_SECRET koruması testsiz | **Kapandı**, iki katmanla: (a) `live-db-role` birim testi M1/M2/M3'ü öldürüyor; (b) CI Test adımında `*.live` skipped=0 kapısı var. M3 CI'da: vitest yeşil (38 skipped) → **kapı exit 1**. |
| **O-2** auditevent'te atlama "geçti" sayılıyor | **Kapandı.** `ctx.skip` kullanılıyor. Aynı kalıp `system-scope.live`'da da vardı (5 test), o da düzeltildi. Bekçi test kalıbın geri gelmesini engelliyor. |
| **Yeni** — kapının ilk tam koşumu | `evidence-upload-s3.live` CI'da 13 testi sessizce atlıyor, vitest yeşil. Dosyadaki yoruma göre bu bilinçli (CI'da S3 servisi yok). Gerekçesiyle izin listesine yazıldı. Bkz. §5. |

## 1. Ne yapıldı
**Y-1: `src/proxy.ts`**
- Matcher'daki `.*\..*` dışlaması yalnız statik dosya uzantılarını dışlayacak biçimde daraltıldı: `ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map`. `/api`, `/_next` ve `/_vercel` eskisi gibi dışarıda.
- Yerel öneki olmayan noktalı yollar (`/foo.bar`, `/.well-known/…`) artık proxy'den geçiyor, ama **next-intl'e verilmiyor**: `NextResponse.next({request:{headers}})` ile yalnız CSP ekleniyor. Yönlendirme davranışı eskisiyle aynı: `/foo.bar` hâlâ 404, `/tr/foo.bar`'a 307 olmuyor. Böylece `.well-known` gibi yollar da bozulmuyor.

**Y-2: `src/lib/security-headers.test.ts`**
- `config.matcher`, `next build` ve router'ın kullandığı fonksiyonlarla derleniyor: `getMiddlewareMatchers` ve `getMiddlewareRouteMatcher`.
- 13 yol "çalışır", 11 yol "atlanır" diye sabitlendi.
- `public/` altındaki **her** dosyanın matcher dışında kaldığı kontrol ediliyor. Proxy'ye düşen bir `public/` dosyası `/tr/<dosya>`'ya yönlenip kırılırdı.
- Proxy'nin noktalı yol davranışı da test ediliyor: yönlendirme yok, CSP ve nonce var.

**Ö-1: `src/lib/csp-report.ts`, `src/app/api/csp-report/route.ts`, `security-headers.ts`**
- İki biçim de okunuyor: eski `{"csp-report":…}` ve Reporting API dizisi.
- Kabul edilen içerik türleri `application/csp-report`, `reports+json` ve `json`. Diğerleri 415 alıyor.
- Gövde, `Content-Length` bildirimine bakılmadan akış olarak **8 KiB'ta kesiliyor** (413). Yalan söyleyen `Content-Length` da test ediliyor.
- Hız sınırı: istemci başına 20/dk (`clientIpFrom` + IPv6 /64 kovası) ve süreç geneli 300/dk (IP döndürmeye karşı). Aşımda 429 dönüyor, log yazılmıyor.
- Log satırında yalnız dört alan var, her biri en çok 200 karakter, yazdırılamaz karakterler `?` yapılıyor:
  - directive
  - engellenen kaynağın **origin**'i ya da `inline`/`eval` anahtar sözcüğü
  - sayfanın **yolu**: sorgu dizesi atılıyor, çünkü davet linkinde token var
  - disposition
- IP, user-agent ve script örneği loglanmıyor.
- Uç `/api` altında, bu yüzden sayfa CSP'si yerine next.config'deki statik API CSP'sini alıyor.

**O-1**
- `tests/helpers/live-db-role.test.ts`: `isCi`, `skipOrFailInCi`, `requireRlsTestUrl` ve `requireTestEnv` için CI ve yerel dallar test ediliyor.
- `scripts/live-skip-gate.ts` + `scripts/check-live-skips.ts`: vitest JSON raporunu okuyor. Bir `*.live` testi `passed`/`failed` dışında bir durumdaysa exit 1 veriyor. Raporda hiç live dosyası yoksa, hiç live test geçmemişse ya da bir live dosyası sonuç üretmemişse de reddediyor (boş kapı olmasın diye).
- İzin listesinde iki kayıt var: k1 REAL OpenAI ve evidence-upload-s3.
- `ci.yml` Test adımı: `pnpm exec vitest run --passWithNoTests --reporter=default --reporter=json --outputFile.json=vitest-report.json`, ardından kapı. `pnpm test --reporter` kullanılmadı, çünkü pnpm `--reporter`'ı kendi bayrağı sanar.
- `tests/live-skip-gate.test.ts`: kapı mantığını, CLI çıkış kodlarını, ci.yml Test adımını (JSON raporlayıcı → kapı sırası, AUTH_SECRET) ve O-2 bekçisini sabitliyor.

**O-2**
- `auditevent-null-system-only.live` (5 test) ve `system-scope.live` (5 test): `return expect(skipReason).toBeTruthy()` → `return ctx.skip(skipReason)`.

## 2. Kanıt
Tüm çıktılar `TASK-MUNRAZC9Q758W-cs-fb-ekler/` altında.

### 2.1 `next build` (EXIT=0) + `next start` + curl (`curl.txt`)
```
/foo.bar             404 CSP=yes nonce=yes scripts=31 nonced=31  | report-uri /api/csp-report
/tr/yok.html         404 CSP=yes nonce=yes scripts=19 nonced=19  | report-uri /api/csp-report
/wp-login.php        404 CSP=yes nonce=yes scripts=32 nonced=32  | report-uri /api/csp-report
/.env                404 CSP=yes nonce=yes scripts=31 nonced=31  | report-uri /api/csp-report
/tr                  200 CSP=yes nonce=yes scripts=39 nonced=39
/tr/main/dashboard   307 CSP=yes … location: /tr/giris
/                    307 CSP=yes … location: /tr
--- static (no page CSP expected)
200 0.001966s /logo.png           csp=
200 0.001770s /favicon.ico        csp=
200 0.000982s /next.svg           csp=
200 0.000937s /_next/static/chunks/03-3r36aa59-x.js   csp=
200 0.028249s /_next/image?url=…  csp=Content-Security-Policy: script-src 'none'; …   (Next'in kendi görsel CSP'si, bizim değil)
405 0.001504s /api/csp-report     csp=Content-Security-Policy: default-src 'none'; …   (statik API CSP)
--- nonce per request: 'nonce-IAcOTY03…' ≠ 'nonce-NE7HHFU/…'
```
`/foo.bar` önceden (İNCELEME-57) CSP'sizdi. Artık yönlendirme olmadan 404 dönüyor ve CSP taşıyor.

### 2.2 Gerçek Chromium ihlali → sunucu logu (`browser.txt`, `browser-violation.cjs`)
Sayfaya parser üzerinden `<img onerror=…>` (inline işleyici) ve `https://evil.example` görseli eklendi:
```
/foo.bar injected inline ran = 0 | next runtime present = true
/tr injected inline ran = 0 | next runtime present = true
report requests: 4 POST application/csp-report
[WARN] csp violation {"directive":"img-src","blocked":"https://evil.example","page":"/foo.bar","disposition":"enforce"}
[WARN] csp violation {"directive":"script-src-attr","blocked":"inline","page":"/foo.bar","disposition":"enforce"}
(+ /tr için aynı iki satır)
```
`CSP_MODE=report-only` ile (`report-only.txt`): başlık `content-security-policy-report-only` oluyor, enjekte işleyici **çalışıyor** (`ran = 1`) ve 4 ihlal `"disposition":"report"` ile loglanıyor. Ö-1'in amacı buydu: geri alma modunda da ihlaller görülebiliyor.

Not: ilk denemede `createElement('script')` ile betik ekledim. `'strict-dynamic'` buna bilerek izin verir, dolayısıyla o ölçüm geçersizdi. Parser'ın eklediği işleyiciye geçtim.

### 2.3 Rapor ucu, curl (`report-endpoint.txt`)
```
legacy: 204 · text/plain: 415 · 9 KB: 413 · bad json: 400 · GET: 405
25 from one IP: 20×204, 5×429
[WARN] csp violation {"directive":"script-src-elem","blocked":"https://evil.example","page":"/tr/accept-invite","disposition":"enforce"}
token in log: 0   cookie in log: 0
```

### 2.4 Neden `report-to` yok (`spike.txt`, `spike-report-to.cjs`)
Yerel sunucuda Chromium 1243 ile üç varyant denendi, 70 sn beklendi:
```
A: report-uri only                                  → geldi (/r/A application/csp-report)
B: report-uri + report-to + göreli Reporting-Endpoints → hiçbiri gelmedi
C: report-uri + report-to + mutlak Reporting-Endpoints → hiçbiri gelmedi
hits: ["/r/A application/csp-report"]
```
Politikada `report-to` varken Chromium `report-uri`'yi bırakıyor ve raporu Reporting API kuyruğuna alıyor. Reporting API bu ortamda 70 sn içinde hiç teslim etmedi. Doğrulayamadığım yolu göndermek yerine yalnız `report-uri` bıraktım. Test, `report-to` eklenirse kırmızı veriyor. Ayrıca bkz. §4.

### 2.5 Mutasyon: 19/19 öldü (`mutants.txt`, `mutants.py`)
Mutant, python'da tek eşleşme doğrulamasıyla uygulandı, hedef test koşuldu, sonra `.bak`'tan geri yüklendi.
```
KILLED  M17 matcher→['/api/:path*']            Tests 16 failed | 34 passed (50)
KILLED  Y1-old matcher .*\\..*                   Tests  4 failed
KILLED  matcher drops public exclusion (svg)      Tests  1 failed
KILLED  proxy: dotted bypass removed (always intl) Tests 1 failed
KILLED  CSP: report-uri dropped / report-to added  1 failed / 1 failed
KILLED  csp-report: query kept / body cap off / global limit off / control chars kept
KILLED  O-1 M1 requireTestEnv warn only           Tests 2 failed | 15 passed (17)
KILLED  O-1 M2 isCi()→false                       Tests 3 failed
KILLED  O-1 M3 value→undefined                    Tests 1 failed
KILLED  gate: skipped allowed / vacuous report passes
KILLED  ci.yml: gate line removed / back to pnpm test / AUTH_SECRET removed
KILLED  O-2: auditevent back to expect(skipReason)
```
"vacuous report" mutantının ilk biçimi (satırı silmek) sözdizimi hatasıyla "ölüyordu". Bu geçerli bir ölüm değildi. `if (false)` biçimiyle yeniden koşunca eşdeğer çıktı, çünkü ikinci dal da boş raporu reddediyordu. Testi mesaja sabitledim, şimdi kırmızı.

### 2.6 O-1: İNCELEME-62'deki gerileme artık CI'da kırmızı (`m3-gate.txt`)
M3 uygulandı, `CI=true`, ci.yml'deki AUTH_SECRET kullanıldı:
```
Tests  6 passed | 38 skipped (44)      vitest EXIT=0    ← eskiden adım burada yeşil biterdi
live-skip gate: 3 live files, 6 live tests passed, 0 allowed skip(s)
  SKIPPED: tests/invitation-accept.live.test.ts :: … [skipped]
gate EXIT=1
```

### 2.7 O-2: yerelde atlama artık "skipped" (`o2-before-local.txt` / `o2-after-local.txt`)
`DATABASE_URL_RLS_TEST` olmadan, `CI` yokken:
```
önce (dev):  Tests  11 passed (11)
sonra:       Tests  1 passed | 10 skipped (11)      (geçen 1 test DB'siz statik kontrol)
CI=true:     refusing to skip in CI — DATABASE_URL_RLS_TEST is not set …  Test Files 1 failed
```

### 2.8 Tam koşum: ci.yml Test adımının birebir aynısı (`full.txt`, `gate-after-allow.txt`)
`CI=true`, ci.yml'deki AUTH_SECRET, izole DB, load 34:
```
Test Files  274 passed | 2 skipped (276)
Tests  3326 passed | 22 skipped (3348)        vitest EXIT=0
live-skip gate: 41 live files, 363 live tests passed … SKIPPED: tests/evidence-upload-s3.live.test.ts ×13   gate EXIT=1
→ izin listesine eklendikten sonra aynı raporda:
live-skip gate: 41 live files, 363 live tests passed, 14 allowed skip(s)   gate EXIT=0
```
Kalan 8 skipped `*.live` dışında. Kapı yalnız `*.live` dosyalarına bakıyor.

### 2.9 Kapılar
- `tsc` 0, `lint` 0, `i18n:check` 0 (son düzenlemelerden sonra yeniden koşuldu).
- `next build` EXIT=0. Rota listesinde `ƒ /api/csp-report` ve `ƒ Proxy (Middleware)` var.
- İlk tsc koşumu kırmızıydı: `getMiddlewareMatchers` next'in `.d.ts`'inde dışa açılmamış. Tipli bir `createRequire` ile çözüldü.
- Merge sonrası dev'de `src tests scripts .github next.config.ts` dalla birebir aynı (`git diff --quiet` → "code tree == branch"). Dev'in arada aldığı 4 commit yalnız `docs/` altında.

## 3. Değişen dosyalar
- `src/proxy.ts`, `src/lib/security-headers.ts`, `src/lib/security-headers.test.ts`
- `src/lib/csp-report.ts` (yeni), `src/lib/csp-report.test.ts` (yeni), `src/app/api/csp-report/route.ts` (yeni)
- `.github/workflows/ci.yml` (Test adımı), `.gitignore` (`/vitest-report.json`)
- `scripts/live-skip-gate.ts` (yeni), `scripts/check-live-skips.ts` (yeni)
- `tests/helpers/live-db-role.test.ts` (yeni), `tests/live-skip-gate.test.ts` (yeni)
- `tests/auditevent-null-system-only.live.test.ts`, `tests/system-scope.live.test.ts`
- Bu rapor ve `TASK-MUNRAZC9Q758W-cs-fb-ekler/`

## 4. Riskler
- **CI Test adımı değişti ve gerçek runner'da henüz koşmadı.** Yerelde birebir aynı komutla koşuldu. İlk push'ta bakılması gerekenler: `vitest-report.json` yazıldı mı, kapı satırı "41 live files … gate EXIT 0" mı. Bu arada push'a bağlı başka bir iş de var: İNCELEME-62'de "38 test CI'da ilk kez koşacak" denmişti. Kapı artık bunu da ölçüyor.
- **Yeni bir `*.live` atlaması CI'ı kırmızıya çevirir.** Amaç bu, ama bilinçli bir atlama eklemek isteyen kişi `ALLOWED_LIVE_SKIPS`'e gerekçeli bir satır yazmak zorunda.
- **Matcher uzantı listesi:** listede olan bir uzantıyla biten, var olmayan bir yol (`/yok.png`) 404 HTML'ini hâlâ CSP'siz alıyor. Yol yalnız resim, font, css, js vb. uzantılarla sınırlı ve yansıyan yol kaçışlı (İNCELEME-57). Kalan açık küçük ama sıfır değil. `public/`'e bu listede olmayan bir uzantı eklenirse test kırmızı verir.
- **Next iç API'si:** matcher testi `next/dist/...` altındaki iki iç fonksiyonu kullanıyor. Next yükseltmesinde yolları değişirse test kırmızı verir; sessizce yeşil kalmaz.
- **Hız sınırı süreç içi.** Birden çok örnekte sınırlar örnek başına geçerli. Rapor kaybolsa bile zararsız olduğu için ortak bir depo kurulmadı.
- **Log hacmi:** gerçek bir ihlal (ör. yeni bir 3. parti) her sayfa görüntülemede bir satır üretir. Genel 300/dk sınırı üst sınırı koyuyor.
- **`report-to` yok:** `report-uri` spec'te deprecated. Chromium bir gün desteği bırakırsa raporlar kesilir. Bugün ölçülen durumda çalışan tek yol bu.

## 5. Açık sorular
1. **evidence-upload-s3.live CI'da hiç koşmuyor** (13 test: B-1/B-2 kanıt yükleme güvenliği). İzin listesiyle görünür kılındı ama kapatılmadı. `ci.yml`'e bir MinIO service container eklenirse bu kayıt silinebilir. Ayrı kart açılsın mı? Önerim: evet (devop-fb).
2. `report-to` HTTPS'li gerçek alanda çalışıyor mu? Staging'de ölçülmeden eklenmemeli.
3. Ürün tarafında CSP raporlarını izleyecek biri var mı? Şu an yalnız stdout'a `[WARN] csp violation` yazılıyor, SystemAlert'e bağlı değil.

## 6. Sonraki adım
- İnceleme.
- İlk push'ta CI Test adımında kapı satırını ve `oauth-registration`/`invitation-accept` passed sayılarını kontrol et.
- §5-1 için kart kararı.
- Temizlik: worktree `scratchpad/wt` ve `csfb-80x-pg` konteyneri incelemeden sonra silinecek. Sunucu kapatıldı (:47981 dinlemiyor). Geçici `.env` yalnız worktree'de.
