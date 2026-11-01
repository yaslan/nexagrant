# TASK-MUN2PKA5AG2IV — İNCELEME-46 düzeltmeleri `docs/SMTP-SUNUCU.md`'ye — devop-fb

Sprint FB-GAP-1 · dal `dev` · temel: be-fb `47b3bbbe` + İNCELEME-46 (`bc23526b`,
`docs/agent-results/TASK-MUN2PKA5AG2IV-devop-fb-inceleme46.md`). Seçenek A (Vulut cPanel/Exim) korundu.
Canlı sisteme yazma yok: DNS, cPanel ve posta kutusu değişmedi. İleti gönderilmedi, parola/AUTH denenmedi. Yalnız
bağlantı, EHLO/MAIL/RCPT→QUIT sondaları ve DNS sorguları yapıldı. Kod dosyasına dokunulmadı.

## 1. Ne yapıldı
| Bulgu | Düzeltme (`docs/SMTP-SUNUCU.md`) |
|---|---|
| **B-1** 25 kolu VPS'ten koşulamayabilir | §7.0 adım 7'ye **7-ön ön kontrolü** eklendi: `nc -vz -w 5 mail.fonbridge.com 25` (mac: `-G 5`). AÇIK ve KAPALI çıktıları (Linux OpenBSD nc, RHEL ncat, mac) ayrı ayrı yazıldı. KAPALI ise sırayla şu yollar var: (i) 25'i açık başka bir makine (geçici bulut VM'i vb.), (ii) MXToolbox SMTP Diagnostics "SMTP Open Relay", (iii) §8 7a biletine "test için 25'i birkaç dakikalığına aç" sorusu, (iv) yalnız 587 kolu (c). (c) **yedek sayılmaz, yalnız ipucudur**; bu durumda madde 15 "kısmi, açık risk" diye yazılır ve 7g teyidi beklenir. Madde 15 ve §8 7a da buna göre güncellendi. |
| **B-2** pozitif kontrolün göndericisi yok | Adım 7'ye **(d)** tam komut olarak eklendi: `swaks --server mail.fonbridge.com --port 25 --quit-after RCPT --from info@fonbridge.com --to info@fonbridge.com`. Beklenen çıktı: `220-srv.iyisunucu.com.tr ESMTP Exim …` + RCPT `250`. "Göndericiyi değiştirme" notu eklendi: `probe@example.org` ile de, var olmayan yerel kutuyla da 550 döner. Teşhis tablosu: 220 adı / bağlantı / 550 No Such User. Pozitif kontrol 250 vermeden a/b'nin 5xx'i "relay yok" diye okunmaz. |
| **Y-1** DKIM beklenen metni | `Public-Key: (2048 bit)` (OpenSSL 3) / `RSA Public-Key: (2048 bit)` (LibreSSL). Hata satırları: OpenSSL 3 `Could not find private key of Public Key from <stdin>`, LibreSSL `unable to load Public Key`. |
| **Y-2** swaks ret işareti | Düz oturumda `<**`, TLS'li oturumda (c) `<~*`. 29.09 ölçümleri de `<~*` ile yazıldı. |
| **Y-3** §8.6 ↔ S-1 | §5 `SMTP_USER`/`SMTP_PASS` satırları ve §8 madde 6 "S-1'de seçilen gönderim kutusu" diye yazıldı. Ayrı kutu seçilirse `SMTP_FROM` `info@` kalabilir (aynı alan olduğu için DMARC hizası bozulmaz). Exim'in bu From'a izin verip vermediği adım 4'te ölçülecek. |
| **Y-4** §7.0 başlığı | "yalnız adım 4–5 tek deneme iletisi gönderir, adım 7–9 ileti bırakmaz". |
| **N-1** "7b" çakışması | §8'deki üst düzey `7b.` (Caddy) → `7-web.`. cPHulk `7.b` olarak kaldı. Adım 7'nin ön kontrolü de §7.0 ile karışmasın diye `7-ön` adını aldı. |
| **N-2** "mac: nc -G 5 gereksiz" | **İNCELEME-46'daki kendi bulgumu geri alıyorum.** mac'te `-w` bağlantı kurma süresini sınırlamıyor. Kapalı 25'e `nc -w 5` **75 sn** sürdü, `-G 5` ise 5,0 sn (aşağıda). İNCELEME-46'daki 5,02 sn ölçümü **açık** porttaki boşta kalma süresiydi. Notlar silinmedi, doğru gerekçeyle yeniden yazıldı (§6.1, §6.6 a). |

