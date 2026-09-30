# TASK-MUN80T8IVTPM7 — devop-fb — Y-2 güvenlik başlıkları + D-1/D-2

**Durum: TAMAM** — kaynak: `docs/agent-results/TASK-MUN66T2HM4A4E-be-fb.md` Y-2, D-1, D-2.
Kod: `795d69ba` (başlıklar + nonce CSP + X-Powered-By kapalı). Bu turda eklenen: 1 test (hayatta kalan mutant S14 için) + bu rapor.

**Platform beyanı:** macOS (Darwin 27, arm64) üzerinde doğrulandı. Prod build Node 26 ile `next start` yerine standalone `server.js`, tarayıcı Playwright headless Chromium 1243. Değişiklik platforma bağlı değil: HTTP başlıkları ve CSP metni sunucuda üretiliyor, nonce Web Crypto ile (`crypto.getRandomValues`), dosya yolu ya da süreç çağrısı yok. Linux/Windows sunucuda da aynı baytlar çıkar. Linux ve Windows'ta **koşulmadı**, çünkü bu makinede yalnız macOS var. Firefox ve Safari'de CSP davranışı **denenmedi**. `strict-dynamic` ve nonce üçünde de destekleniyor, ama kanıt yalnız Chromium için var.

## 1. Ne yapıldı
- `next.config.ts` → `headers()` `/:path*` üzerine şunları koyuyor: `Strict-Transport-Security: max-age=31536000; includeSubDomains` (preload yok, patron kararı), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. accept-invite sayfaları `no-referrer` olarak kalıyor (sonraki giriş kazanıyor). Ayrıca `poweredByHeader: false` (D-2).
- `src/proxy.ts`: her istekte yeni bir nonce üretiyor. `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'` politikası hem isteğe (Next nonce'u buradan okuyup kendi script'lerine basıyor) hem yanıta yazılıyor.
- `/api/*` proxy'den geçmediği için ayrı, statik bir CSP alıyor: `default-src 'none'`. Tek izinli inline kod, yazdırma düğmesinin `onclick="window.print()"` işleyicisi (sha256 + `unsafe-hashes`).
- Geri alma yolu: `CSP_MODE=report-only` env değişikliği ve yeniden başlatma yeterli. Politika `Content-Security-Policy-Report-Only` olarak gider, rebuild gerekmez. Tam geri alma: `git revert 795d69ba`.
- Bu tur: mutant S14 (`isDev = NODE_ENV !== 'production'`) hayatta kaldı. Yani NODE_ENV'siz ya da `test`/`staging` ile başlayan bir sunucu `'unsafe-eval'` alırdı ve bunu hiçbir test yakalamıyordu. `src/lib/security-headers.test.ts`'e bu davranışı sabitleyen bir test eklendi.
- D-1 (çerez `Secure`) canlı ölçüldü, sonuç §2.4'te. Kod değişikliği gerekmiyor ama dağıtım sözleşmesi gerekiyor, bkz. §4.

## 2. Kanıt

### 2.1 Prod build, kendi portum (temiz worktree `7a83e7d2`, `795d69ba`'yı içeriyor)
Temiz worktree'de `pnpm install --frozen-lockfile` → `db:generate` → `typecheck` → `lint` → `env -u NODE_ENV pnpm build`: **hepsi exit 0** (`install=0 gen=0 tc=0 lint=0 build=0`).
Sunucu: standalone `server.js`, `127.0.0.1:47821`, izole DB `fb_devop_y4`, `NODE_ENV=production`.

`curl -I http://127.0.0.1:47821/tr/login`:
```
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
content-security-policy: default-src 'self'; script-src 'self' 'nonce-ZPbUp7G9NgNI2j5JkE23OA==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://images.unsplash.com; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'
```
`curl -I /api/v1/calls` (401): HSTS + XFO + `Content-Security-Policy: default-src 'none'; script-src 'unsafe-hashes' 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='; …; frame-ancestors 'none'`.
`/_next/static/chunks/*.js`: HSTS + nosniff var, CSP yok (asset olduğu için beklenen).
**D-2:** `X-Powered-By` sayısı `/tr/login: 0`, `/api/v1/calls: 0`, `/robots.txt: 0`.

