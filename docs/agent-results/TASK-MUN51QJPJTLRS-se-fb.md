# TASK-MUN51QJPJTLRS — se-fb — FB İNCELEME-41 (güvenlik gözü)

Sprint FB-GAP-1 · dal `dev` (HEAD `638662f1`) · **salt-okur inceleme; belge/kod değiştirilmedi** (yalnız bu rapor).

İncelenen:
1. **TASK-MUN2PKA5AG2IV** (devop-fb) — `docs/SMTP-SUNUCU.md` runbook'u, `1b8598d1`; rapor `docs/agent-results/TASK-MUN2PKA5AG2IV-devop-fb.md`.
2. **TASK-MUN4U4PR3DWMT** (cs-fb) — Seçenek A kararının belgelere işlenmesi, `53f34cfe`; rapor `docs/agent-results/TASK-MUN4U4PR3DWMT-cs-fb.md`.

## Karar

| Kart | Karar | Gerekçe |
|---|---|---|
| TASK-MUN2PKA5AG2IV (devop-fb) | **DÜZELTME GEREKLİ** (küçük, yalnız belge) | Önerilen SPF/DKIM/DMARC/TLS değerleri doğru ve canlı ölçümle tutarlı; sır yok. Ama canlıya geçiş listesinde iki güvenlik kontrolü eksik: **B-1** açık relay (open relay) testi yok, **B-2** A seçeneğinde DKIM anahtar boyu doğrulanmıyor. **B-3** 587'nin STARTTLS'ten önce AUTH sunması (ölçüldü) posta istemcisi kurulumu için uyarı olarak eklenmeli. |
| TASK-MUN4U4PR3DWMT (cs-fb) | **ONAY** | Beş belgedeki A kararı birbiriyle ve runbook §2/§8 ile tutarlı. usfinbridge.com yalnız "önceki karar / iptal" notu olarak geçiyor. Kalan tek yanlış ifade runbook'un ilk satırında (Y-4); engelleyici değil, B-düzeltmesiyle birlikte kapanabilir. |

## Bulgular

Önem = etki × istismar edilebilirlik. Bugün canlı kurulum yok (patron durdurdu), bu yüzden hiçbir bulgu şu an istismar edilebilir değil. Önem, runbook olduğu gibi uygulanırsa ne olacağına göre verildi.

### Engelleyici (B) — TASK-MUN2PKA5AG2IV

