---
sözleşme: 3
görev: TASK-MVFESLNWRCBM6
kod: FO-100
ajan: crw2-gnd
motor: claude
tip: araştırma
okur: kullanıcı
hüküm: Bitti: hata instrumentation.ts'ten değil, Next görsel optimizasyonunun images.unsplash.com'a açtığı https.request bağlantısının makinedeki HTTPS-filtreleme (MITM) kökünü tanımamasından geliyor; kendinden imzalı sahte zincirle deterministik yeniden üretildi, CA'ya güven verilince aynı koşulda kayboldu; kod değiştirilmedi.
platform: mac (darwin arm64, Node v26.5.0, Next 16.3.4 ana ağaç + 16.3.8 FONBRIDGE-fo18 worktree). Linux/Windows koşulmadı: makinede AdGuard yok ise hata üretilemez; herhangi bir TLS-kesen proxy/antivirüs aynı hatayı aynı yoldan üretir. NODE_USE_SYSTEM_CA=1 Linux'ta OpenSSL dizinini, Windows'ta sistem sertifika deposunu okur (koddan: Node --use-system-ca dokümantasyonu), doğrulanmadı.
sürüm: 1
tarih: 2026-10-19T22:12:06.896Z
---

# FO-100 · SELF_SIGNED_CERT_IN_CHAIN kök neden analizi (spike, kod değişikliği yok)

## Kararlar

```karar
kimlik: karar-1
soru: SELF_SIGNED_CERT_IN_CHAIN için hangi düzeltme uygulansın?
seçenek: A | Yalnız ortam tarifi — e2e kabuğunda NODE_USE_SYSTEM_CA=1 (ya da AdGuard HTTPS istisnası) + CLAUDE.md'ye tarif; kod yok
seçenek: B | playwright.config.ts webServer.env'e NODE_USE_SYSTEM_CA: '1' (1 satır, yalnız e2e dev sunucusu) + CLAUDE.md tarifi
seçenek: C | e2e blog fikstürlerini yerel görsele çevirip e2e'yi internetten koparmak (ayrı kart, seed + testler)
öneri: B
karar_kimligi: K-570198
```

