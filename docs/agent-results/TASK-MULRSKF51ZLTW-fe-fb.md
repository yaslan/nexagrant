# TASK-MULRSKF51ZLTW — FB KAMU B5 tam beyaz etiket: TASARIM / SPIKE (fe-fb)

**Durum:** TAMAM — yalnız tasarım raporu + Caddy on-demand TLS spike'ı (scratchpad, konteyner silindi).
Ürün koduna değişiklik yok, dev'e merge yok, :5433'e yazılmadı (patron kararı 30.09: uygulama 2. yılda).

**Platform beyanı:** mac (Darwin 27.0, Docker 29.7.2, `caddy:2.11.4` imajı) üzerinde doğrulandı. Spike yalnız
Caddy konteyneri + yerel Python `ask` sunucusu kullandı; önerilen tasarım Linux VPS'te (Vulut, Docker) koşacak ve
platforma bağlı kod yolu içermiyor (TLS/DNS/SMTP ağ düzeyi). Windows/Linux'ta **koşulmadı** — gerek yok: ürün kodu
değişmedi; Caddy aynı imajla Linux'ta birebir çalışır. Gerçek ACME (Let's Encrypt) yerelde **koşulamadı** (herkese
açık DNS + 80/443 gerekir); spike `local_certs` iç CA'sıyla yapıldı.

Kapsam: ajansın kendi alan adı · tema (logo/renk/favicon/e-posta şablonu) · e-posta gönderici adı/adresi.
Kaynak iş tanımı: `docs/kamu/OKA-KANAL-ONERISI.md:37` (Seçenek B) ve `:87` (B5 satırı, efor "S" diye yazılmış —
bu rapor efor tahminini aşağıda büyütüyor, §7).

---

## 0. Özet (patron için 5 satır)

1. Bugün yalnız **B4 ortak marka** var: logo + "<ajans> iş birliğiyle" metni, ürün markasının **yanında**. Alan adı,
   renk, favicon, e-posta göndericisi tek ve sabit (`fonbridge.com`, `FonBridge <info@fonbridge.com>`).
2. Tam beyaz etiketin zor kısmı tema değil, **giriş (Google OAuth) + alan adı + e-posta kimlik doğrulaması**.
   Google yalnız kayıtlı ve doğrulanmış alan adlarına geri dönüş yapar; ajansın alanı bizim Google projemizde
   doğrulanmalı ya da giriş bizim alanımızda yapılmalı.
3. Spike: Caddy on-demand TLS + `ask` kapısı **fail-closed** çalışıyor (onaysız ad → TLS el sıkışması yok; `ask`
   çökerse yeni sertifika yok). Ama **önceden alınmış sertifika `ask` kapansa da sunulmaya devam ediyor** → uygulama
   her istekte host'u kendisi de doğrulamalı.
4. Öneri: **Seçenek B (ajansın kendi alt alanı + alan başına Google kaydı), önce yalnız OKA için elle kurulum**;
   birden fazla ajans talep ederse Seçenek C'ye (merkezi giriş aracısı) geçiş. E-posta ilk aşamada
   `"<Ajans adı>" <bildirim@fonbridge.com>` + doğrulanmış `Reply-To`; ajansın kendi alanından gönderim ikinci aşama.
5. Efor: B yolu ≈ **17–24 kişi-gün** + ajans BT biriminin DNS işi; C yolu ek **+8–12 kişi-gün**. Ayrıntı §7.

---

## 1. Mevcut co-brand durumu (B4, TASK-MULRRNIHVZM1Z) — dosya:satır