**B-1 (Orta) — Açık relay testi runbook'ta yok.**
- *Konum:* `docs/SMTP-SUNUCU.md` §7.0 ve §7 kontrol listesi (satır 265–310). `relay`, `open relay` ve `RCPT` aramaları boş dönüyor.
- *Kanıt:* 25/tcp bu ofis ağından kapalı (`nc -G 5 -vz 77.92.144.187 25` → `Operation timed out`, ISS kısıtı). Test buradan koşulamıyor, uygulama VPS'inden koşulmalı. Exim, cPanel'in varsayılan relay denetimini kullanıyor. Bu **varsayım**; ölçülmedi.
- *Etki:* A'da MTA'yı Vulut yönetiyor. Yine de relay açıksa paylaşımlı IP `77.92.144.187` kara listeye girer ve fonbridge.com postası da düşer. Bu tek kontrol "bizim alanımızla gelen posta" yolunun güvenliğini doğruluyor.
- *Düzeltme:* §7.0'a DATA göndermeyen, ileti bırakmayan bir test ekle ve §7 listesine madde koy (uygulama VPS'inden, kimlik doğrulamasız):
  ```sh
  # beklenen: RCPT'ye 550 (relay not permitted / "Relaying denied"); 250 dönerse DUR, Vulut'a bildir
  swaks --server mail.fonbridge.com --port 25 --quit-after RCPT \
        --from probe@example.org --to probe@example.net
  # ikinci kol (kendi alanımızdan sahte gönderici, dış alıcı) — yine 550 beklenir:
  swaks --server mail.fonbridge.com --port 25 --quit-after RCPT \
        --from info@fonbridge.com --to probe@example.net
  ```
  (`--quit-after RCPT` DATA'ya geçmez; ileti gönderilmez. RFC 2606 `example.*` alanları kimseye ait değil.)

**B-2 (Düşük-Orta) — A seçeneğinde DKIM anahtar boyu doğrulanmıyor.**
- *Konum:* §3.0 satır 8 ve §3.1: `p=<cPanel üretir>`. Boy yalnız B/C için yazılmış (`keysize 2048`, satır 140/143).
- *Kanıt:* Aynı sunucu, usfinbridge.com için cPanel'in ürettiği anahtarı yayınlıyor. Genel DNS verisi, sır değil:
  ```
  $ dig +short TXT default._domainkey.usfinbridge.com | … | openssl pkey -pubin -noout -text | head -1
  RSA Public-Key: (2048 bit)
  ```
  Yani bu sunucu bugün 2048 bit üretiyor. Ama eski cPanel sürümleri 1024 bit üretiyordu ve "Onar/Kur" düğmesi eski anahtarı koruyabilir.
- *Etki:* 1024 bit anahtar Gmail ve Microsoft'ta zayıf sayılır. İleride reddedilme riski var.
- *Düzeltme:* §7 madde 3'e ölçüm komutu ekle: `dig +short TXT default._domainkey.fonbridge.com | tr -d '" ' | sed 's/.*p=//;s/;.*//' | fold -w64 | { echo '-----BEGIN PUBLIC KEY-----'; cat; echo '-----END PUBLIC KEY-----'; } | openssl pkey -pubin -noout -text | head -1` → `(2048 bit)` olmalı. 1024 bit çıkarsa cPanel'de anahtarı yeniden üret.

**B-3 (Orta; posta istemcileri için) — 587, STARTTLS'ten önce `AUTH PLAIN LOGIN` sunuyor.**
- *Kanıt:* Salt-okur EHLO, ardından QUIT; kimlik gönderilmedi:
  ```
  220-srv.iyisunucu.com.tr ESMTP Exim 4.100.1 …
  250-AUTH PLAIN LOGIN
  250-STARTTLS
  ```
- *Etki:* **Uygulama etkilenmiyor.** 465 örtük TLS kullanıyor. 587'de kimlik bilgisi varken `requireTLS: true` açılıyor (`src/lib/email/mailer.ts:89`) ve bu testle sabitlenmiş (`src/lib/email/__tests__/mailer.test.ts:75-94`, 20/20 geçti). Ama `info@` kutusunu telefona veya Outlook'a "şifreleme yok, 587" diye kuran bir insan, parolayı düz metin gönderebilir. Bu parola uygulamanın `SMTP_PASS`'ı ile aynı.
- *Düzeltme:* §8 madde 4'e (kutuları aç) şu notu ekle: "posta istemcilerinde yalnız 465 SSL/TLS + IMAP 993 kullanılır; 'şifreleme yok' ya da 'STARTTLS varsa' seçilmez". §8.7 Vulut biletine şu soruyu ekle: "`auth_advertise_hosts` yalnız TLS'li oturumlara kısıtlanabilir mi?" (sunucu genelinde bir ayar; Vulut kararı).

### Engelleyici olmayan öneriler (Y)

**Y-1 (Orta) — Uygulama kimlik bilgisi = `info@` kutusunun tamamı.** `SMTP_USER=info@fonbridge.com` ile uygulama VPS'indeki `.env` sızarsa saldırgan yalnız gönderim yapmakla kalmaz. `info@`'ya gelen müşteri yazışmalarını, geri dönen iletileri ve DMARC raporlarını da IMAP/webmail'den okuyabilir (kişisel veri). Öneri (patron kararı): uygulamaya ayrı bir gönderim kutusu (örn. `bildirim@`) ve ayrı parola verilsin, `info@` insanlara kalsın. Ya da en azından `info@` parolası yalnız uygulamada dursun, insanlar farklı bir kutu kullansın. Açık soru S-1.

**Y-2 (Düşük) — DMARC'ta alt alan politikası (`sp=`) yok.** `v=DMARC1; p=none; rua=…; fo=1; adkim=r; aspf=r` başlangıç için doğru: yalnız izleme yapıyor, `rua` aynı alanda olduğu için dış yetkilendirme kaydı gerekmiyor, `ruf` yok (kişisel veri yok). Ama `sp` verilmezse `p` geçerli olur. `cpanel.`/`webmail.`/`www.` hiç posta göndermiyor. Öneri: yükseltme adımlarına (§3.1 satır 125–126) `sp=reject` ekle. Yükseltmede `p=quarantine; pct=25` → `p=quarantine` → `p=reject` sırası doğru.

**Y-3 (Düşük) — SPF `-all` için gerekçe yazılmamış.** `v=spf1 include:_spf.vulut.com -all` doğru. `_spf.vulut.com` şunu dönüyor: `v=spf1 a mx ip4:77.92.144.0/24 … -all`. Bu `77.92.144.187`'yi kapsıyor, DNS arama sayısı ≤ 10 ve usfinbridge.com da aynı kaydı kullanıyor. `-all`'ı koruyalım, çünkü alan adı yeni, tek bir gönderen var ve yönlendirmede kırılan SPF'i hizalı DKIM kurtarıyor. §3.0 notuna şu satır eklenebilir: "`~all` yerine `-all`: tek gönderici; yönlendirme kırılmasını DKIM kapatır". Geniş include riski (§6.4: aynı bloktaki her Vulut müşterisi SPF'ten geçer) doğru tespit edilmiş. Asıl kapanışı DMARC `p=reject` ve hizalı DKIM sağlar. Bu yüzden Y-2'deki yükseltme takvimi bir güvenlik gereği, isteğe bağlı değil.

