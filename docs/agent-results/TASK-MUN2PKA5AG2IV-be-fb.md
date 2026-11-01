# TASK-MUN2PKA5AG2IV — be-fb — SMTP runbook İNCELEME-41 düzeltmesi

Sprint FB-GAP-1 · dal `dev` · commit **`47b3bbbe`** (yalnız `docs/SMTP-SUNUCU.md`) · kaynak inceleme
`docs/agent-results/TASK-MUN51QJPJTLRS-se-fb.md`. devop-fb meşgul olduğu için bana verildi.
**Canlı sisteme yazma yok:** DNS, cPanel ya da posta kutusu değişmedi. İleti gönderilmedi, kimlik doğrulaması denenmedi.

## Ne yapıldı

| Bulgu | Runbook'taki karşılığı |
|---|---|
| **B-1** açık relay testi | §7.0 adım 7: swaks `--quit-after RCPT` ile 3 kol: (a) yabancı→yabancı/25, (b) `info@fonbridge.com`→dış/25, (c) aynısı 587. Beklenen 5xx; **250 → DUR + Vulut'a acil bilet**; 4xx sonuç sayılmaz; pozitif kontrol olarak kendi alanımıza 250. Yeni not: Exim relay kararından önce **gönderici doğrulaması** yapıyor, bu yüzden (b) ancak `info@` açıldıktan sonra relay politikasını sınar (ölçüldü, aşağıda). §7 madde 15, §8 madde 7g. |
| **B-2** DKIM boyu (A) | §3.0 satır 8 notu; §3.1 "DKIM anahtar boyu" adımı: 1024 çıkarsa cPanel → E-posta Teslim Edilebilirliği → yeniden üret (2048), ekran yoksa Vulut bileti §8 7f. §7.0 adım 8: `dig … \| openssl pkey -pubin -text` komutu. §7 madde 3'e `(2048 bit)` şartı, §8 madde 3'e not. |
| **B-3** 587'de AUTH, STARTTLS'ten önce | Yeni **§6.6**: ölçüm (587 **ve** IMAP 143 / POP3 110; ek bulgu), uygulamanın neden etkilenmediği (`mailer.ts:69`/`:89`, nodemailer `smtp-connection.js:1368`, testler), Vulut'un yapacağı WHM ayarları (Exim "Require … STARTTLS before … authenticate" + Dovecot "Allow Plaintext Authentication = No"), 3 doğrulama komutu (a/b/c), Vulut kabul etmezse istemci kuralı (yalnız 465/993 SSL/TLS). §7.0 adım 9, §7 madde 16, §8 madde 4 notu + 7e bilet sorusu. |
| Y-1 | §8 madde 4: **S-1 kararı** (ayrı gönderim kutusu `bildirim@` önerisi) patrona soru olarak eklendi. Karar verilmedi. |
| Y-2 | §3.1 DMARC yükseltmesine `sp=reject` eklendi; takvimin isteğe bağlı olmadığı yazıldı (§6.4 bağlantısı). |
| Y-3 | §3.0 satır 7: `-all` gerekçesi. |
| Y-4 | Satır 3 artık "Vulut'un cPanel e-posta hizmetinden (Seçenek A)" diyor. "Plan çerçevesi" paragrafı _geçmiş_ olarak işaretlendi. `<APP_VPS_IP>` → `<APP_IP>`. |
| Y-5 | §7 madde 17: Google Postmaster Tools (önerilen). |
| Y-6 | §8 7b: cPHulk beyaz listesi artık varsayılan değil, yalnız kilitlenme olursa. |

## Kanıt

