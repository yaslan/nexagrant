# E-posta: kendi SMTP sunucumuz (fonbridge.com)

Karar (patron, 29.09.2026, **güncellendi**): e-posta kendi SMTP sunucumuzdan çıkar.
- Gönderici: **`info@fonbridge.com`** (önceki `info@usfinbridge.com` kararının yerini aldı)
- SMTP sunucusu: **`mail.fonbridge.com`**
- Canlı uygulama alan adı: **`fonbridge.com`**; barındırma: **Vulut**

Kod tarafı: `src/lib/email/mailer.ts` (nodemailer), ayarlar yalnız ortamdan (`SMTP_*`, `.env.example`).
Görev: TASK-MUN2PKA5AG2IV. **Canlı sunucu kurulumu ve DNS değişikliği patron onayı olmadan yapılmaz.**
Patronun yapacakları: §8. Web tarafı (`www` → kök 301, `fonbridge.com` + `www` TLS): §10.

**Plan çerçevesi (güncelleme-2, 29.09):** patron "`mail.fonbridge.com` Vulut'ta **kurulu**" diyor. Bu yüzden plan
"sıfırdan kur" değil, **"mevcut sunucuyu doğrula ve DNS'i tamamla"**: (1) kurulu sunucunun hangisi olduğunu ve IP'sini
netleştir (§1.1), (2) bölgeyi o sunucuyu yöneten ad sunucusunda aç ve §3.0 kayıtlarını gir, (3) §7 komutlarıyla doğrula.

## 1.1 "Kurulu" sunucu ile DNS neden uyuşmuyor (ölçüm 29.09 20:19 UTC)

| Soru | Ölçüm | Sonuç |
|---|---|---|
| `.com` kaydı hangi NS'i gösteriyor? | `dig NS fonbridge.com @a.gtld-servers.net` → `ns1/ns2.iyisunucu.com.tr` | alan adı bu NS'lere devredilmiş |
| Bu NS'ler kimin? | `ns1 → 77.92.144.187`, `ns2 → 77.92.144.188`; RIPE: **VULUT BILISIM**; `77.92.144.187` PTR `srv.iyisunucu.com.tr` = aynı cPanel/Exim sunucusu | **iyisunucu.com.tr = Vulut'un cPanel sunucusunun kendi DNS'i.** "iyisunucu mu Vulut mu" ayrı iki şirket değil; tutarsızlık NS adında değil, **bölgenin o sunucuda olmamasında** |
| NS'ler bölgeyi biliyor mu? | `dig SOA fonbridge.com @ns1` ve `@ns2` (`+norec`) → **REFUSED**; aynı NS'lerde `usfinbridge.com` → NOERROR | bölge (zone) **tanımlı değil**. Bu "henüz yayılmadı" değildir: yetkili sunucu kendi bölgesini anında cevaplar, yayılma yalnız önbellekli çözücüler için geçerlidir. Lider ölçümündeki "boş cevap" ile aynı durum |
| Genel çözücüler | `@8.8.8.8` → **SERVFAIL**; `@1.1.1.1` boş; A/AAAA/`www`/`mail`/MX/SPF/DKIM/DMARC hiçbiri yok | yukarıdakinin sonucu |
| Bu Vulut sunucusu fonbridge.com'u hiç tanıyor mu? | `77.92.144.187`'e SNI `fonbridge.com` / `www.` / `mail.` ile 443 → başka bir müşterinin varsayılan sertifikası (`CN=webdisk.aigent.com.tr`); 465 ve 587 STARTTLS → `CN=autoconfig.srv.iyisunucu.com.tr`. Karşılaştırma: `usfinbridge.com` → kendi sertifikası | `srv.iyisunucu.com.tr` üzerinde fonbridge.com için **ne vhost, ne sertifika, ne DNS bölgesi var** |

**Yorum — iki olasılık, patron/Vulut paneli ayırır:**
1. **Kurulum `srv.iyisunucu.com.tr` üzerinde yapıldı ama yarım kaldı** (ör. hizmet/paket alındı, alan adı cPanel'e
   eklenmedi ya da ekleme hatası). Çözüm: fonbridge.com'u o cPanel'e (hesap ya da addon domain) eklemek — bölge
   `ns1/ns2.iyisunucu.com.tr`'de otomatik açılır, NS **değişmez**. Bu durumda `<MAIL_IP>` = `77.92.144.187`.