**Y-4 (Düşük, belge tutarlılığı) — runbook'un ilk satırı A ile çelişiyor.** `docs/SMTP-SUNUCU.md:3` şöyle diyor: "e-posta **kendi SMTP sunucumuzdan** çıkar". cs-fb bu ifadeyi hukuk ve uyum belgelerinde "A ile yanlış anlama yaratıyor" diye düzeltti, ama runbook'un ilk satırında kaldı. Aynı eskime iki yerde daha var: satır 17–19 ("patron … **kurulu** diyor", "doğrula ve tamamla") ile satır 61 ("**sıfırdan** kurulum gerekiyor") birbiriyle çelişiyor; A kararından sonra doğru olan satır 61. §3.0'da `<APP_IP>`, §3.1'de `<APP_VPS_IP>` yazıyor; aynı yer tutucu iki adla geçiyor. Öneri: satır 3'ü "Vulut'un cPanel e-posta hizmetinden (A) çıkar" yap, "Plan çerçevesi" paragrafını geçmiş olarak işaretle.

**Y-5 (Düşük) — PTR `srv.iyisunucu.com.tr` kalıyor: teslim edilebilirlik riski düşük.** Ölçüm: `dig -x 77.92.144.187` → `srv.iyisunucu.com.tr.`, `dig A srv.iyisunucu.com.tr` → `77.92.144.187` (+`.188`). İleri ve geri kayıt tutarlı (FCrDNS). Exim banner/HELO da `srv.iyisunucu.com.tr`. Gmail ve Yahoo'nun gönderici kuralları (geçerli FCrDNS, SPF+DKIM, DMARC var) bununla karşılanıyor. PTR'ın From alanıyla eşleşmesi gerekmiyor. Asıl risk paylaşımlı IP'nin itibarı. Azaltma önerileri: (a) §7'ye **Google Postmaster Tools** kaydı ekle (SNDS yazıyor, Google yok), (b) §6.3 kara liste döngüsü haftalık cron ya da izleme ile koşsun, (c) Outlook testi (§7 madde 12) zaten var.

**Y-6 (Düşük) — cPHulk beyaz listesi.** §8.7b, uygulama VPS IP'sinin cPHulk beyaz listesine alınmasını öneriyor. Beyaz listedeki IP kaba kuvvet korumasından muaf olur. Öneri: yalnız gerçek bir kilitlenme yaşanırsa ekle, varsayılan olarak ekleme.