## 2. Kanıt (mac, bu ofis ağı, 29.09.2026 21:07–21:12 UTC, hepsi salt-okur)
```
$ time nc -vz -w 5 77.92.144.187 25
nc: connectx to 77.92.144.187 port 25 (tcp) failed: Operation timed out     … 1:15.01 total   ← -w connect'i sınırlamıyor
$ time nc -vz -G 5 77.92.144.187 25
nc: connectx to 77.92.144.187 port 25 (tcp) failed: Operation timed out     … 5.007 total
$ swaks --server 77.92.144.187 --port 25 --timeout 5 --quit-after RCPT --from info@fonbridge.com --to info@fonbridge.com
=== Trying 77.92.144.187:25...
*** Error connecting to 77.92.144.187:25:
*** 	Operation timed out                                                     (5.06 s — runbook'taki KAPALI metni)

# B-2 mekanizması: yerel ama VAR OLMAYAN gönderici de 550 alır (587, STARTTLS, --tls-verify, DATA yok)
 ~> MAIL FROM:<info@usfinbridge.com>      <~  250 OK
 ~> RCPT TO:<info@usfinbridge.com>        <~* 550-Verification failed for <info@usfinbridge.com>
                                          <~* 550-No Such User Here
                                          <~* 550 Sender verify failed
 ~> MAIL FROM:<postmaster@usfinbridge.com> … RCPT TO:<postmaster@usfinbridge.com> → aynı 550 (No Such User Here)
# 587 karşılaması (pozitif kontrolde beklenen 220 adı)
<-  220-srv.iyisunucu.com.tr ESMTP Exim 4.100.1 #2 Wed, 30 Sep 2026 00:10:10 +0300

$ dig SOA fonbridge.com @ns1.iyisunucu.com.tr +norec | grep status   → status: REFUSED   (bölge hâlâ yok)
$ dig +short A mail.fonbridge.com                                     → (boş)

# §7.0 kod blokları sözdizimi (94 satır)
$ bash -n <§7.0'ın iki sh bloğu>   → OK
# Sır taraması (bu makinede grep=ugrep → /usr/bin/grep)
$ /usr/bin/grep -nE "PASS=|sk-[A-Za-z0-9]{20,}|BEGIN (RSA |EC )?PRIVATE|password[:=]|parola[:=] *[^<]" docs/SMTP-SUNUCU.md
198:SMTP_PASS=<S-1'de seçilen gönderim kutusunun parolası — …>     (yer tutucu, yanlış pozitif)
```
Y-1 ve Y-2 metinleri İNCELEME-46'daki ölçümlerden alındı (LibreSSL 3.3.6 / OpenSSL 3.6.3; swaks 20240103.0 `<~*`).

## 3. Değişen dosyalar
- `docs/SMTP-SUNUCU.md`: §5, §6.1, §6.6 (a), §7.0 başlık + adım 3/7/8, §7 madde 15, §8 madde 6/7a/7-web.
- `docs/agent-results/TASK-MUN2PKA5AG2IV-devop-fb-3.md` (bu rapor)

## 4. Riskler
- 25'in ölçülmesi yine VPS'e ya da alternatif bir makineye bağlı. Hiçbiri olmazsa madde 15 bilerek **işaretlenmeden** kalır. Bu açık bir risk olarak yazıldı ve §8 7g teyidine dayanılıyor.
- MXToolbox'ın ekran metni ("SMTP Open Relay") biz koşmadan yazıldı, çünkü bölge henüz yok. İlk koşuda metin farklı çıkarsa belge düzeltilmeli.
- Pozitif kontrolde RCPT `250` metni ölçülemedi, çünkü fonbridge.com'da henüz kutu yok. Metin "`250 …` (genelde `250 Accepted`)" diye yumuşak yazıldı.
- **Kapsam dışı gözlem:** `info@usfinbridge.com` ve `postmaster@usfinbridge.com` bu sunucuda "No Such User Here" dönüyor. Oysa §9 "`info@usfinbridge.com` kutusu açık kalabilir" diyor. Kutu hiç yok ya da başka bir yere yönlendiriliyor olabilir. usfinbridge.com'un MX'i `0 usfinbridge.com.`. Uygulama postası için önemsiz; §9'a dokunmadım.

## 5. Açık sorular
- S-1 (ayrı gönderim kutusu) hâlâ patronda. Belge artık iki seçeneğe de uyuyor.

## 6. Sonraki adım
- Yeniden inceleme (İNCELEME-46'nın kapanışı): B-1/B-2/Y-1…Y-4/N-1 ve N-2'nin geri alınışı.
- Canlı kurulum başlayınca: önce §7.0 adım 7-ön, sonra (d), sonra a/b/c.

## Platform beyanı
Doğrulama **mac** üzerinde yapıldı (Darwin 27, BSD `nc`, swaks 20240103.0, `dig`). Hedef platform **Linux** (uygulama
VPS'i) ve orada **koşulamadı**, çünkü VPS yok. Linux'taki davranış belgeden yazıldı: OpenBSD `nc`'de `-w` bağlantı kurma
süresini de sınırlar, RHEL `ncat` `Ncat: Connected to`/`Ncat: TIMEOUT.` yazar. mac'e özgü fark (`-w` connect'i sınırlamaz,
`-G` gerekir) ölçüldü ve belgeye yazıldı. **Windows koşulamadı:** işletim yolu (Vulut Linux + cPanel) Windows içermiyor.
Komutlar WSL'de Linux gibi çalışır. Bu ofis ağından 25/tcp kapalı olduğu için relay testinin 25 kolu burada da koşulamadı.
Belgenin yeni ön kontrolü tam olarak bu durumu yakalıyor.
