# TASK-MUN2PKA5AG2IV — FB SMTP kendi sunucumuz (devop-fb)

**Durum:** PLAN + yerel doğrulama tamam, **fonbridge.com kararına göre güncellendi (29.09)**, **GÜNCELLEME-2 işlendi (www→kök 301, mevcut-sunucu doğrulaması)**. Canlı kurulum ve DNS
değişikliği **yapılmadı** (patron onayı bekliyor). Yalnız salt-okunur ölçüm (`dig`, `whois`, `nc`, TLS el sıkışması).

## GÜNCELLEME-2 (29.09 gece, Sprint FB-GAP-1) — "mevcut sunucuyu doğrula + DNS'i tamamla" ve www → kök 301

**Özet:** Patron "`mail.fonbridge.com` Vulut'ta kurulu" diyor; ölçüm, **bölgenin ad sunucusunda tanımlı olmadığını**
gösteriyor (yayılma sorunu değil). Plan buna göre yeniden çerçevelendi, tam kayıt listesi + www→kök 301/TLS + doğrulama
komutları runbook'a (`docs/SMTP-SUNUCU.md` §1.1, §3.0, §7.0, §8, §10) eklendi. **Canlı değişiklik yok** (DNS/sunucu/panel).

### Ölçüm (29.09 20:19 UTC, salt-okur; liderin 23:10 TRT ölçümünü doğruluyor ve bir adım ileri götürüyor)
| Sorgu | Sonuç |
|---|---|
| `dig NS fonbridge.com @a.gtld-servers.net +norec` | `ns1/ns2.iyisunucu.com.tr` |
| `dig A ns1/ns2.iyisunucu.com.tr` + RIPE | `77.92.144.187` / `.188`, **VULUT BILISIM**; `.187` PTR `srv.iyisunucu.com.tr` = posta sunucusunun kendisi |
| `dig SOA fonbridge.com @ns1` / `@ns2` `+norec` | **REFUSED** (iki NS'de de); `usfinbridge.com` aynı NS'lerde NOERROR |
| `dig SOA fonbridge.com @8.8.8.8` | **SERVFAIL**; A/AAAA/www/mail/MX/SPF/DKIM/DMARC `@8.8.8.8` ve `@1.1.1.1`'de boş |
| `77.92.144.187:443` SNI `fonbridge.com`/`www.`/`mail.` | başka müşterinin varsayılan sertifikası `CN=webdisk.aigent.com.tr` (usfinbridge.com → kendi LE sertifikası) |
| `77.92.144.187:465` ve `:587 -starttls smtp` SNI `mail.fonbridge.com` | `CN=autoconfig.srv.iyisunucu.com.tr` (varsayılan) |
| Portlar (bu ofis ağından) | 465/587/80/443 açık; 25 kapalı (ISS — Vulut hakkında hüküm değil). `mail.fonbridge.com` adıyla hiçbir port erişilemez: A kaydı yok |

**Sonuç:** REFUSED = yetkili sunucu bu bölgeyi **hiç tanımıyor**; yayılma beklemek çözmez. `srv.iyisunucu.com.tr`
üzerinde fonbridge.com için vhost, sertifika ve bölge üçü de yok. Ya kurulum bu sunucuda yarım kaldı (alan adı
cPanel'e eklenmedi), ya da "kurulu" sunucu başka bir Vulut makinesi.

### ⚠ NS ↔ barındırma tutarsızlığı (işaretlendi)
- `iyisunucu.com.tr` ile Vulut **ayrı şirket değil**: NS'ler Vulut IP bloğunda, `ns1` posta sunucusunun kendisi.
  NS adı değil, **bölgenin o NS'lerde bulunmaması** sorun.
- Eğer patronun "kurulu" dediği `mail.fonbridge.com` **başka bir Vulut sunucusundaysa** (ör. kendi DNS'i olan bir VPS),
  gerçek tutarsızlık budur: kayıtlar o sunucunun panelinde girilmiş ama `.com` kaydı iyisunucu'ya devrettiği için
  dünya onları hiç görmez — lider ölçümündeki tabloya birebir uyar.
- **Öneri:** NS'i değiştirmeyin; bölgeyi `srv.iyisunucu` cPanel'inde açın (usfinbridge.com da orada), kayıtları
  gerçek IP'lere yönlendirin. Kural: bölge yalnız `.com` kaydındaki NS'lerin panelinde düzenlenir.

### Girilecek kayıtlar (runbook §3.0, iyisunucu.com.tr / Vulut cPanel Zone Editor)
```
fonbridge.com.                A      <APP_IP>                 ; cPanel kendi IP'sini yazar → değiştir
fonbridge.com.                AAAA   <APP_IPV6>               ; YALNIZ sunucu v6'da 80/443 dinliyorsa
www.fonbridge.com.            CNAME  fonbridge.com.           ; 301'i ters vekil yapar
mail.fonbridge.com.           A      <MAIL_IP>                ; A seçeneğinde 77.92.144.187
mail.fonbridge.com.           AAAA   <MAIL_IPV6>              ; YALNIZ v6'dan gönderiyorsa (bugün yok → girme)
fonbridge.com.                MX 10  mail.fonbridge.com.
fonbridge.com.                TXT    "v=spf1 include:_spf.vulut.com -all"      ; B/C: ip4:<MAIL_IP>
default._domainkey            TXT    "v=DKIM1; k=rsa; p=<cPanel üretir>"      ; B/C: fb2026._domainkey
_dmarc.fonbridge.com.         TXT    "v=DMARC1; p=none; rua=mailto:dmarc@fonbridge.com; fo=1; adkim=r; aspf=r"
fonbridge.com.                CAA    0 issue "letsencrypt.org"                ; isteğe bağlı (AutoSSL burada LE veriyor)
PTR <MAIL_IP>                 (Vulut'ta, Zone Editor'da değil)         ; A: srv.iyisunucu.com.tr kalır
```
Yer tutucular patrondan/Vulut panelinden: `<MAIL_IP>` = "kurulu" hizmetin IP'si, `<APP_IP>` = uygulama sunucusu.

### www → https://fonbridge.com (301) + TLS (runbook §10) — üç örnek yapılandırma, üçü de yerelde ölçüldü
İzole Docker konteynerleri (`devopfb-*`), iş bitince silindi (`docker ps --filter name=devopfb` → 0):
```
Caddy 2 (önerilen, VPS'te Next.js konteynerinin önünde)
  caddy validate → Valid configuration
  İLK yazdığım sürüm (otomatik HTTP→HTTPS'e güvenen):  http://www… → 308 https://www…   ✗  (308 + iki sıçrama)
  düzeltilmiş (açık http:// adları redir bloğunda):
    http://www.fonbridge.com/tr/pricing?a=1   → 301 https://fonbridge.com/tr/pricing?a=1
    https://www.fonbridge.com/tr/pricing?a=1  → 301 https://fonbridge.com/tr/pricing?a=1
    http://fonbridge.com/tr/pricing?a=1       → 301 https://fonbridge.com/tr/pricing?a=1
    https://fonbridge.com/tr/pricing?a=1      → 200 + strict-transport-security: max-age=300
    sertifika SAN → DNS:fonbridge.com, DNS:www.fonbridge.com
nginx 1.30.5 (+certbot webroot): nginx -t ok; aynı üç 301 + 200; /.well-known/acme-challenge/tok → 200 (yönlendirilmez)
Apache httpd 2.4 .htaccess (site cPanel'deyse): http www/kök → 301 https://fonbridge.com/…; acme yolu → 200
  (ilk taslakta RewriteCond satır sonu yorumu vardı — Apache bunu kabul etmez; yorum ayrı satıra alındı)
```
Next.js'e host yönlendirmesi eklenmedi (bilinçli): `www` TLS'i uygulamaya ulaşmadan vekilde biter; iki yönlendirme noktası döngü riski.
HSTS: ilk hafta `max-age=300`, `includeSubDomains` YOK (mail./cpanel. alt adları), preload başvurusu şimdi yok.

### Doğrulama komutları (runbook §7.0, §10.3) — DNS yayıldıktan sonra
- `dig SOA fonbridge.com @ns1.iyisunucu.com.tr +norec` → NOERROR (ilk bakılacak yer; bugün REFUSED), sonra §3.3 döngüsü `@8.8.8.8`/`@1.1.1.1`.
- `openssl s_client -connect mail.fonbridge.com:465 -servername mail.fonbridge.com` ve
  `openssl s_client -starttls smtp -connect mail.fonbridge.com:587 -servername mail.fonbridge.com` → `DNS:mail.fonbridge.com`.
- **swaks** (465 `--tls-on-connect`, 587 `--tls`) **`--tls-verify` ile**, parola komutta değil (swaks sorar).
  **Gotcha, ölçüldü:** swaks varsayılan olarak sertifika doğrulaması düşse bile gönderir (`failed CA verification`
  yazıp `235`/`250` alır) → bugünkü yanlış sertifikada bile "başarılı" görünürdü. `--tls-verify` ile güvenilmeyen
  sertifikada `*** TLS startup failed (… certificate verification failed …)`, güvenilen CA'da `passed host verification` + 235/250.
  (Docker `debian:stable-slim` + swaks 20240103.0, karşısında örtük-TLS+AUTH ve STARTTLS-zorunlu+AUTH iki mailpit;
  mailpit API'si iki iletiyi `From: FonBridge <info@fonbridge.com>` ile aldı.)
- mail-tester (≥ 9/10; tercihen uygulamanın /admin "deneme e-postası" ile — gerçek yol), Gmail "Orijinali göster" SPF/DKIM/DMARC PASS.
- Web: §10.3 — üç `curl` → tek 301; iki adın sertifika SAN'ı; HSTS başlığı.

### Patronun yapacakları (sıra; runbook §8)
0. **Bilgi:** `mail.fonbridge.com`'un kurulu olduğu Vulut hizmeti + IP'si; uygulama sunucusu IP'si (v4, varsa v6).
1. Karar A/B (öneri A — değişmedi).
2. fonbridge.com'u `srv.iyisunucu` cPanel'ine ekle → bölge NS'lerde açılır (bloke eden tek adım). NS'e dokunma.
3. §3.0 kayıtları; 4. `info@`/`dmarc@` kutuları; 5. AutoSSL; 6. `SMTP_PASS` üretim `.env`'ine; 7. Vulut bileti;
7b. uygulama sunucusunda §10.1 Caddy (onay + SSH gelirse biz kurarız); 8. haber → §7.0/§10.3 ölçümlerini biz koşarız.

### Bu güncellemede değişen dosya
Yalnız `docs/SMTP-SUNUCU.md` (+ bu dosya). Kod değişikliği yok.

---

## Güncelleme (29.09, patron kararı değişti)
Gönderici `info@usfinbridge.com` → **`info@fonbridge.com`**; SMTP sunucusu **`mail.fonbridge.com`**; canlı uygulama
**`fonbridge.com`**; barındırma **Vulut**. Önceki usfinbridge.com planının yerini aldı. Runbook baştan yazıldı:
**`docs/SMTP-SUNUCU.md`** (DNS, 1-3-1, TLS, env, Vulut notları, kontrol listesi, patron listesi).

## 1) Ölçüm — fonbridge.com bugün (29.09 ~23:00)
- `whois`: **29.09.2026 19:57 UTC'de kaydedilmiş** (Squarespace), NS `ns1/ns2.iyisunucu.com.tr` (Vulut cPanel DNS).
- `dig fonbridge.com SOA @ns1.iyisunucu.com.tr` (ve ns2) → **REFUSED**; aynı NS'ler `usfinbridge.com` için NOERROR.
  ⇒ **Bölge Vulut'ta henüz açılmamış**: alan adı hiçbir cPanel hesabına eklenmemiş. Bu yüzden A/MX/SPF/DKIM/DMARC/`mail`
  kayıtlarının **hiçbiri** yok (`@8.8.8.8` boş).
- TLS: `77.92.144.187:465`'e SNI `mail.fonbridge.com` → `CN=autoconfig.srv.iyisunucu.com.tr` (varsayılan); crt.sh'ta
  fonbridge.com için sertifika yok ⇒ `mail.fonbridge.com` sertifikası **yok**.
- Posta sunucusu `77.92.144.187` (Vulut, AS214854): 465/587 açık (bu ağdan); 25 bu ağdan kapalı (ISS; Vulut hakkında hüküm değil).
  Kara liste (IP): temiz (önceki ölçüm). Alan adı: Spamhaus DBL + SURBL `fonbridge.com` → temiz (bilinen-pozitif `dbltest.com` → 127.0.1.2 doğruladı).

## 2) Plan özeti (ayrıntı runbook)
- **1-3-1 → A:** Vulut cPanel/Exim'e fonbridge.com eklenir, `mail.fonbridge.com A 77.92.144.187`. Gerekçe: alan bugün alındı;
  yanına sıfır-itibarlı yeni IP (B/C) koymak spam riskini katlar; cPanel DKIM/AutoSSL hazır. B = Vulut VPS'te docker-mailserver,
  C = yalnız-gönderim Postfix; kayıtları hazır. "PTR = mail.fonbridge.com" mutlak şartsa A olmaz → B/C.
- **SPF:** `v=spf1 include:_spf.vulut.com -all` (A); B/C: `v=spf1 ip4:<VPS_IP> -all`. Uygulama VPS IP'si SPF'e girmez (Exim teslim eder).
- **DKIM:** A'da cPanel `default` seçicisi (E-posta Teslim Edilebilirliği'nden kurulur); B/C'de `fb2026`, üretim komutları runbook §3.2.
- **DMARC:** `v=DMARC1; p=none; rua=mailto:dmarc@fonbridge.com; fo=1; adkim=r; aspf=r` → 2–4 hf sonra quarantine → reject.
- **mail A + MX:** `mail.fonbridge.com A 77.92.144.187`, `MX 10 mail.fonbridge.com`. **Gotcha:** cPanel alan eklenince kök A'yı
  ve MX'i kendi IP'sine yazar; uygulama ayrı VPS'te olduğu için kök A → uygulama VPS IP'si yapılmalı, MX kökü değil `mail.`'i göstermeli.
- **PTR/rDNS:** Vulut'ta tutulur (Zone Editor'da değil). A'da `srv.iyisunucu.com.tr` kalır — HELO ile tutarlı (FCrDNS), paylaşımlı
  IP'de değiştirilemez, talep edilmemeli. B/C'de bilet metni hazır: `<VPS_IP> → mail.fonbridge.com` + giden TCP 25.
- **Portlar:** A için tek şart uygulama VPS'inden 465 çıkışı; B/C için ayrıca 25 çıkışı + 80 (ACME). Vulut'ta doğrulama komutları §6.1.
- **TLS:** A'da AutoSSL, `mail` A kaydı yayına girince `mail.fonbridge.com`'u kapsar; Exim SNI ile sunar (usfinbridge'de aynı
  mekanizma ölçüldü). Kontrol: `openssl s_client … -servername mail.fonbridge.com` → `DNS:mail.fonbridge.com`.
- **Port kararı: 465** (gerekçe): ilk bayttan TLS (RFC 8314), STARTTLS silinmesine karşı kırılma noktası yok; 587 de güvenli
  (mailer kimlik bilgisiyle `requireTLS` zorlar) ama STARTTLS düşerse posta hiç gitmez. Vulut 465'i kapatırsa `SMTP_PORT=587`, tek satır.

## 3) Kod/şablon değişiklikleri
- `.env.example`: `SMTP_PORT=465`, `SMTP_FROM="FonBridge <info@fonbridge.com>"` (sır değil) etkin;
  `SMTP_HOST=mail.fonbridge.com`, `SMTP_USER=info@fonbridge.com` üretim bloğunda **yorum satırı**.
  **Görevden bilinçli sapma:** README `cp .env.example .env` diyor; `SMTP_HOST` etkin olsaydı her yerel çalıştırma ve test
  gerçek sunucuya bağlanmaya çalışırdı (`@fonbridge.com` alıcılarına kimlik doğrulamasız yerel teslim bile olası). Boş = gönderme yok.
  Patron etkin satır isterse tek satırlık değişiklik.
- `src/lib/env.ts:99`: `NEXT_PUBLIC_SMTP_FROM_ADDRESS` varsayılanı → **`info@fonbridge.com`** (SMTP_FROM boşken de doğru gönderici).
- `README.md`: "canlı SMTP sağlayıcısı: patron belirleyecek" → `mail.fonbridge.com` / `info@fonbridge.com`, runbook bağlantısı.
- `docs/SMTP-SUNUCU.md`: fonbridge.com için baştan.
- Mailer (kod okuma): `from: message.from || config.from` (`mailer.ts:111`); uygulama çağıranlarının hiçbiri `from` geçmiyor →
  hepsi `SMTP_FROM`; `secure` boşken yalnız 465'te örtük TLS (`mailer.ts:69`).

## 4) Kanıt — mailpit'te From = info@fonbridge.com
Gerçek `smtpMailer()` (`src/lib/email/mailer.ts`), `npx tsx --env-file=.env.example` + yalnız host/port/kimlik ezilerek;
3 izole mailpit konteyneri (düz / örtük TLS+AUTH / STARTTLS zorunlu+AUTH), iş bitince silindi (`docker ps` → 0).
```
1-envexample-SMTP_FROM     from:"FonBridge <info@fonbridge.com>"                       SENT
2-SMTP_FROM-blank-default  from:"FonBridge <info@fonbridge.com>"   (env.ts varsayılanı) SENT
3-envexample-asis          SMTP_HOST boş → mailer=null (yerelde gerçek sunucuya gitmez)
   .env.example + port 465 → config secure:true (örtük TLS, SMTP_SECURE boşken)
4-implicitTLS+auth (465 yolu, user=info@fonbridge.com)  secure:true                    SENT
5-587-STARTTLS+auth                                   secure:false, requireTLS         SENT
6-587-auth-noSTARTTLS      ERROR MailSendError smtp:ETLS:502  (parola düz gitmedi)
7-güvenilmeyen sertifika   ERROR MailSendError smtp:ESOCKET   (bugünkü mail.fonbridge.com durumu buna denk)
mailpit ham başlık (üç kutuda da aynı):
  Return-Path: <info@fonbridge.com>
  From: FonBridge <info@fonbridge.com>
  Message-ID: <…@fonbridge.com>
```
`npx vitest run src/lib/email` → **20/20**; `npx tsc --noEmit` → **0 hata**.

## PATRONUN YAPMASI GEREKENLER (runbook §8)
1. **Karar:** A (Vulut cPanel/Exim) mı B (Vulut VPS'te kendi posta sunucusu) mı? Öneri **A**.
2. Vulut cPanel'e **fonbridge.com**'u ekle (bugün NS'ler REFUSED dönüyor — ilk ve bloke eden adım).
3. Zone Editor: kök `A` → uygulama VPS IP'si; `mail A 77.92.144.187`; `MX 10 mail.fonbridge.com`;
   SPF `v=spf1 include:_spf.vulut.com -all`; DMARC `v=DMARC1; p=none; rua=mailto:dmarc@fonbridge.com; fo=1; adkim=r; aspf=r`;
   DKIM'i "E-posta Teslim Edilebilirliği"nden kur.
4. `info@fonbridge.com` + `dmarc@fonbridge.com` (ya da yönlendirme) kutularını aç.
5. SSL/TLS Status → AutoSSL çalıştır (`mail.fonbridge.com` kapsansın).
6. `info@` parolasını üretim `.env`'ine (`SMTP_PASS`) bizzat koy; repoya/sohbete yazma. Diğer satırlar runbook §5
   (`NEXT_PUBLIC_APP_URL=https://fonbridge.com` dahil).
7. **Vulut'a tek bilet:** (a) uygulama VPS'inden `mail.fonbridge.com:465/587` çıkışı; (b) saatlik/günlük gönderim sınırı +
   uygulama VPS IP'sinin SMTP AUTH için cPHulk/firewall beyaz listesi; (c) giden posta IP'si sabit mi (`77.92.144.187`);
   (d) yalnız B/C: giden TCP 25 + `<VPS_IP> → mail.fonbridge.com` PTR.
8. Bitince haber ver; runbook §7 ölçümlerini (dig @8.8.8.8/@1.1.1.1, openssl, Gmail SPF/DKIM/DMARC PASS, mail-tester ≥ 9/10, kara liste) biz koşarız.

## Açık / takip
- **Başka ajanların alanı, dokunmadım:** `src/components/PublicFooter.tsx:135` iletişim `mailto:info@usfinbridge.com` (fe);
  `docs/legal/processing-register.md`, `docs/kamu/VERI-YERLESIMI.md`, `docs/SECURITY_COMPLIANCE.md`,
  `docs/legal/HUKUK-SORULARI-2026-09.md` (cs-fb'nin commitlenmemiş TASK-MUN2PNAR729H8 değişiklikleri) `info@usfinbridge.com`
  diyor → fonbridge.com'a çevrilmeli. Demo hesabı `demo@usfinbridge.com` (auth.ts/AuthCard/e2e) SMTP'yle ilgisiz.
- nodemailer EHLO adı `os.hostname()` (yerelde `Aslan-2.local`; üretimde konteyner id'si). cPanel/Exim AUTH'lu gönderimde
  sorun değil; B/C'de uygulama doğrudan MX'e gitmediği için de etkisiz. Gerekirse `name` seçeneği için küçük kod değişikliği.
- DKIM imzasının gerçekten atıldığı ancak canlı gönderimde (Gmail "Orijinali göster") kanıtlanır — bölge + parola olmadan yapılamaz.

## Platform beyanı
Doğrulama **mac**'te (Darwin 27, Node + tsx, Docker Desktop 29.7: mailpit, caddy:2, nginx:1.30.5, httpd:2.4,
debian:stable-slim+swaks; `dig`/`whois`/`nc -G`/LibreSSL `openssl`). Konteyner içleri **Linux**'tur — yani Caddy/nginx/
Apache/swaks davranışı fiilen Linux'ta ölçüldü (üretim VPS'iyle aynı işletim sistemi ailesi); gerçek Vulut sunucusunda
**koşulamadı** (erişim yok, canlı değişiklik onaysız yapılmaz). **Windows'ta koşulamadı** (makine yok); dokunulan kod yolu
yok (yalnız belge), mailer (env + nodemailer TCP/TLS) platformdan bağımsız.
Platforma bağlı komut farkları runbook'ta yazılı: mac `nc -G` ↔ Linux `nc -w`; mac LibreSSL `openssl x509`'da `-ext` yok
(ölçüldü: "unknown option -ext") → `-text | grep DNS:`; `timeout` mac'te yok. Windows'ta `dig`/`swaks` yerleşik değil
(WSL ya da `Resolve-DnsName`); runbook komutları Linux/mac kabuğu içindir.

## Commit
`git commit -- .env.example src/lib/env.ts README.md docs/SMTP-SUNUCU.md docs/agent-results/TASK-MUN2PKA5AG2IV-devop-fb.md`
(GÜNCELLEME-2 aynı commit'e girdi: ilk sürüm henüz commitlenmemişti.)
(diğer ajanların çalışma ağacındaki değişikliklerine dokunulmadı).