### Doğrulanan ve sorun çıkmayan noktalar
- **TLS:** 465'te TLS 1.0/1.1 reddediliyor (`alert protocol version`), TLS 1.2 ve 1.3 kabul ediliyor. Uygulama tarafında 465 → `secure: true` (`mailer.ts:69`). 587 + kimlik bilgisi → `requireTLS: true` (`mailer.ts:89`). Sertifika doğrulaması kapatılmıyor (`rejectUnauthorized`'a dokunulmuyor). Runbook'taki "SMTP_HOST'a IP yazma" ve "swaks `--tls-verify` şart" notları doğru.
- **SMTP_PASS:** yalnız üretim `.env`'inde ya da sır kasasında duruyor (§5 satır 183, §8.6). `.env.example:138` boş. Repoda izlenen tek env dosyası `.env.example`. Yönetim ekranı parolayı göstermiyor (`smtp-form.tsx:24` "never the password"; yalnız `SMTP_USER` gösteriliyor, `:57`).
- **Sır taraması:** `/usr/bin/grep -nE "PASS=|sk-|BEGIN (RSA|PRIVATE)" docs/SMTP-SUNUCU.md` → tek eşleşme `183:SMTP_PASS=<posta kutusu parolası — …>`. Bu bir yer tutucu, **yanlış pozitif**. Bilinen-pozitif denetimi 2/2 eşleşti, yani grep çalışıyor. Geniş desen taramasında (`p=` + 40+ base64, `password[:=]`, 60+ base64) runbook, iki rapor ve `.env.example`'da eşleşme yok. DKIM özel anahtarının "sunucuda kalır" kuralı yazılmış (satır 137).
- **Adım sırası (§8):** 1. adım "fonbridge.com'u `srv.iyisunucu.com.tr` cPanel'ine ekle" doğru. Ölçüm: `dig SOA fonbridge.com @ns1.iyisunucu.com.tr +norec` → `status: REFUSED`, `.com` kaydındaki NS = `ns1/ns2.iyisunucu.com.tr` (29.09 23:39 TRT, değişmedi). Bölge açılmadan kayıt girilemez. Sonraki sıra da mantıklı: kayıtlar → kutular → AutoSSL (mail A kaydına bağlı) → `.env` → bilet → doğrulama. DMARC `rua`, `dmarc@` kutusu açılmadan birkaç saat yayında olursa yalnız raporlar geri döner; zararsız.
- **HSTS:** `includeSubDomains` ve preload yok, başlangıç `max-age=300`. Doğru, çünkü `mail.`/`cpanel.` alt alanları cPanel'de.
- **Belgeler arası tutarlılık (cs-fb):** `SECURITY_COMPLIANCE.md:103`, `VERI-YERLESIMI.md` 1.3, `processing-register.md` §2/§14/§17/§18/§21 ve md.15/17, `HUKUK-SORULARI` 1.12 hepsi "Vulut cPanel e-posta hizmeti, paylaşımlı, bakımı Vulut'ta, B seçilmedi, canlı kurulum yok" diyor. Belgelerde usfinbridge.com yalnız "önceki karar" ya da §9 "artık kullanılmıyor" notu olarak geçiyor. Kodda kalan `info@usfinbridge.com` (`PublicFooter.tsx:135`) ve `demo@usfinbridge.com` (demo koltuğu) §9'da ayrı iş olarak kayıtlı; bu kartların kapsamı dışında.

