# İNCELEME-46 — TASK-MUN2PKA5AG2IV (be-fb) · SMTP runbook İNCELEME-41 eklemeleri — devop-fb

Sprint FB-GAP-1 · dal `dev` · incelenen commit **`47b3bbbe`** (`docs/SMTP-SUNUCU.md`, +127/−10) · be-fb raporu
`docs/agent-results/TASK-MUN2PKA5AG2IV-be-fb.md` · kaynak inceleme `docs/agent-results/TASK-MUN51QJPJTLRS-se-fb.md`.
Canlı sisteme yazma yok. DNS, cPanel ve posta kutusu değişmedi. İleti gönderilmedi, kimlik doğrulaması denenmedi.
Yalnız EHLO/MAIL/RCPT → QUIT probları ve DNS sorguları yapıldı.

## Karar: **DÜZELTME GEREKLİ** (küçük, yalnız belge)

B-2, B-3 ve Y-2…Y-6 doğru kapanmış. Komutlar gerçekten çalışıyor ve Seçenek A ile tutarlı: `mail.fonbridge.com`,
`info@fonbridge.com`, `77.92.144.187`, PTR `srv.iyisunucu.com.tr`, `include:_spf.vulut.com`. Sır yok.
**B-1'in (açık relay testi) iki kusuru var.** Test yazıldığı gibi büyük olasılıkla koşulamaz. Pozitif kontrolü de
yanlış sonuç verir. Bu yüzden §7 madde 15 bugünkü haliyle işaretlenemez.

## Bulgular

