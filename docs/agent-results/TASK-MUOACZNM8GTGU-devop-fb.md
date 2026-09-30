# TASK-MUOACZNM8GTGU — FB TAKİP (İNCELEME-98 Y-1/D-1 + İNCELEME-99 Ö-1) — devop-fb

**Durum:** TAMAM
**Dal:** `devop-fb/muoacz-csp-case` (dev `c3ba06d2`'den), dev'e merge edildi, push yapılmadı.

Özet: Harf ve yazım varyantlarında dönen HTML 404'ler artık CSP'li. Baseline'da 16 yol CSP'siz dönüyordu, yeni build'de 0. Gerçek statik dosyalar proxy'siz ve CSP'siz kalıyor, önbellek başlıkları ve 304 davranışı değişmedi. X2–X4 ve eklediğim 7 mutantın (P1–P7) hepsi kırmızı. İNCELEME-99 Ö-1 testi eklendi, S1b artık yakalanıyor. tsc, lint, i18n, build ve tam vitest 0 hatayla geçti.

## 1) Ne yapıldı

### a) Kök neden ve seçilen çözüm (Y-1)
Kök neden: next.config header kuralı harfe **duyarsız**. Gerçek dosya istisnaları (`logo.png$`, `_next/static/`, `_next/image$`) bu yüzden `/Logo.png` ve `/_next/Image` gibi yolları da dışarıda bırakıyor. Proxy matcher'ın uzantı istisnası ise harfe **duyarlı** ama uzantı küçük harfle yazıldığında o da bu yolları atlıyor. Sonuç: yol iki taraftan da düşüyor ve Next'in uygulama 404'ü CSP'siz gidiyor.

Görev, gerçek varlıkların CSP'siz ve önbellekli kalmasını istiyor. crw-fb'nin spike'ı (istisnaları kaldırmak) gerçek dosyalara da CSP ekliyordu, bu yüzden onu seçmedim. Onun yerine harfleri ayırt edebilen tek taraf olan **proxy matcher**'ı sıkılaştırdım (`src/proxy.ts` `config.matcher[2]`):

```
eski: (?!api(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|.*\.(?:EXT)$)
yeni: (?!api(?:/|$)|_vercel(?:/|$)|_next/static/|_next(?:/[-a-z0-9_./]*)?$|[-a-z0-9_./]*\.(?:EXT)$)
```

- Statik uzantılı bir yol ya da `/_next/…` yolu, proxy tarafından yalnız **düz küçük harfli ASCII** (`[-a-z0-9_./]`) olduğunda atlanıyor. public/'teki bütün dosyalar bu kalıba uyuyor ve test bunu kontrol ediyor.
- Diğer her yazım proxy'den geçiyor ve nonce'lu CSP alıyor: büyük harf, `%`, ASCII dışı karakter. Örneğin `ı` karakteri `/i` altında `I`'ya katlanıyor. Bu yüzden `[^A-Z]` yetmezdi (P2 mutantı).
- Tek istisna `/_next/static/`, ardından ne gelirse gelsin atlanıyor. Chunk ve build kimliği adlarında büyük harf var (ölçüldü: `/_next/static/LgL9nAKp-oMvQM8bnOeaI/_ssgManifest.js`). Bu önekte eksik chunk zaten düz metin 404 dönüyor.
- `proxy()`: `isLocalelessDottedPath` fonksiyonunun adı `isPolicyOnlyPath` oldu. Artık harfe bakmadan her `/_next` ve `/_vercel` yolunu next-intl'e sokmadan geçiriyor. Böylece `/_next/Image` ya da `/_Next/yok` için `/tr/_next/Image`'e 307 yönlendirme yerine CSP'li bir 404 dönüyor.
- Header kuralı (`staticFileNotFoundSource`) **değişmedi**. Harfe duyarsız kaldı ve küçük harfli eksik dosyaları kapsamayı sürdürüyor.

Performans: Gerçek dosya yolları eskisi gibi proxy'yi hiç çağırmıyor. Proxy'ye yeni giren yollar yalnız hiçbir dosyanın karşılamadığı 404'ler.

### b) Testler (`src/lib/security-headers.test.ts`, 93 → 127 test)
- **X4:** `script-src` ile başlayan hiçbir yönerge olmaması iddia ediliyor. `script-src-elem` ve `script-src-attr` yakalanıyor.
- **X2/X3:** Beklenen `'static'` olan yeni satırlar: `/_next/imagex`, `/_next/image/x`, `/_next/static`, `/_next/staticfoo`, `/_next/statics/x.js`.
- **Y-1:** Beklenen `'nonce'` olan 14 satır: `/Logo.png`, `/LOGO.PNG`, `/Next.svg`, `/Favicon.ico`, `/Favicon.ICO`, `/favicon.ICO`, `/_next/Image`, `/_next/IMAGE`, `/_next/STATIC/x.js`, `/_next/Static/chunks/x.js`, `/_NEXT/static/x.js`, `/_Next/yok`, `/_VERCEL/x`, `/favıcon.ico`.
- **Özellik testi:** public/'teki her dosya, `/favicon.ico`, `/_next/image` ve bir chunk için her tek harfli büyük harf varyantı, tamamı büyük harf ve baş harfi büyük yazım üretiliyor. Hiçbirinin sonucu `'none'` olmamalı (>50 varyant). Gerçek adların sonucu `'none'`.
- **Matcher:** "Proxy çalışır" listesine 8 varyant, "atlar" listesine büyük harfli chunk, `/_next/webpack-hmr` ve build kimlikli manifest eklendi.
- **`proxy()`:** `/_next/Image`, `/_NEXT/yok` ve `/_Vercel/x` için yönlendirme yok, `x-middleware-next=1` ve nonce'lu CSP var.
- **Değişen beklentiler:** `/TR/yok.png` ve `/API/x.png` için beklenen `static`/`api` değeri `nonce` oldu. Bu yollar artık düz küçük harfli olmadıkları için proxy'den geçiyor. İkisi de uygulama 404'ü ve yine CSP'li (matris ve tarayıcı ölçümü aşağıda).

### c) Kapsam iddiasının düzeltilmesi
- `src/lib/security-headers.ts`: "The one thing case-folding costs: `/_NEXT/static/x.js`" cümlesi, gerçek kapsamı anlatan bir paragrafla değiştirildi. Paragraf varyantları ve Node 22'de `(?-i:…)` olmadığını anlatıyor ve proxy'nin açığı nasıl kapattığını gösteriyor.
- `next.config.ts`: statik kuralın yorumuna tek cümlelik bir not eklendi.
- `docs/agent-results/TASK-MUO06ANN5D3RM-cs-fb.md` R-2: özgün metin korundu, altına düzeltme notu eklendi.

### d) İNCELEME-99 Ö-1 (`src/lib/agency/report.test.ts`)
`if (endpoint) expect(funnel(endpoint)).toEqual(buildAgencyFunnel(raw, endpoint))` satırı, `dashboard()` içinde 81 il döngüsünün sonrasına ve `return`'ün hemen önüne taşındı. Taze sonuç artık kapanışın 83 çağrısından sonra karşılaştırılıyor. Doküman yorumu da güncellendi.

## 2) Kanıt
Ekler: `docs/agent-results/TASK-MUOACZNM8GTGU-devop-fb-ekler/`

**curl matrisi** (`matrix-baseline.txt`, `matrix-yeni.txt`, `matrix-fark.txt`): Her iki build'de `next build` + `next start` ile, crw-fb'nin 93 yolu ve 27 ek varyant, toplam 120 yol:
```
baseline (dev c3ba06d2, :3940): 120 yol; CSP'siz text/html: 16
yeni     (bu dal,       :3941): 120 yol; CSP'siz text/html: 0
baseline açıkları: /Logo.png /Next.svg /Favicon.ico /_NEXT/static/x.js /_next/STATIC/x.js /_next/Static/chunks/x.js
  /_next/Image /_next/IMAGE /FavIcon.ico /lOgo.png /File.svg /Vercel.svg /Window.svg
  /_next/Image?url=%2Flogo.png&w=64&q=75 /_next/imAge /_Next/static/x.js
```
Bütün satırlarda CSP başlık sayısı en fazla 1, yani çift CSP yok.

**Gerçek dosyalar** (`real-baseline.txt`, `real-yeni.txt`): 12 dosya, `diff` sonucu yalnız ETag'teki mtime farklı. `/logo.png`, 5 svg ve `/favicon.ico` 200 dönüyor, CSP=0, `public, max-age=0`. Chunk, build manifestleri ve media 200 dönüyor, CSP=0, `max-age=31536000, immutable`. `/_next/image?url=…` 200 dönüyor ve tek CSP başlığı Next'in kendisininki. `If-None-Match` ile `/logo.png` ve chunk 304 dönüyor, iki build'de de aynı.

**Tarayıcı** (`browser.txt`, `kareler/`; Chromium headless, crw-fb'nin `pwned` enjeksiyonu):
```
baseline: /Logo.png /_next/STATIC/x.js /_NEXT/static/x.js /_next/Image /Next.svg  → csp=null pwned=true
yeni:     aynı 7 varyant (+/Favicon.ICO, /_Next/yok) → csp nonce, pwned=false, nextRan=true, 1 ihlal (enjeksiyon)
          /tr/login 200 pwned=false · /yok.png static CSP (değişmedi) · /logo.png 200 csp=null (değişmedi)
```

**Mutantlar** (`mut-csp.py`, `mut-csp-yeni.out`, `mut-csp-baseline.out`):
```
baseline:  X2 SURVIVED · X3 SURVIVED · X4 SURVIVED (93/93)
yeni:      X2 KILLED (2) · X3 KILLED (3) · X4 KILLED (1)
           P1 eski .* uzantı       KILLED (15)   P2 [^A-Z] (ı katlanması) KILLED (3)
           P3 eski _next(?:/.*)?   KILLED (7)    P4 sınıfa A-Z            KILLED (16)
           P5 _next/static/ yok    KILLED (2)    P6 proxy _next geçişi yok KILLED (3)
           P7 geçiş /i'siz         KILLED (2)
```
**Ö-1 mutantları** (`mut-o1.py`, `src/lib/agency/`):
```
baseline: S1 KILLED (1 failed) · S1b SURVIVED (88/88)
yeni:     S1 KILLED (2 failed) · S1b KILLED (1 failed); mutantsız 88/88
```

**Kapılar** (`gates.txt`, `full-summary.txt`, `full.meta`):
```
tsc --noEmit exit=0 · eslint exit=0 · i18n-check exit=0 · next build exit=0
vitest (tam, izole DB :5611): Test Files 296 passed | 2 skipped (298); Tests 3822 passed | 41 skipped (3863); VITEST_EXIT=0; check-live-skips SKIPGATE=0
```
İzole DB `devopfbcz-pg` (pgvector pg16), 127.0.0.1:5611'de: migrate diff şeması → `db:rls-role` → `apply-migrations` ×2 (her seferinde 41 dosya) → `db:rls` 28 → 112 → seed (`db-prep.txt`). Paylaşılan :5433'e yazılmadı. Build'deki "process.exit … Edge Runtime" uyarısı baseline build'inde de var, yeni değil.

## 3) Değişen dosyalar
- `src/proxy.ts`: matcher, `isPolicyOnlyPath`, yorum
- `src/lib/security-headers.ts`: yalnız yorum (kapsam düzeltmesi)
- `next.config.ts`: yalnız yorum
- `src/lib/security-headers.test.ts`: X2–X4 ve Y-1 testleri
- `src/lib/agency/report.test.ts`: Ö-1
- `docs/agent-results/TASK-MUO06ANN5D3RM-cs-fb.md`: R-2 düzeltme notu
- `docs/agent-results/TASK-MUOACZNM8GTGU-devop-fb.md` ve `…-ekler/`

## 4) Riskler
- **Davranış değişikliği:** Büyük harf ya da `%` içeren eksik yollar artık statik CSP yerine nonce CSP alıyor (`/TR/yok.png`, `/API/x.png`, `/Robots.txt`, `/%61pi/yok.png`, `/_next%2Fstatic/x.js`). `/_Next/yok`, `/_VERCEL/x` ve `/_NEXT/image` artık 307 yönlendirme yerine 404 dönüyor. Hepsi uygulama 404'ü ve hepsi CSP'li. Nonce politikasında sayfa hydrate oluyor (`nextRan=true`), bu yüzden kullanıcı tarafında 404 metni daha iyi görünüyor.
- **public/'e büyük harfli bir dosya eklenirse** proxy o dosya için de çalışır. Dosya yine sunulur, ama nonce CSP alır ve proxy maliyeti oluşur. "skips every file in public/" testi bu durumda kırmızı yanar; adı küçük harfe çevirmek yeterli.
- **Rollback:** Merge commit'ini `git revert -m 1 <merge>` ile geri al. Yalnız matcher satırını eski haline getirmek de yeterli. Şema ya da veri değişikliği yok.
- **İzleme:** CSP ihlalleri `/api/csp-report` üzerinden geliyor. Yeni bir uyarı gerekmiyor; kapsam test ile sabitlendi.

## 5) Açık sorular
- Yok.

## 6) Sonraki adım
- crw-fb'nin Ö-1 önerisi (R-1: geçersiz locale için boş beyaz 404) ayrı bir kart olarak duruyor, bu işin kapsamında değil.
- Push lidere ait.

**Platform beyanı:** Yalnız mac'te doğrulandı (Darwin 27, arm64, Node 26.5, Next 16.3.4, Chromium headless shell). Değişen kod, harfe duyarlı olan Next middleware matcher'ı ile JS regex. Dosya yolu, süreç ya da kabuk kullanmıyor, bu yüzden davranış Linux'ta (CI, Docker `node:22-alpine`) ve Windows'ta aynı. Matcher Next tarafından derlenip URL pathname'ine uygulanıyor; işletim sisteminin dosya sistemi harf duyarlılığı buna etki etmiyor. Çözüm Node 22'de de çalışıyor çünkü `(?-i:)` gibi yeni bir regex özelliği kullanmıyor. Linux ve Windows bu makinede olmadığı için koşulamadı; Linux'u CI koşacak. Ölçüm betikleri bash, python3 ve BSD `sed -i ''` kullanıyor, sonuncusu mac'e özgü.
