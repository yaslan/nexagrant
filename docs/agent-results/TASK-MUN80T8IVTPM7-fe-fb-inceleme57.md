# TASK-MUN80T8IVTPM7 — fe-fb — İNCELEME-57: güvenlik başlıkları + nonce CSP (Y-2, D-1, D-2)

**Karar: ONAY** — bloklayan bulgu yok. İki yumuşak bulgu (Y-1, Y-2) ve bir gözlem (Ö-1) var; CSP işinden bağımsız, zaten var olan dört sorun ayrıca listelendi (Ö-2..Ö-5).
**Durum: TAMAM**
İncelenen: `795d69ba`, `31dcd46d` (devop-fb) · çalıştırılan ağaç: dev `05cf050f` (production `next build` + `next start`, port 47957) · izole DB `fb_fefb_i57`.
**Platform:** yalnız macOS (Darwin 27, Chromium 1243 / Playwright) üzerinde doğrulandı. İncelenen kod platformdan bağımsız: HTTP başlıkları ve Web Crypto nonce. Süreç öldürme, dosya yolu ya da kabuk kodu yok, bu yüzden Linux/Windows'ta farklı davranması beklenmez. Linux ve Windows'ta koşulamadı, çünkü bu makinede o ortamlar yok.

| # | Tür | Bulgu | Önem |
|---|-----|-------|------|
| Y-1 | yumuşak | Proxy matcher'ı noktalı yolları (`.*\..*`) atlıyor. Bu yüzden `/foo.bar` gibi yerelsiz ve noktalı bir yol, **31 script'li uygulama 404 HTML'ini CSP olmadan** döndürüyor (nonce yok, 24 inline `<script>`). `X-Frame-Options: DENY` ve diğer statik başlıklar yerinde. Yol, RSC yükünde kaçışlı olarak yansıyor; ham `<script>` enjeksiyonu görülmedi. | düşük |
| Y-2 | yumuşak (test boşluğu) | `src/proxy.ts` `config.matcher` hiçbir testte sabitlenmemiş. **M17** mutantı (matcher → `['/api/:path*']`) canlı kaldı: 21/21 test geçti. Oysa bu mutantla hiçbir sayfa CSP almaz. Birim testleri `proxy()` fonksiyonunu doğrudan çağırıyor ve matcher'ı hiç görmüyor. Öneri: matcher'ı sabitleyen bir test (`/tr`, `/tr/main/dashboard`, `/` eşleşir; `/api/x` ve `/_next/x` eşleşmez), ya da `next start` üzerinde başlığı `curl` ile kontrol eden canlı bir test. | orta-düşük |
| Ö-1 | gözlem | `CSP_MODE=report-only` geri alma anahtarı çalışıyor (kanıt aşağıda). Ancak politikada `report-uri`/`report-to` yok: ihlaller yalnız ziyaretçinin konsolunda kalıyor. Report-only modunda üretimde hangi kaynağın engellenebileceği gözlenemez. | bilgi |
| Ö-2 | CSP'den bağımsız, önceden var | `/[locale]/calls/[region]` (tek SSG rota): `/tr/calls/germany`, `/en/calls/france`, `/tr/calls/eu` → **500** `DYNAMIC_SERVER_USAGE`. Önceki commit'te (`795d69ba^` = `90007fe3`, ayrı build) de **500**. CSP regresyonu değil. | başka kart |
| Ö-3 | önceden var | `concept-notes/[id]` sayfası seed şablonlarında çöküyor (`TypeError … reading '0'`). Seed `ConceptTemplate.schema` bir dizi, sayfa ise `{sections}` bekliyor. Export route `templateSections()` ile iki biçimi de okuyor, sayfa okumuyor. | başka kart |
| Ö-4 | önceden var | Konsept notu DOCX export'u **500** veriyor: `Content-Disposition` dosya adına fırsat başlığı ham yazılıyor (`District renovation pilot — İzmir`, `—` = U+2014) ve `ByteString` hatası çıkıyor (`src/app/api/concept-notes/[id]/export/route.ts:101`). Doğru biçim: RFC 5987 `filename*=UTF-8''…`. | başka kart |
| Ö-5 | önceden var | Google ile giren kullanıcının avatarı kırık: `/_next/image?url=https://lh3.googleusercontent.com/…` → **400** `"url" parameter is not allowed`, çünkü `remotePatterns` yalnız unsplash'i içeriyor (`795d69ba^`'da da aynı). CSP açısından sorun yok, görsel `/_next/image` ('self') üzerinden geliyor. Düzeltilirken `unoptimized` seçilirse `img-src` bu hostu da içermeli. | başka kart |