**B-1 (Orta) — Relay testinin 25 kolu "uygulama VPS'inden" koşulacak, ama VPS'ten 25 çıkışı büyük olasılıkla kapalı.**
§7.0 adım 7 a/b'yi "UYGULAMA VPS'inden" koşturuyor. Runbook'un kendisi ise Vulut VPS'te 25 çıkışının talep edilerek
açıldığını söylüyor (§2 tablo satır 73 B: "VPS'te 25 çıkışı açtırılmalı"; §6.2 bilet metni satır 249). A seçildiği için
§8 7d üstü çizili, yani bu çıkış istenmeyecek. Sonuç: a/b bağlantı zaman aşımıyla biter, relay politikası ölçülmez ve
madde 15 askıda kalır. Açık relay tehlikesi 25'te gerçekleşir. 587 kolu (c) bunun yerine geçmez.
Düzeltme önerisi: adım 7'nin başına ön kontrol ekle: `nc -vz -w 5 mail.fonbridge.com 25`. Kapalıysa şunlardan
biri yapılmalı: (i) 25 çıkışı açık herhangi bir Linux makineden koş (geçici bulut VM'i vb.), (ii) §8 7a biletine
"test için VPS'ten 25 çıkışı geçici olarak açılabilir mi" ekle, ya da (iii) ikisi de yoksa bunu §7 madde 15'te açık
risk olarak yaz ve 7g teyidine dayan.

**B-2 (Orta) — Pozitif kontrolün göndericisi belirtilmemiş. Varsayılan okumayla 550 döner ve yanlış teşhise götürür.**
Metin şöyle: "kendi alanımıza teslim `--to info@fonbridge.com` ile 25'te 250 dönmeli — yoksa test yanlış sunucuya
gidiyordur". Hemen üstündeki (a) satırından `--from probe@example.org` alınırsa sunucu gönderici doğrulamasında keser.
Bunu ölçtüm (29.09 21:01 UTC, 587, STARTTLS, DATA yok, yerel alıcı):
```
MAIL FROM:<probe@example.org>  RCPT TO:<postmaster@usfinbridge.com>
550-Verification failed for <probe@example.org>
550 Sender verify failed
```
Yani doğru sunucuda bile "yanlış sunucu" sonucuna varılır. Düzeltme: pozitif kontrolü tam komut olarak yaz:
`swaks --server mail.fonbridge.com --port 25 --quit-after RCPT --from info@fonbridge.com --to info@fonbridge.com`
→ RCPT'ye `250`. Gönderen yerel ve doğrulanabilir, alıcı yerel; relay yok. Bu komut da `info@` açıldıktan sonra koşulmalı.

**Y-1 (Düşük) — DKIM komutunun "BEKLENEN" metni yalnız LibreSSL/OpenSSL 1.1 için doğru.** Hedef Linux VPS'te
OpenSSL 3 var. Aynı komutun çıktıları:
```
LibreSSL 3.3.6 : RSA Public-Key: (2048 bit)      · boş kayıt → unable to load Public Key
OpenSSL 3.6.3  : Public-Key: (2048 bit)          · boş kayıt → Could not find private key of Public Key from <stdin>
```
"BEKLENEN: `…Public-Key: (2048 bit)`" yazılmalı. Hata satırı `Could not read` değil; "boş ya da hata = kayıt yok/bozuk"
denmeli. Komutun kendisi iki kütüphanede de doğru çalışıyor.

**Y-2 (Düşük) — swaks'ın TLS'li koldaki ret işareti farklı.** Beklenen örnek `<** 550 …`. Bu işaret 25'teki düz
oturumda doğru. (c) kolunda (587 + `--tls`) ise ret `<~* 550`/`<~* 451` görünür (ölçüldü). "`<**` ya da `<~*`" yazılmalı.

**Y-3 (Düşük) — §8 madde 6, açık S-1 kararıyla çelişiyor.** Madde 6 "`info@` parolasını `SMTP_PASS`'a koy" diyor.
Madde 4 ise S-1'i (ayrı `bildirim@` kutusu) karar bekliyor diye işaretliyor. §5'teki `SMTP_USER=info@fonbridge.com`
de aynı durumda. Öneri: "S-1'de seçilen gönderim kutusunun kullanıcı adı/parolası" yaz. `bildirim@` seçilirse
`SMTP_FROM` `info@` olarak kalabilir; aynı alan olduğu için DMARC hizası bozulmaz.

**Y-4 (Düşük) — §7.0 başlığı artık yanlış.** Başlıkta "son ikisi tek deneme iletisi gönderir" yazıyor. İleti gönderen
adımlar 4–5. Eklenen 7–9 ileti göndermiyor. Öneri: "adım 4–5 tek deneme iletisi gönderir".

**N-1 (Nit) — "7b" çakışması.** §8'de hem madde 7'nin alt maddesi `b.` (cPHulk) hem üst düzey `7b.` (Caddy) var.
İNCELEME-41 Y-6 zaten "§8.7b" diye cPHulk'a atıf yapmıştı. Üst düzeyi `7'`/`7-web` gibi bir adla ya da ayrı numarayla ayır.

**N-2 (Nit) — "mac: nc -G 5" notu gereksiz.** mac'teki `nc` da `-w 5` ile çalışıyor ve 5,02 sn'de çıktı (ölçüldü).
Kalabilir, zararı yok.

### Doğru bulunanlar (kanıtlı)
- **§6.6 a/b/c** komutları mac'te LibreSSL ve OpenSSL 3.6.3 ile aynen koşuldu. Bugünkü sonuç doğru: (a) `250-AUTH PLAIN LOGIN`,
  yani ayar uygulanmamış. (b) TLS sonrası `250-AUTH PLAIN LOGIN`. (c) `… STARTTLS AUTH=PLAIN AUTH=LOGIN`, `LOGINDISABLED` yok.
- **WHM ayar adları** (Exim "Require clients to connect with SSL or issue the STARTTLS command before they are allowed
  to authenticate…" ve Dovecot "Allow Plaintext Authentication") cPanel belgelerindeki adlarla aynı. Sunucu geneli
  ayar olduğu için bunun Vulut'a bilet (7e) olarak yazılması doğru.
- **DKIM komutu** (§7.0 adım 8) çok parçalı TXT'yi birleştiriyor. usfinbridge.com → `(2048 bit)` (iki kütüphane).
  fonbridge.com → hata; bölge henüz yok, bu da beklenen durum.
- **swaks bayrakları** (swaks 20240103.0, brew ile kuruldu): `--quit-after RCPT` DATA'ya geçmeden QUIT gönderiyor.
  `--tls --tls-verify` çalışıyor. 587 kolunun (c) bugünkü sonucu be-fb ölçümüyle aynı: `info@fonbridge.com`→dış `451`
  (bölge yok), `probe@example.org`→dış `550 Sender verify failed`. Hiçbirinde `250` yok.
- **Seçenek A tutarlılığı:** satır 3 ve "Plan çerçevesi" (geçmiş olarak işaretli) düzeltilmiş. `<APP_IP>` tek adla
  geçiyor. PTR `srv.iyisunucu.com.tr` kalıyor. §3.0 satır 7 `-all` gerekçesi, §3.1 `sp=reject`, §7 madde 17 Postmaster,
  §8 7b cPHulk "varsayılan değil" doğru.
- **§8 sırası:** 1 alan adı → 2 IP → 3 DNS + DKIM (2048) → 4 kutular + S-1 + istemci kuralı → 5 AutoSSL → 6 `.env` →
  7 bilet (7e–7g) → 8 ölçüm. Sıralama mantıklı: 7f yalnız adım 3'teki ölçümden sonra anlamlı ve bilet ondan sonra
  gidiyor. Eksik tek şey B-1'deki 25 çıkışı sorusu.
- **Sır:** yok (aşağıda).

## Kanıt (mac, bu ofis ağı, 29.09.2026 ~20:58–21:03 UTC, hepsi salt-okur)
```
$ dig +short A mail.fonbridge.com ; dig +short NS fonbridge.com ; dig +short TXT default._domainkey.fonbridge.com
(üçü de boş — bölge henüz açılmadı; §8 madde 1 bekleniyor)
$ dig +short -x 77.92.144.187
srv.iyisunucu.com.tr.

# §7.0 adım 8, usfinbridge.com anahtarı
LibreSSL 3.3.6 → RSA Public-Key: (2048 bit)
OpenSSL 3.6.3  → Public-Key: (2048 bit)
boş girdi: LibreSSL "unable to load Public Key" · OpenSSL 3 "Could not find private key of Public Key from <stdin>"

# §6.6 (a) nc -w 5 (mac)  → 250-AUTH PLAIN LOGIN   (5.020 total)
# §6.6 (c)                → * OK [CAPABILITY IMAP4rev1 … STARTTLS AUTH=PLAIN AUTH=LOGIN] Dovecot ready.
# §6.6 (b) OpenSSL 3      → 250-AUTH PLAIN LOGIN

# §7.0 adım 7(c) — swaks 20240103.0, 587, --tls --tls-verify, --quit-after RCPT (sertifika adı bugün
#   autoconfig.srv.iyisunucu.com.tr olduğu için --server srv.iyisunucu.com.tr)
 ~> MAIL FROM:<info@fonbridge.com>   <~  250 OK
 ~> RCPT TO:<probe@example.net>      <~* 451 Temporary local problem - please try later
 ~> MAIL FROM:<probe@example.org>    <~  250 OK
 ~> RCPT TO:<probe@example.net>      <~* 550 Sender verify failed
 ~> QUIT                             <~  221 srv.iyisunucu.com.tr closing connection

# B-2 pozitif kontrol çürütmesi (openssl s_client -starttls smtp, 587, DATA yok)
MAIL FROM:<probe@example.org> RCPT TO:<postmaster@usfinbridge.com> → 550 Sender verify failed

# Sır taraması (bu makinede grep=ugrep → /usr/bin/grep)
$ /usr/bin/grep -nE "PASS=|sk-[A-Za-z0-9]{20,}|BEGIN (RSA |EC )?PRIVATE|password[:=]|parola[:=] *[^<]" docs/SMTP-SUNUCU.md
198:SMTP_PASS=<posta kutusu parolası — yalnız sunucu .env / sır kasası>     (yer tutucu, yanlış pozitif)
$ git diff 47b3bbbe HEAD --stat -- docs/SMTP-SUNUCU.md   → (boş; incelenen sürüm = dev HEAD'deki sürüm)
```

## Değişen dosyalar
- `docs/agent-results/TASK-MUN2PKA5AG2IV-devop-fb-inceleme46.md` (bu rapor). Runbook'a dokunmadım; inceleme yalnız belge üzerine.
- Yerel araç: `brew install swaks` (yalnız bu mac, repo dışı).

## Riskler
- B-1 düzelmeden canlıya geçilirse relay politikası yine ölçülmeden kalır. Paylaşımlı IP açık relay çıkarsa kara listeye
  girer ve fonbridge.com postası da düşer.
- 25 çıkışının VPS'te kapalı olması **varsayım**. Runbook'un B metnine dayanıyor, ölçülmedi (VPS henüz yok). Ölçüm B-1'deki ön kontrolle yapılır.

## Açık sorular
- Yok (S-1 ve S-2 zaten patronda/Vulut'ta).

## Sonraki adım
- be-fb (ya da devop-fb): B-1, B-2, Y-1…Y-4 (+ isteğe bağlı N-1) için tek küçük belge commit'i. Ardından yeniden inceleme.

## Platform beyanı
Doğrulama **mac** üzerinde yapıldı (Darwin 27, LibreSSL 3.3.6 **ve** Homebrew OpenSSL 3.6.3, BSD `nc`, `dig`,
swaks 20240103.0). Hedef platform **Linux** (uygulama VPS'i). OpenSSL 3 çıktısı Linux'taki ile aynı biçimde. Y-1 farkını
bu yüzden iki kütüphanede de koşarak gösterdim. Linux `nc` (OpenBSD sürümü) `-w 5` bayrağını aynı anlamda kabul eder.
Linux'ta koşulamadı, çünkü elimizde VPS yok. 25/tcp ofis ağında kapalı olduğu için relay testinin 25 kolu **hiçbir
platformda koşulamadı**. **Windows koşulamadı:** üretim ve işletim yolu (Vulut Linux + cPanel) Windows içermiyor.
Komutlar WSL'de Linux gibi çalışır.