### 2.2 Tarayıcıda CSP ihlalsiz gezinme (Playwright Chromium, prod build, gerçek tıklamalar)
Script: `scratchpad/csp-walk.cjs`. Her sayfada `securitypolicyviolation` olayı ve "Content Security Policy / Refused to" konsol mesajları toplandı.
```
login status=200 csp=default-src 'self'; script-src 'self' 'nonce-SMzdCbyakoC5Te2…
google button visible=true
google redirect reached: https://accounts.google.com/o/oauth2/v2/auth (client_id param present=true)
dashboard status=200 url=http://127.0.0.1:47821/tr/main/dashboard
evidence status=200
uploaded row visible=true
documents status=200
docx download name=NDA.docx bytes=9061 zipMagic=true
print page status=200 ct=text/html; charset=utf-8
print button count=1
inline onclick handler ran=true
control: nonce-less injected inline script ran=false; page still hydrated=true
CSP violations total=4 (outside control=0)
{"step":"CONTROL-…","directive":"img-src","blocked":"https://blocked.example/x.png",…,"disposition":"enforce"}
{"step":"CONTROL-…","directive":"script-src-elem","blocked":"inline","source":"http://127.0.0.1:47821/tr/main/dashboard",…,"disposition":"enforce"}
```
- **Giriş** ve **Google düğmesi:** çerez onayı reddedildi, "Google ile Devam Et" tıklandı. Form POST yönlendirmesi `accounts.google.com/o/oauth2/v2/auth`'a ulaştı (`form-action` izin verdi). İstek orada kesildi, gerçek Google girişi yapılmadı.
- **Dashboard:** 200, ihlal yok.
- **PDF yükleme:** kanıt sayfası → "Yeni Belge Yükle" → PDF seçildi → gönderildi. Satır listede göründü. DB kaydı: `demo-tenant/org-default/cat-03/2026/…` / `min.pdf`.
- **DOCX dışa aktarma:** belgeler sayfasındaki DOCX bağlantısı tıklandı. `NDA.docx` indi, 9061 bayt, `PK` imzasıyla başlıyor.
- **Yazdırma sayfası** (`/api` CSP'si): tek `onclick="window.print()"` düğmesi hash ile çalıştı.
- **Pozitif kontrol:** sunucu yanıtına nonce'suz bir inline `<script>` enjekte edildi (depolanmış XSS benzetimi). **Çalışmadı**, sayfa yine hydrate oldu. Engellenmiş host'tan resim de bloklandı. Yani toplayıcı ihlalleri gerçekten görüyor ve 0 sonucu boş bir ölçüm değil.
- Not: `page.evaluate` ile eklenen script CSP'yi atlıyor (DevTools bağlamı), o yüzden kontrol olarak kullanılamaz. Bu kontrol bu nedenle yanıt enjeksiyonuyla yapıldı.

### 2.3 Testler ve mutantlar
`npx vitest run src/lib/security-headers.test.ts tests/accept-invite-headers.test.ts` → **21 passed**. Eklenen test sonrası `security-headers.test.ts` tek başına 21 passed.
Mutantlar (her biri tek değişiklik, sonra geri alındı):

| # | Mutant | Sonuç |
|---|---|---|
| S1 | script-src'den nonce çıkar | ÖLDÜ (4 fail) |
| S2 | script-src'ye `'unsafe-inline'` ekle | ÖLDÜ |
| S3 | `frame-ancestors *` | ÖLDÜ |
| S4 | `HSTS max-age=0` | ÖLDÜ |
| S5 | `poweredByHeader: true` | ÖLDÜ |
| S6 | `CSP_MODE=report-only` yok sayılır | ÖLDÜ |
| S7 | proxy istek başlığına CSP yazmaz (Next nonce basamaz) | ÖLDÜ |
| S8 | proxy yanıta CSP yazmaz | ÖLDÜ |
| S9 | R2 hesap kimliği doğrulaması gevşetilir (başlık enjeksiyonu) | ÖLDÜ |
| S10 | `object-src 'self'` | ÖLDÜ |
| S11 | nosniff çıkar | ÖLDÜ |
| S12 | `form-action https:` | ÖLDÜ |
| S13 | nonce 32 bit | ÖLDÜ |
| S14 | `isDev = NODE_ENV !== 'production'` | önce **HAYATTA** → test eklendi → ÖLDÜ |
| S15 | `/api` CSP'si kaldırılır | ÖLDÜ |

**15/15 öldü.**

### 2.4 D-1: çerezler (canlı curl, `/api/auth/csrf`)
```
AUTH_URL=http://127.0.0.1:47821, düz http:                 authjs.csrf-token=…; Path=/; HttpOnly; SameSite=Lax
AUTH_URL=http://…, X-Forwarded-Proto: https:               authjs.csrf-token=…; Path=/; HttpOnly; SameSite=Lax   ← Secure YOK
AUTH_URL=https://fonbridge.test (başlıksız ya da XFP ile): __Host-authjs.csrf-token=…; Path=/; HttpOnly; Secure; SameSite=Lax
                                                           __Secure-authjs.callback-url=…; HttpOnly; Secure; SameSite=Lax
```
Sonuç: `Secure` / `__Host-` kararını `X-Forwarded-Proto` değil **`AUTH_URL`'ün şeması** veriyor. Tarama raporundaki "XFP ile Secure" gözlemi, AUTH_URL'ün boş olduğu koşula aitti.

## 3. Değişen dosyalar
- `795d69ba` (önceki tur): `next.config.ts`, `src/proxy.ts`, `src/lib/security-headers.ts`, `src/lib/security-headers.test.ts`, `vitest.config.mts`
- Bu tur: `src/lib/security-headers.test.ts` (+1 test, S14), bu rapor.

## 4. Riskler
- **D-1, dağıtım sözleşmesi:** prod'da `AUTH_URL=https://…` şart. Yoksa oturum çerezi `Secure`'suz gider ve TLS proxy'nin `X-Forwarded-Proto` göndermesi bunu kurtarmaz. RELEASE_CHECKLIST'e eklenmeli. Dosya şu an başka bir ajanın commit'lenmemiş değişikliğini taşıdığı için dokunmadım.
- `style-src 'unsafe-inline'` bilinçli bir ödün (React `style={}` ve next/font). Stil enjeksiyonu hâlâ mümkün, ama script enjeksiyonu kapalı.
- R2 genel host ya da PostHog prod'da ayarlanırsa `img-src`/`connect-src`'ye env'den ekleniyor. Yeni bir 3. taraf (ör. Sentry tarayıcı SDK'sı) eklenirse CSP'ye de eklenmeli, yoksa bloklanır. İlk prod yayını için `CSP_MODE=report-only` ile başlayıp logları izlemek güvenli yol.
- HSTS `includeSubDomains` alt alan adlarını da HTTPS'e kilitler. HTTP'de kalan bir alt alan varsa 1 yıl boyunca erişilemez. Yayından önce alt alan listesi kontrol edilmeli.

## 5. Açık sorular
- HSTS `preload` açılacak mı? Geri alması aylar sürüyor, patron kararı.
- Görev sarmalayıcısı sonuç yolunu `/Users/macbook/alan/docs/agent-results/…` olarak verdi, gövde ise repo içini. Asıl dosya repoda. Sarmalayıcı yoluna da aynı içeriğin bir kopyası kondu.

## 6. Sonraki adım
- Prod'da ilk yayın `CSP_MODE=report-only` ile yapılmalı. 24–48 saat ihlal logu izlendikten sonra enforce'a geçilmeli. İzleme için bir `report-to`/`report-uri` uç noktası henüz yok; eklenmesi ayrı bir kart.
- RELEASE_CHECKLIST'e `AUTH_URL` https zorunluluğu ve canlıda `curl -I` başlık kontrolü eklenmeli.