**HSTS preload:** kasıtlı olarak **kapalı**. Başlık `Strict-Transport-Security: max-age=31536000; includeSubDomains` (preload yok). Birim testi bunu sabitliyor: M2 mutantı (`; preload` eklemek) öldü. Karar patronda bekliyor.

## 1. Ne yapıldı
- dev `05cf050f` üzerinde production build (`EXIT=0`) + `next start` çalıştırıldı. 22 yolda ham başlık taraması yapıldı: sayfalar, 404, `/api/*`, statik dosyalar, `/_next/image`.
- Nonce kontrolü: her istekte değişiyor mu, HTML'deki bütün `<script>` etiketleri başlıktaki nonce'u mu taşıyor (anonim + oturumlu sayfalar).
- Gerçek Chromium'da yürüyüş (`walk57.cjs`, `extra57.cjs`):
  - tr/en herkese açık sayfalar, giriş ve Google OAuth yönlendirmesi
  - 390 px'te fon-hazırlık sihirbazı (6 adım) + lead formu + yazdır düğmesi
  - dashboard, istemci tarafı gezinme, kanıt yükleme, NDA DOCX indirme, `/api` yazdırılabilir sayfası (`onclick` hash'i)
  - en dashboard 390 px, blog görselleri, 13 oturumlu sayfa, 404'ler
  - TipTap editörü: gerçek klavye yazımı + ⌘B + Kaydet
  - pozitif kontrol: enjekte inline betik, harici betik ve harici fetch **engellenmeli**
- `CSP_MODE=report-only` ile yeniden başlatıldı: başlık adı değişiyor mu, enjekte betik çalışıp raporlanıyor mu.
- Mutasyon: 17 mutant; `src/lib/security-headers.test.ts` her birine karşı koşuldu, sonra `git checkout` ile geri alındı.
- Regresyon ayrımı: `795d69ba^` ayrı worktree'de derlendi (`start -p 47958`). Build'e göre rota render modları ve 500'lerin önceden var olup olmadığı karşılaştırıldı.

## 2. Kanıt
**Başlık taraması** (`sweep.sh`, sayfa ve API satırları; HEAD istekleri):
```
/tr                  200 HSTS=1 XFO=DENY nosniff=1 RP=strict-origin-when-cross-origin PP=1 XPB=0 CSP=content-security-policy: default-src 'self'; scrip
/en                  200 … aynı
/tr/login, /en/login 200 … aynı
/tr/main/dashboard   307 … aynı (oturumsuz → giriş)
/tr/accept-invite/x  404 HSTS=1 XFO=DENY nosniff=1 RP=no-referrer PP=1 XPB=0 CSP=… (nonce'lu)
/tr/yok-boyle-sayfa  404 … aynı, CSP nonce'lu
/api/v1/calls        401 HSTS=1 XFO=DENY nosniff=1 RP=strict-origin-when-cross-origin PP=1 XPB=0 CSP=Content-Security-Policy: default-src 'none'; scrip
/favicon.ico, /logo.png 200 statik başlıklar var, CSP yok (dosya; beklenen)
/foo.bar             404 CSP=0, htmlScripts=31, nonced=0, inlineNoNonce=24   ← Y-1
```
`X-Powered-By` taranan yolların hiçbirinde yok. Önceki commit'te `curl -sI /tr` → `X-Powered-By: Next.js` (D-2 kapandı).
accept-invite: `/tr/accept-invite?token=abc` → 303 `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; `/en/accept-invite/continue` → 200 `no-referrer`.

**Nonce** (`nonce.sh`, her yol iki kez istendi):
```
/tr #1 hdr=wqmHSTHsgqE16qJbQ4chaA== scripts=39 withNonce=39 htmlNonces=nonce="wqmHSTHsgqE16qJbQ4chaA=="
/tr #2 hdr=XNNXFlciwZnP1B01PuCcGg== scripts=39 withNonce=39 htmlNonces=nonce="XNNXFlciwZnP1B01PuCcGg=="
/tr/main/dashboard #1 hdr=Gu9qRS9crnEotCLvPyA5Vw== scripts=32 withNonce=32 …
/tr/main/dashboard #2 hdr=wwV8NwuKbtcfHDMDnPxcqg== scripts=32 withNonce=32 …
/tr/main/opportunities/demo-opp-1/documents #1/#2 30/30 nonce'lu, farklı nonce
(/en, /tr/login, /tr/fon-hazirlik, /tr/blog, /tr/yok-boyle-sayfa: hepsi aynı desen)
```
Önbellek ve statik davranış: bütün sayfa rotaları `ƒ` (dinamik). Tek `●` rota `calls/[region]` ve o zaten 500 veriyor (Ö-2). Sayfalar `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` ile gidiyor, yani eski nonce'lu HTML önbellekten sunulmuyor. Rota modları CSP'den önceki ve sonraki build'de **aynı** (`diff` → "route render modes identical pre/post"): nonce hiçbir rotayı statikten dinamiğe çevirmedi.

**Tarayıcı yürüyüşü** (`walk57-main.json`):
```
/tr, /en, /tr/fiyatlandirma, /en/blog, /tr/calls/turkey, /en/login  status=200, lang doğru
google redirect=https://accounts.google.com/o/oauth2/v2/auth          (form-action geçti)
readiness result reached=true · print button → window.print called=1 · 390px scrollWidth=390
(lead form success box: 1. koşuda true; 2. koşuda sunucudan "Kısa sürede çok fazla talep" → hız sınırı, CSP değil)
dashboard 200 · client-side nav kept window (no full reload)=true · uploaded row visible=true
documents docx links=1 · docx name=NDA.docx bytes=9062 PK=true
print page (/api) csp=default-src 'none'; script-src 'unsafe-h… · print onclick ran=1
en dashboard lang=en scrollWidth=390
control: injected inline ran=false; aria-expanded false→true (React handlers live)
CSP violations total=7 (outside CONTROL=0)
  CONTROL: script-src-elem inline (enforce) · evil.example/x.js (enforce) · connect-src evil.example/exfil (enforce)
```
`extra57.json`:
```
blog/horizon-…-rehberi 200 imgs=3 broken=[] · /en/fiyatlandirma imgs=2 broken=[] · /tr/giris, /tr/acik-cagrilar broken=[]
13 oturumlu sayfa 200 (panel, firsatlar, cagrilar, ortaklar, iliskiler, onay-merkezi, ayarlar/*, application, m2, en pipeline); /tr/admin/tenants ve /tr/main/yok 404
editor typed: contains text=true bold=true · editor save clicked
violations=0 pageerrors=0
```
Web fontu: uygulama `next/font` kullanmıyor. `--font-sans: 'Public Sans'` ve `--font-heading: 'Newsreader'` yerel veya yedek fontlar, hiçbir `.woff2` istenmiyor. Bu yüzden `font-src` hiçbir şeyi kırmıyor.

**Report-only:**
```
content-security-policy-report-only: default-src 'self'; script-src 'self' 'nonc…   (sayfa)
Content-Security-Policy: default-src 'none'; script-src 'uns…                          (/api statik — değişmiyor, beklenen)
report-only: injected ran=true violations=["report:script-src-elem"]
```

**Birim testi + mutantlar** (`vitest run src/lib/security-headers.test.ts`, temel: 21/21 geçti):
```
M1 HSTS dropped                     KILLED (2 failed)
M2 HSTS preload added               KILLED (2)
M3 poweredByHeader true             KILLED (1)
M4 proxy: no CSP on request         KILLED (1)
M5 proxy: no CSP on response        KILLED (3)
M6 frame-ancestors none->*          KILLED (2)
M7 constant nonce                   KILLED (2)
M8 unsafe-inline in script-src      KILLED (2)
M9 /api CSP entry removed           KILLED (1)
M10 Permissions-Policy camera=(self) KILLED (1)
M11 report-only switch ignored      KILLED (1)
M12 X-Frame-Options SAMEORIGIN      KILLED (1)
M13 nosniff dropped                 KILLED (1)
M14 object-src none->self           KILLED (1)
M15 connect-src wildcard https:     KILLED (3)
M16 matcher '/(tr|en)/:path*' removed  SURVIVED — neredeyse eşdeğer (3. desen aynı yolları kapsıyor; fark yalnız /tr/x.y)
M17 matcher → ['/api/:path*']       SURVIVED (21/21) ← Y-2
```
Karar için anlamlı mutantlar 15/17 öldü. M16 eşdeğere yakın; M17 gerçek bir test boşluğu.

Kareler: `docs/agent-results/TASK-MUN80T8IVTPM7-fe-fb-inceleme57/` (`3-fon-hazirlik-result-390.png`, `4-dashboard.png`, `6-print.png`, `7-dashboard-en-390.png`, `8-editor.png`). Betikler ve JSON çıktıları da aynı klasörde.

## 3. Değişen dosyalar
Yalnız bu rapor ve kanıt klasörü `docs/agent-results/TASK-MUN80T8IVTPM7-fe-fb-inceleme57/`. Kod değişikliği yok.
İzole DB `fb_fefb_i57`: test için eklenen `FollowupDoc fefb-i57-nda`, `ConceptTemplate fefb-i57-tpl` ve `ConceptNote fefb-i57-cn` satırları, her biri tek id ile silindi. Paylaşılan fabrika DB'sine yazılmadı.

## 4. Riskler
- Y-1: gelecekte noktalı bir yolda gerçek bir HTML sayfası çıkarsa (ör. `/.well-known/…` altında bir sayfa) CSP'siz sunulur.
- Y-2: matcher'daki bir daralma (yeni bir hariç tutma) sayfaların CSP'sini sessizce kaldırır ve birim testleri bunu yakalamaz.
- HSTS `includeSubDomains` gerçek alan adında bütün alt alan adlarını HTTPS'e kilitler. HTTP-only bir alt alan adı varsa kırılır. Canlıya almadan önce alt alan listesi kontrol edilmeli (preload olmadığı için geri alınabilir: `max-age=0`).
- Google OAuth akışının dönüş yarısı (`/api/auth/callback/google`) gerçek Google hesabıyla koşulamadı; yalnız dışa yönlendirme doğrulandı. Callback `/api` altında, sayfa CSP'sinin konusu değil.

## 5. Açık sorular
- HSTS `preload`: patron kararı bekliyor (şu an kapalı ve testle sabit).
- Report-only modunda ihlal toplama (`report-to` uç noktası) istenir mi? (Ö-1)

## 6. Sonraki adım
- devop-fb (isteğe bağlı, bloklamaz): Y-2 için matcher testi ekle. Y-1 için noktalı yollarda da CSP ver: ya matcher'daki noktalı hariç tutmayı yalnız `/_next`/`/api`/dosya uzantılarıyla sınırla, ya da `next.config` `/:path*` üzerinden nonce'suz sıkı bir yedek CSP ekle (proxy'nin çalıştığı yollarda iki politika kesişeceği için dikkatle).
- Ö-2..Ö-5 ayrı kartlar olarak açılmalı (CSP'den bağımsız, önceden var olan hatalar).