2. **`mail.fonbridge.com` başka bir Vulut sunucusunda kurulu** (ör. ayrı VPS + kendi paneli/DNS'i). O zaman NS ile
   barındırma **gerçekten tutarsız**: ya (a) Squarespace'te NS o sunucunun ad sunucularına çevrilir, ya da (b) NS
   iyisunucu'da kalır ve bölge + §3.0 kayıtları `srv.iyisunucu` cPanel'inde elle, o VPS'in IP'sini gösterecek şekilde
   açılır. **Öneri (b):** alan adı zaten iyisunucu'ya devredilmiş ve usfinbridge.com da orada; tek değişiklik bölgeyi
   açmak. Kural: bölge **yalnız** `.com` kaydındaki NS'lerin panelinde düzenlenir. Kayıtları VPS'in kendi DNS
   ekranına (NS'ler oraya bakmıyorken) girmek, "girdim ama görünmüyor" durumunun en sık sebebidir — lider ölçümündeki
   "patron kurulu diyor ama NS1 boş dönüyor" tablosu tam da buna uyar.

Patrondan istenecek tek bilgi: **Vulut panelinde `mail.fonbridge.com`'un kurulu olduğu hizmetin adı ve IP'si**
(cPanel ise sağ sütunda "Paylaşılan IP Adresi"; VPS ise panelde sunucu IP'si). Bu IP `<MAIL_IP>` olur.

## 1. Önceki ölçüm (29.09.2026 ~23:00 TRT, salt-okunur `dig` / `whois` / TLS el sıkışması) — 20:19 UTC'de tekrarlandı, değişmedi

| Ne | Değer | Yorum |
|---|---|---|
| Kayıt | 29.09.2026 19:57 UTC, Squarespace Domains, bitiş 29.09.2027 | alan adı **bugün** alınmış |
| NS (`.com` kaydında) | `ns1/ns2.iyisunucu.com.tr` | Vulut'un cPanel DNS'i (iyisunucu = Vulut altyapısındaki marka) |
| NS'lerin cevabı | `fonbridge.com SOA @ns1/ns2.iyisunucu.com.tr` → **REFUSED** | **bölge (zone) Vulut'ta henüz açılmamış** — alan adı hiçbir cPanel hesabına eklenmemiş. `usfinbridge.com` aynı NS'lerde NOERROR döner, yani sorun alan adına özgü |
| A / MX / TXT / `mail` / `_dmarc` / DKIM | **hiçbiri yok** (`@8.8.8.8` boş) | yukarıdakinin sonucu |
| TLS `mail.fonbridge.com` | yok. `77.92.144.187:465`'e SNI `mail.fonbridge.com` ile bağlanınca sunucunun varsayılanı `CN=autoconfig.srv.iyisunucu.com.tr` geliyor; crt.sh'ta fonbridge.com için hiç sertifika yok | uygulama bu hâliyle bağlanırsa TLS doğrulaması düşer (`ESOCKET`) — doğru davranış |
| Posta sunucusu `77.92.144.187` | 465 ve 587 **açık** (bu ağdan); Exim 4.100.1; PTR `srv.iyisunucu.com.tr` | usfinbridge.com'u zaten taşıyan Vulut cPanel/Exim sunucusu |

Sonuç: fonbridge.com için **sıfırdan** kurulum gerekiyor; ilk adım alan adının Vulut'ta bir cPanel hesabına
(ya da addon domain olarak mevcut hesaba) eklenmesi. O yapılmadan hiçbir DNS kaydı yayına çıkmaz.

## 2. Sunucu seçimi (1-3-1)

**Sorun:** `mail.fonbridge.com` hangi makine olacak?

| | Seçenek | Artı | Eksi |
|---|---|---|---|
| **A** | Vulut cPanel/Exim (`77.92.144.187`); fonbridge.com cPanel'e eklenir, `info@` posta kutusu açılır, `mail.fonbridge.com` → bu IP. Uygulama 465'te kimlik doğrulayıp gönderir | Kurulum yok; DKIM/TLS (AutoSSL) cPanel'den otomatik; gelen kutusu + bounce aynı yerde; usfinbridge.com ile aynı, çalıştığı ölçülmüş sunucu | Paylaşımlı IP itibarı komşulara bağlı; saatlik gönderim sınırı Vulut'ta; **PTR bizim adımız olamaz** (`srv.iyisunucu.com.tr` kalır) |
| **B** | Vulut VPS'te `docker-mailserver` (Postfix + Dovecot + OpenDKIM + Rspamd), `mail.fonbridge.com` → VPS IP | Tam denetim, kendi IP'miz, PTR `mail.fonbridge.com` | VPS'te 25 çıkışı açtırılmalı + PTR istenmeli; **yeni alan + yeni IP = sıfır itibar**, haftalarca ısıtma; güncelleme/izleme yükü bizde |
| **C** | Vulut VPS'te yalnız gönderim: Postfix + OpenDKIM; MX cPanel'de kalır | B'den hafif | B'nin itibar/PTR/25 sorunları aynen; bounce ile gönderim iki ayrı yerde |

**Öneri: A.** Alan adı bugün alındı; ona bir de sıfır-itibarlı yeni IP eklemek (B/C) spam kutusu riskini katlar.
A'da IP'nin temiz geçmişi (§6.3) ve cPanel'in hazır DKIM/AutoSSL'i var; patronun işi birkaç tıklama. Hacim
(günde yüzlerce+) artarsa ya da mail-tester skoru paylaşımlı IP yüzünden düşerse B'ye geçilir — kayıtlar §3.2'de hazır.
"PTR = mail.fonbridge.com" mutlak şartsa A olmaz, B/C gerekir (paylaşımlı IP'nin PTR'ı tek bir müşteri adını taşıyamaz).

## 3. DNS kayıtları (fonbridge.com bölgesi, Vulut cPanel → Zone Editor)

### 3.0 Girilecek kayıtların tam listesi (iyisunucu.com.tr / Vulut cPanel Zone Editor)
Yer tutucular: `<APP_IP>` / `<APP_IPV6>` = uygulamanın (Next.js konteyneri + önündeki ters vekil, §10) koştuğu Vulut
sunucusu; `<MAIL_IP>` = `mail.fonbridge.com`'un kurulu olduğu sunucu (§1.1; A seçeneğinde `77.92.144.187`).
TTL: canlıya geçiş haftasında **300**, oturunca 3600.

| # | Ad | Tür | Değer | Not |
|---|---|---|---|---|
| 1 | `fonbridge.com.` | A | `<APP_IP>` | cPanel alan eklenince buraya **kendi** IP'sini yazar → uygulama başka sunucudaysa değiştir |
| 2 | `fonbridge.com.` | AAAA | `<APP_IPV6>` | **yalnız** sunucu IPv6'da 80/443 dinliyorsa; yoksa kaydı hiç girme (yarım IPv6 = bazı ziyaretçilerde site açılmaz, AutoSSL/ACME düşer) |
| 3 | `www.fonbridge.com.` | CNAME | `fonbridge.com.` | 301'i ters vekil yapar (§10); CNAME yerine `A <APP_IP>` da olur. cPanel'in ekleyebileceği `www` A kaydı varsa sil (aynı adda CNAME + A olamaz) |
| 4 | `mail.fonbridge.com.` | A | `<MAIL_IP>` | sertifika (AutoSSL) bu kayıt yayına girince çıkar |
| 5 | `mail.fonbridge.com.` | AAAA | `<MAIL_IPV6>` | **yalnız** posta sunucusu IPv6'dan da gönderiyorsa; o zaman SPF'e `ip6:` ve PTR v6 da gerekir. Bugün `77.92.144.187` için v6 yok → girme |
| 6 | `fonbridge.com.` | MX 10 | `mail.fonbridge.com.` | cPanel varsayılanı `fonbridge.com`'dur → `mail.` yap |
| 7 | `fonbridge.com.` | TXT | `v=spf1 include:_spf.vulut.com -all` | A seçeneği. B/C: `v=spf1 ip4:<MAIL_IP> -all`. Bölgede **tek** `v=spf1` olmalı |
| 8 | `default._domainkey.fonbridge.com.` | TXT | `v=DKIM1; k=rsa; p=<cPanel üretir>` | A: cPanel → E-posta Teslim Edilebilirliği → "Onar/Kur". B/C: seçici `fb2026`, §3.2 |
| 9 | `_dmarc.fonbridge.com.` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@fonbridge.com; fo=1; adkim=r; aspf=r` | 2–4 hf sonra quarantine → reject (§3.1) |
| 10 | `fonbridge.com.` | CAA | `0 issue "letsencrypt.org"` (+ `0 issue "sectigo.com"`) | **isteğe bağlı**. Bu sunucunun AutoSSL'i Let's Encrypt veriyor (usfinbridge.com sertifikası `O=Let's Encrypt`, 29.09 ölçüm); sağlayıcı Sectigo'ya çevrilirse o da gerekir. CAA yanlışsa AutoSSL sessizce düşer — emin değilseniz hiç girmeyin |
| — | PTR `<MAIL_IP>` | (Vulut'ta) | A: `srv.iyisunucu.com.tr` kalır; B/C: `mail.fonbridge.com` | Zone Editor'da **değil**; §6.2 |

Ek kayıt gerekmez: `autoconfig`/`autodiscover`/`cpanel`/`webmail` alt adlarını cPanel kendisi ekler, zararsızdır.

### 3.1 A seçeneği
```
; --- web (uygulama) ---
fonbridge.com.            A      <APP_VPS_IP>        ; uygulamanın koştuğu Vulut VPS (patron verir)
www.fonbridge.com.        CNAME  fonbridge.com.
; --- posta ---
mail.fonbridge.com.       A      77.92.144.187       ; Vulut cPanel/Exim
fonbridge.com.            MX 10  mail.fonbridge.com.
fonbridge.com.            TXT    "v=spf1 include:_spf.vulut.com -all"
default._domainkey        TXT    "v=DKIM1; k=rsa; p=…"   ; cPanel alan eklenince ÜRETİR; "E-posta Teslim Edilebilirliği" → Onar/Kur
_dmarc.fonbridge.com.     TXT    "v=DMARC1; p=none; rua=mailto:dmarc@fonbridge.com; fo=1; adkim=r; aspf=r"
```
**Dikkat (cPanel varsayılanları):** alan adı cPanel'e eklenince cPanel kök `A` kaydını ve `MX`'i kendi
sunucusuna (`77.92.144.187`) yazar. Uygulama ayrı VPS'te koşacağı için:
- kök `fonbridge.com A` → **uygulama VPS IP'si** olarak değiştirilmeli (yoksa site cPanel'in boş sayfasını gösterir);
- `MX` kökü değil **`mail.fonbridge.com`**'u göstermeli (kök artık posta sunucusu değil);
- cPanel → E-posta Yönlendirme (Email Routing) **"Yerel Posta Değiştiricisi" (Local)** kalmalı.

SPF: uygulama posta göndermez, Exim'e teslim eder → uygulama VPS IP'si SPF'e **girmez**. `_spf.vulut.com`
Exim IP'sini kapsıyor (ölçüldü: `ip4:77.92.144.0/24 …`).
DMARC: `dmarc@fonbridge.com` kutusu (ya da `info@`'ya yönlendirme) açılmalı. 2–4 hafta rapor temizse
`p=quarantine; pct=25` → `p=quarantine` → `p=reject`.

### 3.2 B / C seçeneği (Vulut VPS, IP = `<VPS_IP>`)
```
mail.fonbridge.com.       A      <VPS_IP>
; PTR: Vulut'tan talep (§6.2)  <VPS_IP> → mail.fonbridge.com   — DNS'ten DEĞİL
fonbridge.com.            MX 10  mail.fonbridge.com.            ; yalnız B; C'de MX cPanel'de kalır
fonbridge.com.            TXT    "v=spf1 ip4:<VPS_IP> -all"     ; C'de cPanel de gönderiyorsa: include:_spf.vulut.com ip4:<VPS_IP> -all
fb2026._domainkey         TXT    "v=DKIM1; k=rsa; p=<aşağıdaki komutun çıktısı>"
_dmarc.fonbridge.com.     TXT    ; A ile aynı
```
DKIM anahtar üretimi (özel anahtar sunucuda kalır, repoya girmez):
```sh
# docker-mailserver (B)
docker exec mailserver setup config dkim keysize 2048 selector fb2026 domain fonbridge.com
cat docker-data/dms/config/opendkim/keys/fonbridge.com/fb2026.txt      # yayınlanacak TXT
# yalın OpenDKIM (C)
opendkim-genkey -b 2048 -d fonbridge.com -s fb2026 -D /etc/opendkim/keys/fonbridge.com
cat /etc/opendkim/keys/fonbridge.com/fb2026.txt
```
Seçici adı yıl taşır (`fb2026`); yıllık rotasyonda `fb2027` eklenir, eskisi 1 hafta sonra silinir.
MTA'nın HELO adı = PTR = `mail.fonbridge.com` (Postfix `myhostname`, docker-mailserver `hostname:`).

### 3.3 Yayılımı doğrulama
```sh
for r in 8.8.8.8 1.1.1.1; do
  dig +short SOA fonbridge.com @$r            # boş = bölge hâlâ yok (bugünkü REFUSED durumu)
  dig +short A mail.fonbridge.com @$r
  dig +short MX fonbridge.com @$r
  dig +short TXT fonbridge.com @$r            # SPF — TEK v=spf1 kaydı olmalı
  dig +short TXT default._domainkey.fonbridge.com @$r
  dig +short TXT _dmarc.fonbridge.com @$r
done
dig +short -x 77.92.144.187                   # PTR (A: srv.iyisunucu.com.tr; B/C: -x <VPS_IP> → mail.fonbridge.com)
```

## 4. TLS sertifikası (`mail.fonbridge.com`)

Uygulama `SMTP_HOST`'a bağlanırken SNI olarak bu adı gönderir ve sertifikayı **doğrular** (kapatma yok);
sertifika adı `mail.fonbridge.com`'u kapsamazsa gönderim `ESOCKET` ile düşer (yerelde kanıtlandı, §5).
- **A:** cPanel **AutoSSL** `mail.fonbridge.com`'u, A kaydı `77.92.144.187`'yi gösterdikten sonraki ilk
  çalışmada kapsar (cPanel → SSL/TLS Status → "Run AutoSSL" ile hemen). Exim SNI ile bu sertifikayı 465/587'de sunar
  (usfinbridge.com'da aynı mekanizma ölçüldü: `mail.usfinbridge.com` → kendi Let's Encrypt sertifikası).
- **B:** docker-mailserver `SSL_TYPE=letsencrypt` + certbot (80/tcp açık olmalı); **C:** `certbot certonly --standalone -d mail.fonbridge.com`,
  Postfix `smtpd_tls_chain_files`.
- Kontrol: `openssl s_client -connect mail.fonbridge.com:465 -servername mail.fonbridge.com </dev/null | openssl x509 -noout -subject -enddate -text | grep DNS:`
  → `DNS:mail.fonbridge.com` görünmeli. 587 için: `openssl s_client -starttls smtp -connect mail.fonbridge.com:587 -servername mail.fonbridge.com`.
- Bugün (29.09): SNI `mail.fonbridge.com` → `CN=autoconfig.srv.iyisunucu.com.tr` (varsayılan) → **hazır değil**.

## 5. Uygulama ayarları

Üretim `.env` (sır olan yalnız `SMTP_PASS`):
```
SMTP_HOST=mail.fonbridge.com       # sertifika adıyla eşleşmeli; IP yazma (TLS doğrulaması düşer)
SMTP_PORT=465
SMTP_SECURE=                       # boş: port 465 ⇒ örtük TLS (mailer.ts:69)
SMTP_USER=info@fonbridge.com
SMTP_PASS=<posta kutusu parolası — yalnız sunucu .env / sır kasası>
SMTP_FROM="FonBridge <info@fonbridge.com>"
NEXT_PUBLIC_APP_URL=https://fonbridge.com   # davet bağlantıları From ile aynı alanda
```
**Neden 465, 587 değil:** 465 bağlantının ilk baytından TLS'tir (RFC 8314 gönderim için örtük TLS'i önerir);
arada biri STARTTLS'i silse bile parola ya da davet bağlantısı (bir giriş belirteci) düz gitmez. 587 de güvenli
çalışır — mailer kimlik bilgisi varken `requireTLS` açar, STARTTLS yoksa `ETLS` ile gönderimi keser (kanıt aşağıda) —
ama o durumda posta **hiç** gitmez; 465'te bu kırılma noktası yok. Vulut ağı 465'i kapatırsa 587'ye geçmek tek satır:
`SMTP_PORT=587`, `SMTP_SECURE` boş.

`.env.example`'da `SMTP_PORT=465`, `SMTP_FROM="FonBridge <info@fonbridge.com>"` etkin; `SMTP_HOST=mail.fonbridge.com`
ve `SMTP_USER=info@fonbridge.com` **yorum satırı** olarak duruyor. Neden: README `cp .env.example .env` diyor; etkin
bırakılsaydı her geliştirici ve her yerel test gerçek sunucuya bağlanmaya çalışırdı (`@fonbridge.com` alıcıları için
kimlik doğrulamasız teslim bile mümkün). Boş `SMTP_HOST` = posta gönderilmez; yerelde mailpit: `SMTP_HOST=localhost`, `SMTP_PORT=1025`.

Gönderici zinciri:
- `sendMail`: `from: message.from || config.from` (`mailer.ts:111`); uygulama çağıranlarının (davet, hesap silme,
  admin test, alerts-daily, digest) hiçbiri `from` geçmiyor → hepsi `SMTP_FROM`.
- `SMTP_FROM` boş/yoksa: `FonBridge <NEXT_PUBLIC_SMTP_FROM_ADDRESS>`; bu değişkenin varsayılanı **`info@fonbridge.com`** (`src/lib/env.ts:99`).
- Zarf göndericisi (Return-Path, SPF'in baktığı adres) = From adresi → bounce'lar `info@` kutusuna düşer.
- Beta script'leri (`scripts/beta-*.ts`, `esr-calibration.ts`) yalnız `SMTP_FROM` **boşken** kendi `Fabrika Beta <…>` adreslerini kullanır; üretimde `SMTP_FROM` dolu.
- 465 dışında bir örtük-TLS portu kullanılırsa `SMTP_SECURE=true` ŞART; yoksa istemci düz bağlanır ve 10 sn sonra `ETIMEDOUT` alır.

## 6. Vulut'a özgü notlar

### 6.1 Portlar
| Yön | Port | A (cPanel/Exim) | B/C (Vulut VPS'te kendi MTA) |
|---|---|---|---|
| Uygulama → SMTP (giden, istemci) | 465 (/587) | **Gerekli.** Uygulama VPS'inden `mail.fonbridge.com:465` çıkışı | MTA aynı makinedeyse gerekmez |
| MTA → alıcı MX (giden) | **25** | Vulut'un Exim'i hallediyor | **Gerekli.** Vulut VPS'lerinde spam önlemi olarak kapalı olabilir → destek talebiyle açtırılır |
| İnternet → bizim MX (gelen) | 25 | cPanel'de açık | Yalnız B |
| ACME (sertifika) | 80 | AutoSSL cPanel'de | B/C'de certbot için açık olmalı |

29.09 ölçümü (bu ofis ağından, mac, `nc -G 5 -vz`): `77.92.144.187:465` ve `:587` **açık**; `:25` erişilemedi — bu ağdan
dışarı 25 zaten kapalı (ISS), Vulut hakkında hüküm değil. Vulut sunucusunda doğrulama:
```sh
# uygulamanın koşacağı Vulut VPS'inde (Linux: nc -w; mac'teki -G yok):
nc -vz -w 5 mail.fonbridge.com 465        # A için şart
nc -vz -w 5 gmail-smtp-in.l.google.com 25 # B/C için şart; "timed out" = Vulut 25'i kapatmış
openssl s_client -connect mail.fonbridge.com:465 -servername mail.fonbridge.com </dev/null | head -5
```

### 6.2 PTR / rDNS
PTR, alan adı DNS'inde (cPanel Zone Editor) **değil**, IP bloğunun sahibi Vulut'ta tutulur (`77.92.144.0/24`,
`AS214854`, RIPE `TR-GEOIPA-VULUT-20240517`). Talep yolu: Vulut müşteri paneli → sunucu/IP → "Reverse DNS / PTR";
yoksa destek bileti.
- **A:** PTR `77.92.144.187 → srv.iyisunucu.com.tr` kalır; Exim'in HELO'su da `srv.iyisunucu.com.tr` → ileri/geri tutarlı
  (FCrDNS). Alıcılar PTR'ı HELO ve IP ile karşılaştırır, From alanıyla değil; DKIM + DMARC alan adını bağlar. Paylaşımlı
  IP'de değiştirilemez — bunu talep etmeyin.
- **B/C** bilet metni:
  > `<VPS_IP>` için PTR kaydının `mail.fonbridge.com` olarak ayarlanmasını rica ederiz. İleri kayıt
  > `mail.fonbridge.com A <VPS_IP>` yayında. Ayrıca bu sunucudan giden TCP 25 portunun (SMTP) açılmasını talep ediyoruz;
  > transactional e-posta (davet, bildirim), günlük birkaç yüz ileti.

  Önce A kaydı yayında olmalı; PTR ↔ A ↔ HELO üçü aynı ad.

### 6.3 Kara liste
29.09.2026, `77.92.144.187` (salt-okunur DNSBL): Spamhaus ZEN, SpamCop, Barracuda, SORBS, PSBL, Mailspike,
UCEPROTECT-1/2/3, GBUdb, DroneBL → **temiz**; manitu zaman aşımı. Bilinen-pozitif (`127.0.0.2` → Spamhaus)
çözücünün çalıştığını kanıtladı. Tekrar (B/C'de `<VPS_IP>` ile, **IP'yi kullanmadan önce**):
```sh
ip=77.92.144.187; rev=$(echo $ip | awk -F. '{print $4"."$3"."$2"."$1}')
dig +short 2.0.0.127.zen.spamhaus.org      # boş dönerse çözücü Spamhaus'a erişemiyor → sonuç anlamsız
for bl in zen.spamhaus.org bl.spamcop.net b.barracudacentral.org dnsbl.sorbs.net bl.mailspike.net dnsbl-2.uceprotect.net dnsbl-3.uceprotect.net; do
  echo "$bl: $(dig +short $rev.$bl A)"; done   # boş = temiz
```
Alan adı listeleri (29.09 ölçüm): `dig +short fonbridge.com.dbl.spamhaus.org` ve `fonbridge.com.multi.surbl.org` → **boş (temiz)**;
bilinen-pozitif `dbltest.com.dbl.spamhaus.org` → `127.0.1.2`, yani sorgu gerçekten çalışıyor.
Microsoft (Outlook/Hotmail): https://sender.office.com ile delist; SNDS'e IP kaydı önerilir.

### 6.4 SPF'de Vulut
`include:_spf.vulut.com` Vulut'un bütün posta bloklarını kapsar (`77.92.144.0/24, 31.40.199.0/24, 45.43.152.0/24,
45.43.154.0/24, 104.249.19.0/24`) — aynı bloktaki her Vulut müşterisi de fonbridge.com adına SPF'den geçer. Bunu DMARC
hizalı DKIM + `p=reject` kapatır. Daha dar: `v=spf1 ip4:77.92.144.187 -all` — ancak Vulut giden postayı başka IP'ye
taşırsa kırılır; önce Vulut'a sorulmalı (§8). Öneri: şimdilik include.

### 6.5 Yeni alan adı
fonbridge.com 29.09.2026'da kaydedildi. Birçok filtre ilk ~30 gündeki alan adlarına şüpheyle bakar. İlk haftalarda
hacmi düşük tutun (davet/bildirim zaten düşük), toplu gönderim yapmayın, DMARC raporlarını izleyin.

## 7. Canlıya geçiş kontrol listesi

### 7.0 Doğrulama komutları (DNS yayıldıktan sonra; hepsi salt-okur, son ikisi tek deneme iletisi gönderir)
```sh
# 1) Bölge yetkili NS'de var mı (yayılmayı beklemeden, ilk bakılacak yer)
dig SOA fonbridge.com @ns1.iyisunucu.com.tr +norec | grep status   # NOERROR olmalı (bugün REFUSED)
# 2) Kayıtlar genel çözücülerde — §3.3 döngüsü + www:
dig +short www.fonbridge.com @8.8.8.8; dig +short AAAA fonbridge.com @8.8.8.8
# 3) Posta portları ve sertifika adı (465 örtük TLS, 587 STARTTLS; 25 yalnız sunucu-sunucu)
openssl s_client -connect mail.fonbridge.com:465 -servername mail.fonbridge.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -enddate -text | grep -E 'subject=|notAfter|DNS:'
openssl s_client -starttls smtp -connect mail.fonbridge.com:587 -servername mail.fonbridge.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -text | grep -E 'subject=|DNS:'
openssl s_client -starttls smtp -connect mail.fonbridge.com:25 -servername mail.fonbridge.com </dev/null 2>/dev/null | head -3   # ofis ağında 25 kapalı; VPS'ten koş
#    beklenen: DNS:mail.fonbridge.com (bugün CN=autoconfig.srv.iyisunucu.com.tr)
# 4) Uçtan uca test gönderimi (swaks; brew install swaks / apt install swaks). Parola komut satırına YAZILMAZ:
#    --auth-password verilmezse swaks sorar; geçmişe ve `ps` çıktısına düşmez.
swaks --server mail.fonbridge.com --port 465 --tls-on-connect --tls-verify \
      --auth LOGIN --auth-user info@fonbridge.com \
      --from info@fonbridge.com --h-From 'FonBridge <info@fonbridge.com>' \
      --to <kendi-gmail-adresiniz> --h-Subject 'fonbridge SMTP test 465'
swaks --server mail.fonbridge.com --port 587 --tls --tls-verify --auth LOGIN --auth-user info@fonbridge.com \
      --from info@fonbridge.com --to <kendi-gmail-adresiniz> --h-Subject 'fonbridge SMTP test 587'
#    beklenen: `<~ 235 … Authentication successful` ve `<~ 250 …` (DATA sonrası kuyruk id'si).
#    --tls-verify ŞART: swaks varsayılan olarak sertifika doğrulaması DÜŞSE BİLE gönderir (yalnız "failed CA
#    verification" yazar) — yani bugünkü yanlış sertifikada da "başarılı" görünürdü. Uygulama (nodemailer) doğrular;
#    test de doğrulamalı. `*** TLS startup failed (… certificate verification failed …)` = sertifika adı/zinciri yanlış (adım 3).
# 5) mail-tester: https://www.mail-tester.com açılınca verdiği test-xxxx@srv1.mail-tester.com adresine
#    ya 4. adımdaki swaks'ı --to ile, ya da uygulamanın /admin ekranındaki "deneme e-postası"yla gönder
#    (ikincisi gerçek uygulama yolunu da sınar). Hedef ≥ 9/10; SPF/DKIM/DMARC satırlarının üçü de yeşil.
# 6) Gmail'de "Orijinali göster": SPF PASS (77.92.144.x), DKIM PASS d=fonbridge.com, DMARC PASS.
```
Parola ne komutta ne kabuk geçmişinde ne de bu repoda durur; swaks'ın sorduğu isteme elle girilir.

1. [ ] fonbridge.com Vulut cPanel'de; `dig SOA fonbridge.com @ns1.iyisunucu.com.tr` artık REFUSED değil.
2. [ ] §3.1 kayıtları; kök A uygulama VPS'inde, MX `mail.fonbridge.com`; §3.3 komutları `@8.8.8.8` ve `@1.1.1.1`'de doğru.
3. [ ] cPanel → E-posta Teslim Edilebilirliği: fonbridge.com için DKIM ve SPF "geçerli".
4. [ ] AutoSSL `mail.fonbridge.com`'u kapsadı (§4 openssl komutu `DNS:mail.fonbridge.com` gösteriyor).
5. [ ] `info@` ve `dmarc@` kutuları açık; parola sır kasasında.
6. [ ] Uygulama VPS'inden `nc -vz -w 5 mail.fonbridge.com 465` başarılı.
7. [ ] Üretim `.env` (§5), uygulama yeniden başlatıldı; `/admin/settings` SMTP satırları doğru (Gönderen `FonBridge <info@fonbridge.com>`).
8. [ ] Yönetim ekranından deneme e-postası → Gmail "Orijinali göster": `SPF: PASS`, `DKIM: PASS (fonbridge.com)`, `DMARC: PASS`.
9. [ ] https://www.mail-tester.com → hedef **≥ 9/10**.
10. [ ] Kara liste (§6.3) temiz.
11. [ ] Bounce: var olmayan adrese deneme → geri dönüş `info@`'ya geliyor.
12. [ ] Outlook/Hotmail'e deneme (paylaşımlı IP'de en sık spam'e düşen yer); spam'deyse B'yi değerlendir.
13. [ ] 2–4 hafta sonra DMARC raporları → `p=quarantine`.
14. [ ] Web: §10.3 — `www` ve `http` üç istek de tek sıçramayla `301 https://fonbridge.com/…`; iki adın sertifikası geçerli.

## 8. Patronun yapacakları (sırayla; hiçbirini biz yapmadık)
0. **Bilgi:** Vulut panelinde `mail.fonbridge.com`'un "kurulu" olduğu hizmet hangisi, IP'si ne (§1.1)? Uygulama hangi
   sunucuda koşacak, IP'si (`<APP_IP>`, varsa IPv6) ne? Bu ikisi gelmeden §3.0 tablosundaki yer tutucular doldurulamaz.
1. **Karar:** A (Vulut cPanel/Exim) mı, B (Vulut VPS'te docker-mailserver) mı? Öneri A. "PTR = mail.fonbridge.com" şartsa B.
2. Vulut cPanel'e **fonbridge.com**'u ekle (yeni hesap ya da mevcut hesaba addon domain). Bugün NS'ler bu alan için REFUSED dönüyor.
3. Zone Editor'da §3.1 kayıtları: kök `A` → uygulama VPS IP'si (cPanel'in yazdığını değiştir), `mail A 77.92.144.187`,
   `MX 10 mail.fonbridge.com`, SPF, DMARC (`rua=mailto:dmarc@fonbridge.com`). DKIM'i "E-posta Teslim Edilebilirliği"nden kur.
4. `info@fonbridge.com` ve `dmarc@fonbridge.com` (ya da `info@`'ya yönlendirme) posta kutularını aç.
5. SSL/TLS Status → AutoSSL'i çalıştır; `mail.fonbridge.com` kapsansın.
6. `info@` parolasını üretim sunucusu `.env`'ine (`SMTP_PASS`) bizzat koy; repoya/sohbete yazma. Diğer satırlar §5.
7. **Vulut'a tek bilet** — sorulacaklar/istenecekler:
   a. Uygulamanın koşacağı VPS'ten `mail.fonbridge.com:465` (ve 587) çıkışı açık mı?
   b. cPanel posta sunucusunun saatlik/günlük gönderim sınırı; dış IP'den (uygulama VPS'i) SMTP AUTH'a izin — cPHulk/firewall
      beyaz listesine uygulama VPS IP'si.
   c. Paylaşımlı sunucunun giden posta IP'si sabit mi (`77.92.144.187`)? Değişirse haber verilsin.
   d. (Yalnız B/C) VPS'ten giden **TCP 25**'in açılması ve `<VPS_IP> → mail.fonbridge.com` **PTR** (metin §6.2).
      Yeni IP verilirse önce kara liste kontrolü için bize iletin.
7b. Uygulama sunucusunda §10.1 ters vekili (Caddy önerisi) — `www` → kök 301 ve iki adın sertifikası. Bunu da
   onay gelince biz kurabiliriz; SSH erişimi gerekir.
8. Bunlar bitince haber ver; §7 listesinin ölçümlerini (dig, openssl, mail-tester, kara liste, Gmail başlıkları) biz koşarız.

## 9. usfinbridge.com ne oluyor?
Uygulama postası için artık kullanılmıyor; DNS'ine dokunulmadı (ölçüm: SPF/DKIM/PTR/TLS hazır, DMARC `p=none` rua yok).
`info@usfinbridge.com` kutusu açık kalabilir. Sitenin iletişim bağlantısı (`src/components/PublicFooter.tsx:135`) ve bazı
hukuk/uyum belgeleri hâlâ `info@usfinbridge.com` diyor — bunlar ayrı iş (sahipleri: fe / cs).

## 10. Web: `www.fonbridge.com` → `https://fonbridge.com` (301) ve TLS (patron kararı 29.09)

Kanonik adres **`https://fonbridge.com`** (çıplak alan, `www`'siz). Uygulama bir Node konteyneri (`Dockerfile`:
`node server.js`, `PORT=3000`, düz HTTP); TLS'i ve yönlendirmeyi **önündeki ters vekil** yapar. Next.js'e host
yönlendirmesi koymuyoruz: `www` isteği uygulamaya varmadan önce `www` adını kapsayan bir sertifikayla TLS'i
bitirmesi gerekir; bunu zaten vekil yapıyor, ikinci bir yönlendirme noktası döngü/çelişki riskidir.

İstenen davranış (üçü de **tek sıçrama**, zincir yok):
| İstek | Cevap |
|---|---|
| `http://www.fonbridge.com/x?y` | `301 Location: https://fonbridge.com/x?y` |
| `https://www.fonbridge.com/x?y` | `301 Location: https://fonbridge.com/x?y` (geçerli `www` sertifikasıyla) |
| `http://fonbridge.com/x?y` | `301 Location: https://fonbridge.com/x?y` |
| `https://fonbridge.com/x` | uygulama (200 / uygulamanın kendi yönlendirmeleri) |

`mail.fonbridge.com` web'e yönlendirilmez (cPanel'in webmail/autoconfig'i orada kalabilir).

### 10.1 Uygulama bir Vulut VPS'inde (Docker) — önerilen: Caddy
Caddy sertifikayı (Let's Encrypt) `fonbridge.com` ve `www` için kendisi alır ve yeniler. `/etc/caddy/Caddyfile`:
```
fonbridge.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
	header Strict-Transport-Security "max-age=300"
}
# Açık http:// adları Caddy'nin OTOMATİK yönlendirmesini kapatır. O otomatik yönlendirme 308 döner ve
# http://www'yi önce https://www'ye atar (iki sıçrama) — ölçüldü, bkz. aşağı. Bu blokla üçü de tek 301.
www.fonbridge.com, http://www.fonbridge.com, http://fonbridge.com {
	redir https://fonbridge.com{uri} permanent
}
```
HSTS: ilk hafta `max-age=300`; her şey oturunca `31536000`. `includeSubDomains` **koymayın** (`mail.`, `cpanel.`,
`webmail.` cPanel'de, kendi sertifika düzenleri var).

Yerel kanıt (29.09, mac + Docker `caddy:2`, `local_certs`, `reverse_proxy` yerine sabit 200; iş bitince konteyner silindi):
```
caddy validate                                   → Valid configuration
İLK SÜRÜM (yalnız "www.fonbridge.com { redir … }", otomatik HTTP→HTTPS'e güvenerek):
  http://www.fonbridge.com/tr/pricing?a=1  → 308 https://www.fonbridge.com/tr/pricing?a=1   ✗ (308 + iki sıçrama)
  http://fonbridge.com/tr/pricing?a=1      → 308 https://fonbridge.com/tr/pricing?a=1       ✗ (301 değil)
YUKARIDAKİ SÜRÜM:
  http://www.fonbridge.com/tr/pricing?a=1  → 301 https://fonbridge.com/tr/pricing?a=1   ✓
  https://www.fonbridge.com/tr/pricing?a=1 → 301 https://fonbridge.com/tr/pricing?a=1   ✓
  http://fonbridge.com/tr/pricing?a=1      → 301 https://fonbridge.com/tr/pricing?a=1   ✓
  https://fonbridge.com/tr/pricing?a=1     → 200, strict-transport-security: max-age=300
  sertifika SAN (SNI fonbridge.com ve www) → DNS:fonbridge.com, DNS:www.fonbridge.com
```
Gerçek ACME yerelde **koşulamadı** (herkese açık DNS + 80/443 gerekir). Caddy HTTP-01 meydan okumasını site
yollarından önce yakalar, ayrıca 443'te TLS-ALPN-01 de dener; yani 80'deki 301 sertifika almayı engellemez.

Önkoşul: `fonbridge.com` ve `www` A/CNAME kayıtları **bu VPS'i** göstermeli ve 80 + 443 dışarıdan açık olmalı
(sertifika HTTP-01 ile 80'den doğrulanır). Kayıtlar yayına girmeden Caddy'yi açmak Let's Encrypt hız sınırını yer;
önce `dig` ile doğrula (§10.3), sonra `systemctl reload caddy`.

nginx tercih edilirse (certbot ile):
```nginx
server { listen 80; listen [::]:80; server_name fonbridge.com www.fonbridge.com;
         location /.well-known/acme-challenge/ { root /var/www/acme; }
         location / { return 301 https://fonbridge.com$request_uri; } }
server { listen 443 ssl; listen [::]:443 ssl; http2 on; server_name www.fonbridge.com;
         ssl_certificate /etc/letsencrypt/live/fonbridge.com/fullchain.pem;
         ssl_certificate_key /etc/letsencrypt/live/fonbridge.com/privkey.pem;
         return 301 https://fonbridge.com$request_uri; }
server { listen 443 ssl; listen [::]:443 ssl; http2 on; server_name fonbridge.com;
         ssl_certificate /etc/letsencrypt/live/fonbridge.com/fullchain.pem;
         ssl_certificate_key /etc/letsencrypt/live/fonbridge.com/privkey.pem;
         location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
                      proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; } }
```
Sertifika (tek sertifika, iki ad): `certbot certonly --webroot -w /var/www/acme -d fonbridge.com -d www.fonbridge.com`;
yenileme `certbot.timer` + `--deploy-hook "systemctl reload nginx"`.
Yerel kanıt (Docker `nginx:1.30.5`, kendinden imzalı sertifika aynı yola): `nginx -t` başarılı; üç giriş de
`301 https://fonbridge.com/tr/pricing?a=1`, `https://fonbridge.com` → 200; `http://www…/.well-known/acme-challenge/tok` → 200
(webroot'tan dosya döner, yönlendirilmez). `listen [::]` satırları yalnız AAAA kaydı varsa; `http2 on;` nginx ≥ 1.25.1 ister (eskisinde `listen 443 ssl http2;`).

### 10.2 Site cPanel'in kendisindeyse (uygulama `srv.iyisunucu` üzerinde)
AutoSSL `fonbridge.com` + `www.fonbridge.com`'u otomatik kapsar. 301 için `public_html/.htaccess` (cPanel →
"Yönlendirmeler" ekranı da aynısını yazar, ama HTTP→HTTPS'i ayrıca istemek gerekir):
```apache
RewriteEngine On
# AutoSSL doğrulamasını yönlendirme (Apache satır sonu yorumu kabul etmez — yorum ayrı satırda kalmalı)
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteCond %{HTTP_HOST} ^www\. [NC,OR]
RewriteCond %{HTTPS} off
RewriteRule ^ https://fonbridge.com%{REQUEST_URI} [R=301,L]
```
Yerel kanıt (Docker `httpd:2.4`, `AllowOverride All` + mod_rewrite): `http://www…` ve `http://fonbridge.com…` →
`301 https://fonbridge.com/tr/pricing?a=1`; `/.well-known/acme-challenge/tok` → 200. (HTTPS kolu burada koşulamadı: cPanel'in
SSL vhost'u gerekir; kural aynı `RewriteCond` zinciri.)
Not: Next.js'in cPanel'de koşması (Node.js App / Passenger) bu projenin hedefi değil; kök A kaydının `<APP_IP>` olması
(§3.0 #1) 10.1 varsayımıdır.

### 10.3 Doğrulama (yayılımdan sonra; ilki önce)
```sh
dig +short A fonbridge.com @8.8.8.8; dig +short www.fonbridge.com @8.8.8.8     # <APP_IP> / fonbridge.com.+<APP_IP>
for u in http://www.fonbridge.com/tr/pricing?a=1 https://www.fonbridge.com/tr/pricing?a=1 http://fonbridge.com/tr/pricing?a=1; do
  curl -sS -o /dev/null -w "$u -> %{http_code} %{redirect_url}\n" "$u"; done
# beklenen üçü de: 301 https://fonbridge.com/tr/pricing?a=1
curl -sSIL https://www.fonbridge.com/ | grep -iE '^(HTTP|location)'   # tek 301, sonra 200 (zincir yok)
for h in fonbridge.com www.fonbridge.com; do
  echo | openssl s_client -connect $h:443 -servername $h 2>/dev/null | openssl x509 -noout -subject -issuer -enddate -text | grep -E 'subject=|issuer=|notAfter|DNS:'; done
# her ikisinde de DNS:fonbridge.com ve DNS:www.fonbridge.com; mac'teki LibreSSL'de `-ext` YOK → `-text | grep DNS:` kullan
curl -sSI https://fonbridge.com/ | grep -i strict-transport                   # HSTS başlığı
```
HSTS ön-yükleme listesine (hstspreload.org) **şimdi başvurmayın**: `includeSubDomains` şart koşar ve geri alması aylar sürer.