| Konu | Bugün | Kaynak |
|---|---|---|
| Veri yeri | `Tenant.settings.cobrand` (AGENCY kiracısının JSON sütunu; şema değişikliği yok) — `{ logoKey, name, updatedAt }` | `src/lib/agency/cobrand.ts:7-10, 27, 32-39`; `prisma/schema.prisma:32` (`settings Json`) |
| Ajans↔kurum bağı | `Tenant.kind = AGENCY`, bağlı kurumda `agencyId` (kayıtta bir kez yazılır; RLS'e girmez) | `prisma/schema.prisma:52-57` |
| Logo kuralları | Yalnız PNG, ≤200 KB, ≤1024 px, parça parça CRC yürüyüşü, IEND sonrası veri reddi, metadata parçaları atılır; SVG reddi | `src/lib/agency/cobrand.ts:12-23, 28-29, 50, 56-104` |
| Ad normalizasyonu | Kontrol karakteri ve `<>` temizlenir, ≤40 karakter | `src/lib/agency/cobrand.ts:111-119` |
| Yazma | Oku-birleştir-yaz; eski logo nesnesi yeni kayıttan sonra silinir | `src/lib/agency/cobrand-store.ts:94-124` |
| Okuma (kabuk) | Oturumun kiracısı → `agency` ilişkisi → girdi; bağsız kurum ve ajansın kendisi `null` | `src/lib/agency/cobrand-store.ts:45-56`; `src/app/[locale]/(app)/layout.tsx:78-81` |
| Logo servisi | `/api/agency/cobrand-logo` — **oturum zorunlu** (`requireTenantApi`), URL'de id yok, `nosniff`, `CSP sandbox`, `Cache-Control: private` | `src/app/api/agency/cobrand-logo/route.ts:14-32`; `src/lib/agency/cobrand-store.ts:71-79` |
| Görünüm | Ürün logosunun **yanında** rozet; logo her iki temada beyaz karo üstünde; metin `text-ink-2` | `src/components/CoBrandBadge.tsx:5-38`; `src/app/[locale]/(app)/layout.tsx:112-129`; `src/components/MobileAppHeader.tsx:63` |
| Ajans paneli | Ad + logo formu, önizleme | `src/app/[locale]/(app)/ajans/cobrand-panel.tsx`, `cobrand-actions.ts:20-44`, `page.tsx:56-91` |
| Ürün adı | Sabit `PRODUCT_NAME = 'FonBridge'`; `src/` içinde 43 dosyada 151 kullanım | `src/lib/brand.ts:18` |
| Kök metadata | `title: PRODUCT_NAME`, `metadataBase: new URL(appUrl())` — tek kök alan | `src/app/layout.tsx:17-19` |
| Favicon | Statik `src/app/favicon.ico`; kiracıya göre değişmez | `src/app/favicon.ico` |
| Tema | CSS değişkenleri (`--accent`, `--accent-ink`, `--accent-strong`…) açık/koyu iki takım; kök layout `data-theme` SSR ile çözer | `src/app/globals.css:7-36`; `src/app/layout.tsx:62` |
| Kendi URL'imiz | Tek köken `NEXT_PUBLIC_APP_URL` (canlı `https://fonbridge.com`); davet, takvim `redirect_uri`, Stripe dönüşü, `metadataBase` hep buradan; 10 dosyada çağrı | `src/lib/app-url.ts:3-46`; `src/lib/calendar/google.ts:18, 37-44` |
| Auth | Auth.js `trustHost: true` (geri dönüş adresi istek Host'undan); tek sağlayıcı Google | `src/lib/auth.ts:345, 366-374`; `.env.example:41-42` ("Host'u yeniden yazan vekil arkasında `AUTH_URL` sabitle") |
| CSP | Sayfa CSP'si istek başına nonce, çoğunlukla `'self'`; `form-action 'self' https://accounts.google.com` | `src/proxy.ts:35-48`; `src/lib/security-headers.ts:209-226` |
| E-posta göndericisi | `SMTP_FROM` ya da `FonBridge <NEXT_PUBLIC_SMTP_FROM_ADDRESS>` (varsayılan `info@fonbridge.com`); mesaj başına `from` geçersiz kılma var, **`replyTo` alanı yok** | `src/lib/email/mailer.ts:14-23, 79, 119`; `src/lib/env.ts:99`; `docs/SMTP-SUNUCU.md:5, 199, 213-218` |
| E-posta şablonu | Davet: kurum adı + sabit `PRODUCT_NAME`, logo yok | `src/lib/email/invitation-email.ts:23-56` |
| Ters vekil | Caddyfile planı yalnız `fonbridge.com` + `www` → kök 301; **kurulmadı** | `docs/SMTP-SUNUCU.md:519-560`; `docs/RELEASE_CHECKLIST.md:32` |

Sonuç: B4 "ekle, yerine koyma" ilkesiyle yapılmış (`cobrand.ts:4-5`). B5 bunun tersi: ürün adının ve alanının yerine
geçmek. Kodda host'a göre kiracı seçen hiçbir yapı yok; kiracı yalnız oturumdan (JWT) okunuyor
(`src/lib/tenant.ts:67`).

---

## 2. Alan adı

### 2.1 Host → kiracı (ajans) eşleme
- Yeni tablo `AgencyDomain { id, agencyId, hostname @unique, status (PENDING|VERIFIED|ACTIVE|SUSPENDED),
  verifyToken, verifiedAt, lastCheckedAt, createdAt }`. Hostname küçük harf, sondaki nokta atılmış, IDN → punycode
  saklanır. JSON `settings` içine değil ayrı tabloya: benzersiz indeks ve host ile tek sorguda arama lazım.
- Arama, **oturum öncesi** yapılır (giriş sayfası da markalı olmalı) → kiracı bağlamı yokken okunur. RLS'li
  tabloya sistem okuması demek; `rls:bypass-check` izin listesine bilinçli eklenmeli ve yalnız `hostname → agencyId,
  status` döndüren tek bir fonksiyonla sınırlanmalı. (Fabrika'da yeni tablo eklerken tam süitte kırılan kapılar var:
  `where-guard-src`, teardown guard — uygulama kartına not.)
- `src/proxy.ts` her istekte host'u okur: bilinen kök (`fonbridge.com`) → bugünkü davranış; `ACTIVE` ajans alanı →
  `x-brand-agency` istek başlığı; bilinmeyen host → **404/421** (bugün `trustHost: true` her Host'a cevap veriyor;
  catch-all vekil kurulduğunda bu Host başlığı enjeksiyonuna dönüşür). Proxy'de DB çağrısı yerine 60 sn'lik bellek
  önbelleği + DB; Edge değil Node runtime'da olduğu doğrulanmalı.
- **Kiracılar arası kapı (zorunlu):** ajans alanında yalnız `tenant.agencyId === hostAgency` olan kurumların ya da
  ajansın kendi oturumu kabul edilir. Başka ajansa bağlı / bağsız bir kullanıcı o alanda giriş yaparsa oturum açılmaz,
  `fonbridge.com`'a yönlendirilir. Aksi halde A ajansının markası altında B'nin kurumu çalışır (marka sızıntısı +
  oltalama zemini).
- Kayıt: ajans alanından yapılan kayıt davet kodundan bağımsız olarak `agencyId = hostAgency` olmalı, başka ajansın
  davet kodu reddedilmeli.

### 2.2 TLS — Caddy on-demand + kötüye kullanım önleme (spike ile ölçüldü)
Spike dosyaları: `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb-ekler/spike-Caddyfile`, `spike-ask.py`, `spike-ask.log`.

```
{ local_certs
  on_demand_tls { ask http://host.docker.internal:9123/check } }
https:// { tls { on_demand }  respond "host={host}" 200 }
```
Ölçüm (mac, `caddy:2.11.4`, 30.09):
```
caddy validate                                          → Valid configuration
panel.oka-ornek.test  (ask → 200)                       → host=panel.oka-ornek.test [http=200]
                                                          log: "certificate obtained successfully","identifier":"panel.oka-ornek.test"
saldirgan.test        (ask → 404)                       → [http=000]  (TLS el sıkışması yok, sertifika yok)
fonbridge.com         (ask → 404)                       → [http=000]
ask sunucusu KAPALI, yeni ad yeni.oka-ornek.test         → [http=000]  "checking http://…/check to determine if certificate for hostname 'yeni.oka-ornek.test' should be allowed: Get …" (fail-closed)
ask sunucusu KAPALI, önceden alınmış panel.oka-ornek.test → host=panel.oka-ornek.test [http=200]   ← DİKKAT
```
Çıkarımlar:
- `ask` kapısı hem kötü niyetli SNI ile sertifika yakma saldırısını (Let's Encrypt hız sınırları hesabı kilitler) hem
  de başkasının alanını bizim sunucumuza CNAME'leyip sertifika aldırmayı durduruyor; `ask` yalnız `ACTIVE`
  hostname'e 200 dönmeli, `/api/internal/tls-ask` yalnız 127.0.0.1'den erişilebilir olmalı, IP başına hız sınırı.
- Ajans çıkarıldığında Caddy'nin önbellekteki sertifikası **sunulmaya devam eder** (son satır). Bu yüzden iptal
  uygulama katmanında yapılır: host `SUSPENDED` ise proxy 421/yönlendirme döner. Caddy depolamasından sertifikayı
  silmek ayrıca işletme adımı.
- `ask`'ın yenilemede de çağrılıp çağrılmadığı bu spike'ta ölçülmedi (sertifika ömrü içinde yenileme olmadı) — uygulama
  kartında doğrulanmalı.
- Ajans sayısı sınırlı (Türkiye'de 26 kalkınma ajansı). Pilotta **on-demand yerine statik site bloğu** (her ajans için
  Caddyfile'a bir satır + `caddy reload`) saldırı yüzeyi sıfır ve yeterli. On-demand ancak self-servis alan ekleme
  istenirse değer. Her iki durumda da uygulamadaki host kapısı zorunlu.
- HSTS: `includeSubDomains` bizim tarafımızda yok (`docs/SMTP-SUNUCU.md:540-541`); ajans alanında HSTS'yi biz
  yalnız o hostname için veririz, ajansın kök alanına dokunmayız.

### 2.3 DNS doğrulama (TXT/CNAME)
- Yalnız **alt alan** kabul (`panel.oka.org.tr`); kök alan (`oka.org.tr`) CNAME alamaz, A kaydı ister → IP'miz
  değişince ajans alanı kırılır. Kök alan istenirse patron kararı (§8).
- İki kayıt: (1) `_fonbridge-dogrula.panel.oka.org.tr TXT "<rastgele 32 bayt token>"` — sahiplik;
  (2) `panel.oka.org.tr CNAME edge.fonbridge.com` — trafik. Token doğrulanmadan hostname `PENDING` kalır, TLS/`ask`
  200 dönmez. CNAME hedefi IP değil **bizim adımız** → sunucu IP'si değişse de ajans DNS'i değişmez.
- Günlük yeniden kontrol işi (graphile-worker, ADR-0008): TXT kaybolur ya da CNAME başka yeri gösterirse `SUSPENDED` +
  ajans yöneticisine e-posta. Birden çok çözücüden (`8.8.8.8`, `1.1.1.1`) okuma; `docs/SMTP-SUNUCU.md:30`'daki
  SERVFAIL deneyimi yüzünden tek çözücüye güvenilmemeli.
- Aynı hostname başka ajans tarafından talep edilemez (benzersiz indeks); eski sahibin kaydı silinmeden yeniden
  doğrulama yok.

### 2.4 CSP / cookie / NEXTAUTH_URL / Google OAuth / canonical
- **CSP:** sayfa politikası neredeyse tümüyle `'self'` → host'tan bağımsız, ajans alanında olduğu gibi çalışır
  (`security-headers.ts:209-226`). Logo/favicon aynı kökenden sunulursa `img-src` değişmez. Seçenek C'de (merkezi
  giriş) `form-action`'a `https://fonbridge.com` eklenir.
- **Cookie:** Auth.js çerezleri host-only (Domain özniteliği yok) → her alan kendi oturumunu taşır, alanlar arası
  oturum paylaşımı **yok**; bu istenen izolasyon. `__Secure-`/`__Host-` önekleri https'te korunur. Tema çerezi
  (`fabrika-theme`) da host başına ayrı — kabul.
- **`AUTH_URL` / `NEXTAUTH_URL`:** `.env.example:41-42` Host'u yeniden yazan vekil arkasında `AUTH_URL`'yi
  sabitlemeyi öneriyor. Çoklu alanda **sabitlenmemeli**: sabit `AUTH_URL` bütün geri dönüşleri `fonbridge.com`'a
  çeker. Yerine Caddy `Host`'u değiştirmeden iletir (varsayılan) ve `trustHost: true` kalır; güvenliği proxy'deki host
  izin listesi sağlar (§2.1).
- **Google OAuth (asıl engel):** Google, `redirect_uri`'yi istemci kaydındaki listeyle birebir karşılaştırır — joker
  yok, her ajans alanı elle eklenir. Üretimdeki (yayınlanmış) uygulamada yetkili alanların Google Search Console'da
  proje sahibince doğrulanması istenir → ajansın BT birimi bizim için bir TXT daha girer ya da bizi Search Console'a
  sahip olarak ekler. Onay ekranı uygulama adını ("FonBridge") gösterir; ajans adı gösterilecekse ayrı Google istemcisi
  (ajans başına OAuth client + marka doğrulaması) gerekir. *Not: Google Cloud konsolunda canlı doğrulanmadı; Google
  belgelerine dayanıyor — uygulama kartında ilk adım olarak ölçülmeli.*
- **Google Calendar** `redirect_uri` tek kökten (`calendar/google.ts:37-44`) → ya ajans alanı için de kaydedilir ya da
  takvim bağlama akışı her zaman `fonbridge.com` üzerinden yapılır (öneri: ikincisi; ekran nadir).
- **Kendi URL'imiz:** `appUrl()/appBaseUrl()` tek kökenli; ajansa bağlı kurumun davet ve özet e-postalarındaki
  bağlantılar ajans alanını göstermeli → `appUrlFor(tenantId)` (ajans `ACTIVE` alanı, yoksa kök). İstek dışı işler
  (`m4-stale-relationships`, `feedback/digest-run`) DB'den çözer.
- **Canonical / SEO:** ajans alanı bir uygulama alanıdır, pazarlama alanı değil. Ajans alanında `/` → giriş; pazarlama
  sayfaları (`/pricing`, `/calls/*`, blog) ya sunulmaz (404) ya da `canonical` kök alanı gösterir; `robots.txt`
  host'a göre `Disallow: /`, sayfalarda `noindex`. Böylece yinelenen içerik ve ajans alanında FonBridge fiyat sayfası
  görünmez. `metadataBase` istek host'undan (`src/app/layout.tsx:19`).

---

## 3. Tema

### 3.1 Veri modeli
`Tenant.settings.cobrand` genişletilir (JSON, şema değişikliği yok; ayrım için `version: 2`):
```ts
interface AgencyBrand {           // cobrand v2
  logoKey: string | null;         // bugünkü, B4 sanitizer'ı ile
  name: string;                   // bugünkü, ≤40
  mode: 'cobrand' | 'whitelabel'; // whitelabel yalnız ACTIVE AgencyDomain varken etkin
  accent?: string;                // #rrggbb, açık tema
  accentDark?: string;            // #rrggbb, koyu tema (yoksa türetilir)
  faviconKey?: string | null;     // 32×32 ve 180×180 PNG, logo sanitizer'ından geçer
  mail?: { displayName: string; replyTo?: string; replyToVerifiedAt?: string };
  updatedAt: string;
}
```
Beyaz etiket modu **host'a bağlı**: `fonbridge.com`'da ajansa bağlı kurum yine B4 rozetini görür; ajans alanında
ürün adı/logosu yerine ajansınki. Tek kaynak, iki görünüm.

### 3.2 SSR
- Kök `src/app/layout.tsx` zaten tema çerezini sunucuda çözüyor; aynı yerde `x-brand-agency`'den marka okunur, `<head>`
  içine `nonce`'lu tek `<style>` basılır: `:root{--accent:#…;--accent-ink:#…;--accent-strong:#…}` ve
  `[data-theme=dark]{…}`. İstemci JS'i ve FOUC yok; tema değişiminde yeniden istek gerekmez.
- `generateMetadata`: `title` → ajans adı, `icons` → `/api/brand/favicon?s=32|180` (host'a göre). `PRODUCT_NAME`'in 151
  kullanımı tek tek değişmez: kabuk, giriş/kayıt, e-posta ve metadata'daki görünür yerler bir `brandName()` yardımcısına
  taşınır; hukuki metinler (KVKK, DPA, şartlar) **işleyen tarafı doğru adlandırmak zorunda** → FonBridge adı orada kalır
  (§8 soru).
- **Logo/favicon oturumsuz sunulmalı:** giriş ekranı markalı olacağı için bugünkü oturum isteyen logo rotası
  (`cobrand-logo/route.ts:15-16`) yetmez. Yeni `/api/brand/logo` ve `/api/brand/favicon` URL'de id almaz, **host'tan**
  çözer (aynı "istek kimseyi adlandıramaz" ilkesi) ve yalnız `ACTIVE` alan için döner. Başlıklar bugünküyle aynı
  (`nosniff`, `CSP sandbox`); `Cache-Control: public, max-age=3600` + `Vary: Host` (içerik artık oturuma değil host'a
  bağlı).

### 3.3 CSP uyumu
- Renk yalnız `^#[0-9a-fA-F]{6}$` ile kabul edilir, sunucuda yeniden biçimlenir; serbest CSS **yok**. Aksi halde
  `red;}body{background:url(…)}` gibi CSS enjeksiyonu (`style-src 'unsafe-inline'` zaten açık,
  `security-headers.ts:214`) arayüz taklidine yol açar.
- `<style>`'a nonce verilir; ileride `'unsafe-inline'` kaldırılırsa kırılmaz.
- Font, özel CSS, harici logo URL'si kabul edilmez → `img-src`/`font-src` genişlemez.

### 3.4 Kontrast (WCAG AA)
- Kayıt anında sunucuda ölçülür, geçmeyen renk **reddedilir** (panelde neden + önerilen en yakın ton):
  `accent-ink` metni `surface` üzerinde ≥4.5:1 (açık `#FFFFFF`, koyu `#0B1324`); `accent-strong` üzerinde beyaz buton
  metni ≥4.5:1; odak halkası/kenar ≥3:1. Bugünkü tokenlar bu disiplinle yazılmış (`globals.css:36` "5.36:1 against
  white").
- `accentDark` verilmezse açık renkten, koyu yüzeyde 4.5:1'i sağlayana dek açıklaştırılarak türetilir.
- Logo her iki temada beyaz karo üstünde kalır (`CoBrandBadge.tsx:10-12` gerekçesi aynen geçerli).
- Hata/uyarı/başarı renkleri (`bad`/`ok`) marka rengine bağlanmaz — anlamsal renk ajansın zevkine bırakılmaz.

### 3.5 E-posta şablonu
Davet/özet şablonları (`invitation-email.ts:23-56`) `brandName` + isteğe bağlı logo alır. Logo e-postada **ekli CID
görüntü** olarak (harici URL değil: izleme pikseli gibi davranmaz, istemci engellemez); renk yalnız bir üst şerit.

---

## 4. E-posta göndericisi

### 4.1 Seçenekler
| | From | DMARC hizası | Ajans DNS işi | Risk |
|---|---|---|---|---|
| **E1** (öneri, aşama 1) | `"Ankara Kalkınma Ajansı" <bildirim@fonbridge.com>` + `Reply-To: destek@oka.org.tr` (doğrulanmış) | `fonbridge.com` SPF+DKIM → hizalı, bugünkü kurulum (`SMTP-SUNUCU.md:99-101`) yeter | yok | alıcı adresin `fonbridge.com` olduğunu görür (tam beyaz değil); görünen ad sahteciliği riski (§4.3) |
| **E2** (aşama 2) | `bildirim@panel.oka.org.tr` (ajansın alt alanı) | ajans alt alanında bizim DKIM seçicimiz (`fb2026._domainkey.panel.oka.org.tr` CNAME/TXT) + SPF `include` | TXT/CNAME 2–3 kayıt; DMARC ajansın politikası | ajans DMARC'ı `p=reject` ise yanlış kurulum = bütün postalar düşer; bizim MTA'mızın itibarı ajans alanını etkiler |
| E3 | ajansın kendi SMTP'si (kimlik bilgisi bize) | ajansın | yok | ajans parolası bizde durur (sır saklama, KVKK); ajans sunucusu kesilirse postalar durur — **önerilmez** |

### 4.2 `docs/SMTP-SUNUCU.md` ile uyum
- Seçilen **A (Vulut cPanel/Exim)** yalnız cPanel'e eklenmiş alanlar için DKIM imzalar (`SMTP-SUNUCU.md:72, 116`). E1
  bununla uyumlu: gönderici hep `fonbridge.com`. `mailer.ts` mesaj başına `from`'u zaten destekliyor
  (`mailer.ts:20-21, 119`); eksik olan `replyTo` alanı (1 satırlık arayüz eklemesi, nodemailer destekler).
- E2 paylaşımlı cPanel'de ölçeklenmez: her ajans alt alanını cPanel'e eklemek MX/zon çakışması doğurur. E2 için
  `SMTP-SUNUCU.md` §2 **B/C** (kendi Postfix + OpenDKIM, çok alanlı KeyTable/SigningTable) ya da işlemsel bir e-posta
  servisi gerekir; B/C'nin sıfır itibar + PTR sorunları (`:73-74`) aynen geçerli. Bu yüzden E2 ayrı karar.
- Zarf göndericisi (Return-Path) E1'de `fonbridge.com`'da kalır → bounce'lar `info@`'ya düşer (`:217`); E2'de DMARC
  için DKIM hizası yeter, SPF hizası gerekmez.

### 4.3 Sahtecilik riski ve önlemler
- **Görünen ad:** ajans serbest metin girerse `"T.C. Sanayi ve Teknoloji Bakanlığı" <bildirim@fonbridge.com>` gönderir →
  kamu kurumu taklidi. Önlem: `mail.displayName` ajans panelinden değil **platform yöneticisinden** (sözleşmedeki resmi
  ad), değiştirme denetim kaydına yazılır.
- **Reply-To:** yalnız ajansın `ACTIVE` alanındaki (ya da sözleşmedeki) bir adrese, onay bağlantılı doğrulama e-postasıyla;
  doğrulanmamış Reply-To kullanılmaz. Aksi halde yanıtlar saldırgan adresine gider.
- E-posta bağlantıları yalnız ajansın doğrulanmış alanına ya da `fonbridge.com`'a işaret eder (§2.4 `appUrlFor`).
- Metin/HTML'de ajans adı kaçışlanır (bugün `invitation-email.ts:23` yeni satırları temizliyor; beyaz etikette HTML
  kaçışı da test edilmeli).

---

## 5. Güvenlik riskleri ve önlemler

| Risk | Senaryo | Önlem |
|---|---|---|
| **Alan ele geçirme (bize karşı)** | Saldırgan kendi alanını `edge.fonbridge.com`'a CNAME'ler, bizden sertifika + FonBridge içeriği sunar (meşruiyet devşirme) | TXT doğrulaması olmadan `ask` 200 dönmez (spike: `saldirgan.test → 000`); proxy bilinmeyen host'a 421 |
| **Subdomain takeover (ajansa karşı)** | Ajans ayrılır, CNAME bizi göstermeye devam eder; biz host'u serbest bırakırız, başka biri talep eder | Aynı hostname yeniden talebi yalnız yeni TXT ile; ayrılan ajans için host `SUSPENDED` kalır (silinmez, 180 gün), ajansa "CNAME'i kaldırın" e-postası; CNAME hedefi IP değil ad → VPS IP'si serbest kalsa bile ajans DNS'i başkasına düşmez |
| **Sarkık DNS (bizim tarafımızda)** | `edge.fonbridge.com` bir gün başka IP'ye/servise yönelir | `edge` kaydı yalnız bizim sunucuda; sunucu değişiminde çalışma kitabı adımı |
| **Önbellekte kalan sertifika** | Ajans çıkarıldı ama Caddy eski sertifikayı sunuyor (spike son satırı) | İptal uygulama katmanında (proxy host kapısı); Caddy depodan silme işletme adımı |
| **Oltalama** | Beyaz etiket = kullanıcı "FonBridge" görmez; saldırgan benzer bir ajans alanı açıp kullanıcıyı Google girişine götürür | Google onay ekranı yine FonBridge'i gösterir (B) — kullanıcıya ipucu; giriş ekranında "FonBridge altyapısıyla" küçük ibaresi (§8 soru); ajans alanları platform yöneticisi onayıyla `ACTIVE` |
| **Kiracılar arası sızıntı — marka** | B ajansının kurumu A'nın alanına giriş yapar, A markası altında çalışır | §2.1 kiracılar arası kapı (oturum açılmaz) |
| **Kiracılar arası sızıntı — önbellek** | Host'a göre değişen logo/favicon/HTML paylaşılan önbellekte karışır | `Vary: Host` + ajans başına hash'li URL; HTML zaten `no-cache` (`next.config.ts:118-120`); CDN konursa host anahtarlı |
| **Kiracılar arası sızıntı — veri** | Host kiracıyı değiştirir sanılıp RLS atlanır | Host yalnız **marka** seçer, asla kiracı seçmez; kiracı hep oturumdan (bugünkü `tenantScopeOf`), host yalnız ek bir reddetme koşulu |
| **Host başlığı enjeksiyonu** | Catch-all vekil + `trustHost: true` → sahte Host ile şifre sıfırlama/davet bağlantısı zehirleme | Proxy izin listesi; e-posta bağlantıları Host'tan değil DB'deki `ACTIVE` alandan |
| **LE hız sınırı tüketimi** | Rastgele SNI yağmuru | `ask` fail-closed (spike), `ask` hız sınırı, pilotta statik blok |
| **CSS/marka enjeksiyonu** | Renk alanına CSS, logoya SVG/poliglot | Hex regex; B4 PNG sanitizer'ı favicon'a da uygulanır |

---

## 6. Mimari seçenekler

| | A. Bizim alt alanımız (`oka.fonbridge.com`) | **B. Ajansın alt alanı + alan başına Google kaydı** | C. Ajansın alt alanı + merkezi giriş aracısı |
|---|---|---|---|
| Kullanıcının gördüğü alan | `*.fonbridge.com` (kısmi beyaz etiket) | `panel.oka.org.tr` | `panel.oka.org.tr`; girişte bir an `giris.fonbridge.com` |
| TLS | tek joker sertifika, DNS-01 (Vulut DNS API'si gerekir) | statik blok (pilot) / on-demand + `ask` | aynı |
| Ajans DNS işi | yok | TXT + CNAME + Google Search Console TXT | TXT + CNAME |
| Google OAuth | tek alan; joker redirect yok ama tek alt alan listesi | her ajans için redirect URI + alan doğrulama (elle) | yalnız `fonbridge.com`; ajans alanına tek kullanımlık, 60 sn, hedef-host'a bağlı kodla oturum devri |
| Kod yükü | en az | orta | en çok (devir uç noktası, replay koruması, çıkış senkronu) |
| Güvenlik yüzeyi | en küçük | orta | en büyük (devir kodu = oturum; sıkı tasarım şart) |
| Efor (§7) | ~10–13 kişi-gün | ~17–24 kişi-gün | ~25–36 kişi-gün |

**Öneri: B, önce yalnız OKA için.** Gerekçe: ajans evreni ≤26, pilot tek ajans; alan başına Google kaydı ve statik
Caddy bloğu elle yapılabilir ve ek saldırı yüzeyi getirmez. C'nin devir mekanizması tam beyaz etiket vaadini de
bozar (giriş anında FonBridge alanı görünür) ve en riskli kodu ekler — ikinci ajans gelip Google alan doğrulaması
darboğaz olursa değerlendirilir. A ancak ajansın BT birimi DNS kaydı girmeyi reddederse geri dönüş planı.

---

## 7. Efor, dış bağımlılıklar, aşamalı yol haritası

Kişi-gün, tek geliştirici, test + inceleme dahil; ±%30.

| Aşama | İçerik | Kişi-gün | Dış bağımlılık |
|---|---|---|---|
| **0 — Alan adsız markalama** | `cobrand` v2 veri modeli, renk + kontrast doğrulayıcı, favicon (sanitizer yeniden kullanımı), SSR `<style nonce>`, `brandName()` + görünür metin taşıma, ajans paneli, e-posta şablonuna logo/ad, E1 (görünen ad + doğrulanmış Reply-To, `mailer.ts`'ye `replyTo`) | 7–9 | yok |
| **1 — Ajans alan adı (B)** | `AgencyDomain` tablo + migrasyon + RLS istisnası, TXT/CNAME doğrulama + günlük kontrol işi, proxy host kapısı + kiracılar arası kapı, oturumsuz `/api/brand/*`, `appUrlFor()` (10 çağrı yeri), `robots`/`canonical`/`metadataBase` host'a göre, Caddy statik blok + çalışma kitabı, e2e (iki host, çapraz giriş reddi) | 8–12 | Caddy'nin canlıda kurulması (`RELEASE_CHECKLIST.md:32`, bugün EKSİK); ajans BT: 3 DNS kaydı; Google Cloud: redirect URI + Search Console doğrulaması; hukuk: DPA'da alt işleyen/marka ibaresi |
| **1b — İşletme** | ajans ekleme/çıkarma çalışma kitabı, izleme (sertifika bitişi, DNS kopması alarmı) | 2–3 | — |
| **2 — Ajans alanından e-posta (E2)** | kendi MTA'ya ya da işlemsel servise geçiş, çok alanlı DKIM, ajans DMARC rehberi | 5–8 (+MTA kurulumu `SMTP-SUNUCU.md` B/C) | ajans BT: DKIM/SPF kayıtları; IP ısıtma haftaları |
| **3 — (koşullu) C: merkezi giriş aracısı** | devir kodu, replay/host bağlama, çıkış senkronu, güvenlik incelemesi | 8–12 | — |

Toplam öneri yolu (0 + 1 + 1b): **17–24 kişi-gün**. OKA-KANAL-ONERISI'ndeki "S" tahmini bu kapsamı karşılamıyor.

Sıra: 0 bağımsız ve tek başına değer üretir (ajansa renk + favicon + ad) → Caddy canlıya çıkınca 1 → talep olursa 2.

---

## 8. Patron kararı gereken açık sorular

1. **Hukuki ibare:** beyaz etikette de KVKK aydınlatma/DPA/şartlar veri işleyeni "FonBridge" diye adlandırmak zorunda.
   Giriş ekranı ve e-posta altbilgisinde küçük "FonBridge altyapısıyla" ibaresi kalsın mı? (Öneri: evet; hem hukuk hem
   oltalama önlemi.)
2. **Kök alan mı alt alan mı?** Yalnız alt alan (`panel.oka.org.tr`) önerildi; ajans `oka.org.tr`'nin kendisini isterse A
   kaydı + IP bağımlılığı kabul mü?
3. **Google giriş ekranı** "FonBridge" adını gösterecek (tek OAuth istemcisi). Ajans adına ayrı istemci (ajans başına
   marka doğrulaması, haftalar) istenir mi, yoksa kabul mü?
4. **E-posta:** aşama 1'de adres `bildirim@fonbridge.com` kalıyor (E1). Tam beyaz etiket için E2 (kendi MTA/işlemsel
   servis, ek maliyet) 2. yıl kapsamına girer mi?
5. **Görünen adı kim belirler?** Öneri: platform yöneticisi, sözleşmedeki resmi addan; ajans değiştiremez.
6. **Ticari:** B5, `BUSINESS_MODEL.md` §5.1'e göre Kurumsal planda. OKA yıllık lisansına mı dahil, ayrı kalem mi?
   (`OKA-KANAL-ONERISI.md:73-75` lisans tutarı hâlâ açık.)
7. **Destek yükü:** beyaz etikette kurum ajansı arar. Birinci hat ajans mı, biz mi? (`OKA-KANAL-ONERISI.md:37` "destek
   yükü artar".)
8. **Ayrılış politikası:** ajans ayrılınca bağlı kurumlar `fonbridge.com`'a otomatik taşınsın mı, bildirim süresi ne
   olsun? (Öneri: 30 gün bildirim, alan `SUSPENDED` 180 gün.)

---

## Kanıt
- Kod haritası: yukarıdaki dosya:satır referansları bu oturumda `grep`/`cat -n` ile okundu (30.09, `dev` @ `a0bec578`).
- Spike (mac, Docker, `caddy:2.11.4`, `local_certs`): §2.2'deki çıktılar kopyalandı; `ask` günlüğü
  `TASK-MULRSKF51ZLTW-fe-fb-ekler/spike-ask.log`:
  ```
  ASK domain=panel.oka-ornek.test -> 200
  ASK domain=saldirgan.test -> 404
  ASK domain=saldirgan.test -> 404
  ASK domain=fonbridge.com -> 404
  ASK domain=fonbridge.com -> 404
  ```
  Konteyner `b5spike-caddy` durduruldu (`--rm`, `docker ps --filter name=b5spike` → 0); `ask` süreci kendi pid'iyle
  kapatıldı. Paylaşılan :5433'e ve ürün koduna dokunulmadı.

## Değişen dosyalar
- `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb.md` (bu rapor)
- `docs/agent-results/TASK-MULRSKF51ZLTW-fe-fb-ekler/spike-Caddyfile`, `spike-ask.py`, `spike-ask.log`

## Riskler
- Google OAuth alan doğrulama gerekliliği belgelere dayanıyor, canlı konsolda ölçülmedi (§2.4) — B yolunun en büyük
  bilinmeyeni; uygulama kartının ilk adımı olmalı.
- Caddy'nin yenilemede `ask` çağırıp çağırmadığı ölçülmedi (§2.2).
- Gerçek ACME/Let's Encrypt yolu koşulamadı (herkese açık DNS yok).

## Sonraki adım
Patron §8 kararları → aşama 0 için uygulama kartı (2. yıl planına), aşama 1 Caddy canlı kurulumuna bağlı.