Hepsi mac, bu ofis ağı, salt-okur (29.09.2026 ~20:47–20:50 UTC):
```
# B-3 — 587 düz EHLO (QUIT; kimlik yok)
250-AUTH PLAIN LOGIN
250-STARTTLS                                  ← AUTH TLS'ten önce ilan ediliyor (İNCELEME-41 ölçümü tekrarlandı)
# 587 STARTTLS sonrası EHLO
250-AUTH PLAIN LOGIN
# ek: IMAP 143 düz
* OK [CAPABILITY IMAP4rev1 … STARTTLS AUTH=PLAIN AUTH=LOGIN] Dovecot ready.   (LOGINDISABLED yok)
# ek: POP3 110 düz CAPA → STLS · USER · SASL PLAIN LOGIN

# §6.6 doğrulama komutları runbook'tan AYNEN çekildi (host→77.92.144.187, mac: nc -w→-G), bash -n syntax-ok, koşuldu:
250-AUTH PLAIN LOGIN        ← (a) boş olmalıydı → "ayar uygulanmamış" (bugünkü doğru sonuç)
250-AUTH PLAIN LOGIN        ← (b)
* OK [CAPABILITY … AUTH=PLAIN AUTH=LOGIN]   ← (c)

# B-2 — runbook §7.0 adım 8 komutu
usfinbridge.com (aynı sunucu, yayındaki anahtar) → RSA Public-Key: (2048 bit)
bilinen-negatif/pozitif: yerelde üretilen 1024/2048 anahtar, 2 parçalı TXT biçiminde → (1024 bit) / (2048 bit)
fonbridge.com bugün: dig boş; dig SOA @ns1.iyisunucu.com.tr +norec → status: REFUSED (bölge hâlâ yok)

# B-1 — 25/tcp ofisten kapalı + swaks kurulu değil → 587 kolu openssl ile elle, DATA/ileti YOK
MAIL FROM:<probe@example.org>  RCPT TO:<probe@example.net> → 550 Sender verify failed
MAIL FROM:<info@fonbridge.com> RCPT TO:<probe@example.net> → 451 Temporary local problem (bölge yok)
MAIL FROM:<info@usfinbridge.com> …                          → 550 No Such User Here / Sender verify failed
⇒ Relay REDDİ görülmedi, ama relay KABULÜ de yok. Politika gönderici doğrulamasının arkasında; asıl ölçüm §7.0 adım 7(b), info@ açıldıktan sonra VPS'ten.

# relay/DKIM bloğu (§7.0 adım 7–9) runbook'tan çekildi → bash -n ok

# Uygulama tarafı
nodemailer 10.0.12 lib/smtp-connection.js:1368  if (!this.secure && !ignoreTLS && (/STARTTLS/ || requireTLS)) → STARTTLS, AUTH'tan önce
src/lib/email/mailer.ts:69 secure: port===465 · :89 requireTLS: !secure && auth!==null
npx vitest run src/lib/email/__tests__/mailer.test.ts → Test Files 1 passed · Tests 20 passed

# Sır taraması
/usr/bin/grep -nE "PASS=|sk-|BEGIN (RSA|PRIVATE)|password[:=]" docs/SMTP-SUNUCU.md
  → 198:SMTP_PASS=<posta kutusu parolası — …>   (yer tutucu, yanlış pozitif)
bilinen-pozitif: printf 'SMTP_PASS=abc\n-----BEGIN RSA PRIVATE KEY-----\n' | grep -cE … → 2

# commit
git show --name-only 47b3bbbe → docs/SMTP-SUNUCU.md (yalnız)
```

## Değişen dosyalar
- `docs/SMTP-SUNUCU.md` (+127 / −10): §başlık, §3.0, §3.1, yeni §6.6, §7.0, §7 madde 3/15–17, §8 madde 3/4/7b/7e–7g
- `docs/agent-results/TASK-MUN2PKA5AG2IV-be-fb.md` (bu rapor)

Kod değişmedi. Prettier: runbook HEAD'de de prettier-temiz değil (`--check` rc=1), `--write` 162 ilgisiz satırı değiştirirdi → uygulanmadı.

## Riskler
- **B-1 hâlâ ölçülmedi.** Test ve beklenen çıktı yazıldı. Ön ölçümde 250 görülmedi, ama relay politikası sender-verify'ın arkasında kaldı. Canlı kurulumda §7 madde 15 atlanmamalı.
- **B-3'ün kalıcı çözümü Vulut'ta.** Ayar sunucu genelinde olduğu için reddedebilirler. O durumda koruma yalnız istemci kuralına (465/993) ve insanların buna uymasına kalır. S-1 kararı (ayrı gönderim kutusu) bu riski de küçültür.
- WHM menü adları cPanel sürümüne göre değişebilir. Yazdıklarım cPanel/WHM belgelerindeki adlar; bu sunucunun WHM'ini görmedim (erişim yok).

## Açık sorular
- **S-1 (patron):** uygulama `info@` ile mi, ayrı bir `bildirim@` kutusuyla mı göndersin? (§8 madde 4)
- **S-2 (Vulut, §8 7e):** AUTH yalnız TLS sonrasına alınabilir mi (Exim + Dovecot)?
- **Ö (kapsam dışı, bilgi):** Sunucu `info@usfinbridge.com` için sender-verify'da "No Such User Here" dönüyor. §9 ise "kutu açık kalabilir" diyor ve footer'da (`PublicFooter.tsx:135`) bu adres hâlâ duruyor; yani o adrese yazılan posta büyük olasılıkla geri dönüyor. Sahibi fe/cs (§9, cs-fb N-1 ile ilişkili). Dokunmadım.

## Sonraki adım
- İNCELEME-41 yeniden inceleme (se-fb): B-1..B-3 kapanışını onaylasın.
- Patron kurulumu başlatınca §8 sırası (7e–7g bilet soruları dahil), ardından §7 madde 15–16 ölçümleri.

## Platform beyanı
Doğrulama **mac** üzerinde yapıldı (Darwin 27, LibreSSL 3.3.6, `nc -G`, `dig`, vitest). Değişiklik yalnız belge; platforma bağlı bir kod yolu yok. Runbook komutları hedef olarak **Linux** (uygulama VPS'i) için yazıldı: `nc -w 5`, mac'te `-G 5` (satır içinde not edildi). `openssl s_client -starttls smtp`, `openssl pkey` ve `dig` iki platformda aynı. LibreSSL'de `-quiet` + `-starttls smtp` çalıştı, OpenSSL'de de aynı bayraklar var. `swaks` mac'te kurulu değil, relay testi hiçbir platformda **koşulamadı**: 25/tcp ofis ağında ISS tarafından kapalı ve komut VPS'ten koşulmalı. 587 kolu openssl ile elle denendi. **Windows koşulamadı:** üretim ve işletim yolu (Vulut Linux VPS + cPanel) Windows içermiyor. Komutlar WSL'de Linux gibi çalışır.