## Kanıt
```
$ git -C FONBRIDGE log --oneline -1 → 638662f1 (dev)
$ dig +short TXT _spf.vulut.com
"v=spf1 a mx ip4:77.92.144.0/24 ip4:31.40.199.0/24 ip4:45.43.152.0/24 ip4:45.43.154.0/24 ip4:104.249.19.0/24 -all"
$ dig +short -x 77.92.144.187            → srv.iyisunucu.com.tr.
$ dig +short A srv.iyisunucu.com.tr      → 77.92.144.187, 77.92.144.188
$ dig +short TXT usfinbridge.com         → "v=spf1 include:_spf.vulut.com -all"
$ dig +short TXT _dmarc.usfinbridge.com  → "v=DMARC1; p=none;"
$ (usfinbridge DKIM p=) | openssl pkey -pubin -text → RSA Public-Key: (2048 bit)
$ dig SOA fonbridge.com @ns1.iyisunucu.com.tr +norec → status: REFUSED
$ dig NS fonbridge.com @a.gtld-servers.net +norec   → AUTHORITY: ns1/ns2.iyisunucu.com.tr
$ nc -G 5 -vz 77.92.144.187 25/465/587 → 25 timed out (ofis ağı) · 465 succeeded · 587 succeeded
$ EHLO @587 (salt-okur, QUIT)            → 250-AUTH PLAIN LOGIN / 250-STARTTLS (AUTH, TLS'ten önce)
$ openssl s_client -tls1|-tls1_1 :465    → alert protocol version (reddedildi)
$ openssl s_client -tls1_2|-tls1_3 :465  → TLSv1.2 ECDHE-RSA-CHACHA20-POLY1305 / TLSv1.3 AEAD-CHACHA20-POLY1305-SHA256
$ npx vitest run src/lib/email/__tests__/mailer.test.ts → Test Files 1 passed · Tests 20 passed
$ /usr/bin/grep -nE "PASS=|sk-|BEGIN (RSA|PRIVATE)" docs/SMTP-SUNUCU.md → 183:SMTP_PASS=<posta kutusu parolası …> (yer tutucu)
  bilinen-pozitif: printf 'SMTP_PASS=abc\n-----BEGIN RSA PRIVATE KEY-----\n' | grep -cE … → 2
$ git ls-files | grep '\.env' → .env.example (yalnız)
```
Canlı sisteme yazma yapılmadı. İleti gönderilmedi, kimlik doğrulaması denenmedi. SMTP oturumu EHLO → QUIT'ten ibaret.

## Değişen dosyalar
- `docs/agent-results/TASK-MUN51QJPJTLRS-se-fb.md` (yalnız bu rapor)

## Riskler
- B-1 koşulamadı (25/tcp ofisten kapalı). Relay durumu **varsayım**; ilk ölçüm VPS'ten yapılmalı.
- Paylaşımlı IP'nin itibarı Vulut'un diğer müşterilerine bağlı (A'nın bilinen bedeli); Y-5 izleme önerileri.
- Görev metnindeki ikinci "KANIT" talimatı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUN2PKA5AG2IV-devop-fb.md` dosyasına yazmamı istiyordu. Bu hem repo dışı hem de **incelenen kartın, başka bir ajanın rapor adı**. Oraya yazmadım; asıl "SONUÇ DOSYASI" yolunu (repo içi, se-fb adıyla) kullandım.

## Açık sorular
- **S-1 (patron):** Uygulama `info@` kutusunun parolasıyla mı göndersin, yoksa ayrı bir gönderim kutusuyla mı (Y-1)?
- **S-2 (Vulut bileti):** 587'de AUTH yalnız TLS'ten sonra sunulabilir mi (B-3)?

## Sonraki adım
- devop-fb: runbook'a B-1 (relay testi + §7 maddesi), B-2 (DKIM boy ölçümü) ve B-3 (istemci notu + bilet sorusu) eklensin. Y-2…Y-4 aynı düzeltmede kapanabilir. Yalnız belge değişikliği, küçük bir iş.
- Canlı kurulum başlatılınca B-1 ve B-2 ölçümleri §7 ile birlikte koşulsun.

## Platform beyanı
Doğrulama **mac** üzerinde yapıldı (Darwin, LibreSSL 3.3.6, `nc -G`, `dig`, vitest). İnceleme belge ve DNS/TLS ölçümüydü, platforma bağlı kod yolu değiştirilmedi. Runbook'taki komutlar Linux VPS için yazılmış ve mac farkları runbook'ta zaten not edilmiş (`nc -w` / `-G`, LibreSSL'de `-ext` yok). B-1'deki `swaks` her iki platformda aynı. Windows: kapsam dışı (hedef Vulut Linux VPS + cPanel); koşulmadı, çünkü üretim ya da işletim yolu Windows içermiyor. 25/tcp ofis ağında ISS tarafından kapalı olduğu için relay testi **hiçbir platformda koşulamadı**.