## Ne yapıldı
1. FO18-push.log (187), FO18-e2e-retry.log (13), FO18-e2e-retry2.log (13), FO18-rich.log (22) satır satır okundu; her hata, o anda koşan testle eşleştirildi.
2. `src/instrumentation.ts` → `app-url-alert` → `system-alert` zinciri okundu: zincirde ağ/TLS çağrısı YOK (`appUrlProblem` non-production'da null döner, `recordAlert` çağrılmaz; `system-alert` yalnız Prisma'ya yazar).
3. Next'in dev loglama yolu izlendi: `node_modules/next/dist/server/next-server.js:435` `console.error(error)` + `patch-error-inspect.js` ("at ignore-listed frames"). Görsel optimizasyonu `image-optimizer.js` → 16.3.8'de `requestUpstreamImage` = `https.request` + `req.on('error', reject)` (çıplak hata), 16.3.4'te `fetch` (TypeError: fetch failed sarmalı).
4. Ortam tarandı: proxy yok (scutil), NODE_EXTRA_CA_CERTS/NODE_OPTIONS yok, AdGuard çalışıyor (`FilterHttps = 1`), System keychain'de `Adguard Personal CA` (geçerlilik 2026-07-15 → 2046), Node CA depoları: default=120, bundled=120, system=5 (AdGuard dahil), extra=0.
5. Deterministik yeniden üretim: sahte kendinden imzalı kök + `images.unsplash.com` SAN'lı yaprak; `tls.connect`'i bu host için 127.0.0.1:8443'e yönlendiren `--require` preload (HTTPS-filtreleme davranışının taklidi). Hem 16.3.4 (ana ağaç, port 3999) hem 16.3.8 (FONBRIDGE-fo18, port 3998) dev sunucusunda koşuldu. DB'ye dokunulmadı (DATABASE_URL erişilemez 127.0.0.1:1'e bağlandı; yalnız `/_next/image` ve `/robots.txt` istendi).
6. Düzeltme kanıtı: aynı MITM altında `NODE_EXTRA_CA_CERTS=<kök>` ile yeniden başlatınca HTTP 200 image/png, logda 0 hata.
7. Kendi başlattığım 3 sunucu (3999, 3998, 8443) kapatıldı; repo ağacında değişiklik yok.

## Kök neden (kanıtlı)
**Hangi çağrı:** Next dev sunucusunun `/_next/image?url=https://images.unsplash.com/...` isteğini karşılarken `fetchExternalImage → requestUpstreamImage → https.request` ile açtığı dış TLS bağlantısı. Kaynak: blog kayıtlarındaki unsplash kapak görselleri (`src/lib/blog-seed.ts` 4, `blog-shared.ts` 1, `admin/blog/client.tsx` 2 URL; `next.config.ts` remotePatterns `images.unsplash.com`).

**Hangi ortam:** Sunucuya gelen sertifika zincirinde kendinden imzalı bir kök var ve Node'un varsayılan (bundled) deposu onu tanımıyor. Makinede bu zinciri üretebilen tek bileşen AdGuard'ın HTTPS filtrelemesi (`Adguard Personal CA`). Tarayıcılar keychain'e güvendiği için fark etmez; Node `--use-system-ca` olmadan keychain'i okumaz.

**Neden instrumentation.ts'e benziyor:** `⚠ ./src/instrumentation.ts:18:5 … Ecmascript file had an error` bloğu Turbopack'in her route derlemesinde bastığı sabit uyarı (yeniden üretimde istek atılmadan, sunucu açılışında da basılıyor). Hata bloğu ondan bağımsız, `console.error(error)` ile çıplak basılıyor.

**Neden aralıklı:** Hata yalnız 19 Eki 14:16–16:33 arasındaki koşularda; 17:32 ve sonrasında hiç yok. Bu aralıkta Node sürecinin trafiğinin filtrelenip 17:32'den sonra filtrelenmediği anlamına gelir (AdGuard koruması duraklatma / uygulama filtre listesi / sorumlu-uygulama değişimi). **Varsayım:** AdGuard'ın o anki durumu kayıttan doğrulanamadı — Adguard-group.log'da 19 Eki için satır bulunamadı, unified log'da o pencere boş. Şu an filtreleme Node için devre dışı (openssl s_client: GlobalSign/Google zinciri; Node fetch 200).

**auth.spec ile ilişki: YOK.** auth.spec:24/40/72 kırmızısının nedeni `AUTH_GOOGLE_ID` eksikliği (se-fb-4 raporu §"Önceki kırmızıların kökü" 1; `configuredOAuthProviders` ID yoksa Google düğmesini gizliyor). Kanıt: FO18-auth.log (16:30) 0 TLS hatasıyla 3 test kırmızı; push3/push4 env düzeltilince yeşil. TLS hatası hiçbir e2e testini düşürmüyor: 500 dönen görsel assert edilmiyor (admin-blog-* testleri aynı koşuda ✓).

## Kanıt (ham çıktı)

**Hata–test eşleşmesi (FO18-push.log, hata sayısı / o anda koşan test):**
```
14 locale-switcher B-2 user menu  ·  9 public-shell  ·  9 public-lead-form  ·  9 admin-blog-new-defaults:152
 8 blog-author-byline phone  ·  8 admin-blog-rich-editor:85  ·  8 admin-blog-links-images:100 ...
hatadan önceki Next satırı (distinct): /[locale]/admin/blog ×18, /[locale]/blog ×9, /[locale]/blog/[slug] ×7, /[locale]/pricing ×2, /[locale] ×2
"fetch failed" sayısı: push.log 0, rich.log 0, retry2.log 0  → çıplak https.request hatası (16.3.8 yolu)
⨯ upstream image response timed out for https://images.unsplash.com/photo-15220718…  (aynı logda 4 kez; aynı yol, zaman aşımı varyantı)
```

**Ortam:**
```
$ defaults read com.adguard.mac.adguard | grep FilterHttps   → FilterHttps = 1;
$ security find-certificate -c "Adguard Personal CA" -p /Library/Keychains/System.keychain | openssl x509 -noout -subject -dates
subject= /C=EN/O=AdGuard/CN=Adguard Personal CA   notBefore=Jul 15 14:43:38 2026 GMT  notAfter=Jul 10 14:43:38 2046 GMT
$ node -e 'tls.getCACertificates(k)'  → default count=120 adguard=0 · bundled 120/0 · system 5/1 · extra 0/0
$ NODE_USE_SYSTEM_CA=1 node …          → default count 125, adguard in default: 1
$ scutil --proxy → yalnız ExceptionsList; HTTP(S)_PROXY, NODE_OPTIONS, NODE_EXTRA_CA_CERTS tanımsız
$ ps: /Applications/Adguard.app/Contents/MacOS/Adguard (pid 1002) + com.adguard.mac.adguard.network-extension (pid 2099)
```

**Yeniden üretim (16.3.8, FONBRIDGE-fo18, port 3998, sahte zincir):**
```
$ curl '…/_next/image?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1522071820081-…&w=640&q=75'  → HTTP 500 text/html
$ curl '…/_next/image?url=%2Flogo.png&w=64&q=75'                                                     → HTTP 200 image/png (kontrol)
dev18-mitm.log:
Error: self-signed certificate in certificate chain
    at ignore-listed frames {
  code: 'SELF_SIGNED_CERT_IN_CHAIN'
}
dev18-trace.log: tls.connect host=images.unsplash.com port=443 servername=images.unsplash.com  (pid = next-server)
```
Aynı deney 16.3.4 ana ağaçta (port 3999): HTTP 500, blok `[TypeError: fetch failed] { [cause]: Error: self-signed certificate in certificate chain … SELF_SIGNED_CERT_IN_CHAIN }` — 16.3.4'te `fetch` sarmalı, 16.3.8'de (dev dalı) çıplak; FO18 logları çıplak = 16.3.8 yolu.

**Düzeltme kanıtı (aynı MITM, kök güvenilir):**
```
$ NODE_EXTRA_CA_CERTS=…/ca.crt pnpm dev --port 3998 ; curl '…images.unsplash.com…'  → HTTP 200 image/png
self-signed lines in fixed-run log: 0
```

**Yeniden üretim tarifi (başkası için):** `scratchpad/mitm/preload.cjs` (tls.connect'i hedef host için 127.0.0.1:8443'e yönlendirir) + `mitm-server.cjs` (yaprak+kendinden imzalı kök zinciri sunar) + `openssl req -x509` ile kök, `openssl x509 -req -CA` ile SAN'lı yaprak; `NODE_OPTIONS="--require preload.cjs" MITM_HOSTS=images.unsplash.com pnpm dev --port N` ve `/_next/image?url=<unsplash>` isteği. Gerçek ortamda: AdGuard → HTTPS filtreleme açık ve Node süreci filtre kapsamındayken aynı istek.

## Önerilen en küçük düzeltme
Kök neden ortamda (kod kusuru değil). Üç seçenek, küçükten büyüğe:
- **A (ortam, 0 kod):** e2e koşan kabukta `export NODE_USE_SYSTEM_CA=1` (ya da `NODE_OPTIONS=--use-system-ca`; Node ≥ 23.8 / 22.15 — bu makine 26.5) → Node keychain'deki AdGuard kökünü tanır (ölçüldü: default depoya giriyor). Alternatif: AdGuard → Ayarlar → Ağ → HTTPS filtreleme istisnasına `images.unsplash.com`, `lh3.googleusercontent.com` eklemek ya da Node'u filtrelenen uygulamalardan çıkarmak. Tarifi CLAUDE.md "e2e lokal" bölümüne yaz.
- **B (1 satır test konfigi):** `playwright.config.ts` `webServer.env`'e `NODE_USE_SYSTEM_CA: '1'` — yalnız e2e dev sunucusunu etkiler, CI Linux'ta zararsız (sistem deposu okunur), prod'a dokunmaz. Uygulama kodu değil, `src/lib/env.ts` kuralı kapsamı dışında. Tavsiyem: B + A'nın CLAUDE.md tarifi.
- **C (e2e'yi internetten koparmak):** blog fikstürlerinin kapak görsellerini `public/` altındaki yerel dosyalara çevirmek; en sağlam ama kapsamı geniş (seed + testler), ayrı kart.
Yapılmaması gereken: `NODE_TLS_REJECT_UNAUTHORIZED=0` ya da `rejectUnauthorized:false` (certs/README.md R-S7 yasağı; doğrulamayı tümden kapatır).

## Değişen dosyalar
Yok (spike; yalnız bu rapor). Geçici tezgâh: `/private/tmp/claude-501/-Users-macbook-alan-giftanddate/5bb03a46-d782-4c79-970f-ac9e47ea7b09/scratchpad/mitm/` (preload.cjs, mitm-server.cjs, certs/, dev*-mitm.log, dev*-trace.log).

## Riskler
- AdGuard'ın 19 Eki 14:16–16:33'teki fiili durumu kayıttan doğrulanamadı; "AdGuard" çıkarımı makinedeki tek kendinden-imzalı-kök + HTTPS filtreleme bileşeni olmasına dayanır. Başka bir TLS-kesen (VPN/antivirüs) devreye girerse aynı hata aynı yoldan döner; teşhis komutu: `echo | openssl s_client -connect images.unsplash.com:443 -servername images.unsplash.com | openssl x509 -noout -issuer` (issuer GlobalSign değilse MITM aktif).
- `NODE_USE_SYSTEM_CA=1` keychain'deki her köke güvenir; yalnız lokal dev/e2e için, production imajına asla.
- Hata testleri düşürmüyor ama logu 187 satır kirletiyor ve `/_next/image` 500'leri "Error: aborted" (ECONNRESET ×50) gürültüsünü büyütüyor.

## Açık sorular
Karar bloğunda (A/B/C).

## Sonraki adım
Patron seçimine göre: B için 1 satırlık PR (base dev) + CLAUDE.md tarifi; A için yalnız CLAUDE.md. Kart DoD'undaki "auth.spec ×5 yeşil" maddesi bu hatadan bağımsız — AUTH_GOOGLE_ID'li env ile zaten yeşil (push3/push4).
