---
gorev: TASK-MUPIR7Y1P7AH4
ajan: devop-fb
sprint: FB-GAP-1
hüküm: KISMEN TAMAM. Kod ve belge tarafı bitti; adresin posta alıp almadığı patronun panel kontrolüne bağlı.
tip: bug (yanlış varsayılan adres) + altyapı ölçümü
platform: mac (macOS 27.0.1, Darwin 27.0.0). Değişiklik platformdan bağımsız (sabit metin + test); Windows/Linux'ta davranış aynı, orada koşulmadı
dal: devop-fb/p9-support-address @ 95ae554d (dev 629cc071 üstünde, push/merge YOK)
tarih: 2026-10-01
---

# TASK-MUPIR7Y1P7AH4: P-9 destek adresi `info@fonbridge.com`'a taşındı

## 1. Ne yapıldı

**Kod (tek kaynak):** `src/lib/beta/constants.ts:49-50` içindeki `BETA_SUPPORT_EMAIL` ve `BETA_FEEDBACK_EMAIL`
varsayılanları artık `info@fonbridge.com`. Önceki değerler `support@fabrika.dev` ve `feedback@fabrika.dev` idi.
Bunları ezen ortam değişkenleri aynı şekilde çalışmaya devam ediyor. Varsayılanı kullanan yerler:

- `invite-email.ts`: destek satırı + altbilgi
- `pricing-survey-email.ts` ve `esr-survey.ts`: altbilgi
- `scripts/beta-onboarding.ts`: `.ics` ORGANIZER alanı ve `SMTP_FROM` boşken gönderen adresi
- `scripts/esr-calibration.ts` ve `scripts/beta-pricing-survey.ts`: `SMTP_FROM` boşken gönderen adresi

**Testler:**
- `tests/beta/invite-email.test.ts`: beklenen adres `info@fonbridge.com` oldu. Yeni bir test eklendi:
  `vi.stubEnv(…, undefined)` + `resetModules` ile ortam değişkenleri boşken **iki varsayılanı ayrı ayrı** kontrol ediyor.
  Neden gerekli: iki adres artık aynı değer. Bu yüzden render testi `BETA_FEEDBACK_EMAIL`'in eski adrese dönmesini fark etmiyordu (mutant aşağıda).
- `tests/beta/checkin-schedule.test.ts`: test girdisi olan `organizerEmail` değeri yeni adrese çekildi (tutarlılık için).
- Snapshot etkilenmedi: `tests/__snapshots__/prompt-snapshots.test.ts.snap` içinde `fabrika` geçmiyor.

**Belgeler:**
- `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md`: destek adresleri tablosu güncellendi.
- `.env.example:176-177`: yorum satırındaki örnek değerler güncellendi.
- `docs/RELEASE_CHECKLIST.md` §2.2 satırı: "EKSİK (varsayılan düzeltilmeli, ayrı kart)" yerine artık "HAZIR (kod) / PATRON (kutu)" yazıyor.
- `docs/legal/privacy-notice-gap-analysis.md` madde 3: tarih notu eklendi.

**Bilerek DOKUNULMAYANLAR:**

| Yer | Neden |
|---|---|
| `src/lib/beta/checkin-schedule.ts:159` → `uid: fabrika-beta-checkin-w${n}@fabrika.dev` | Bu bir **posta adresi değil, iCalendar UID'si**. Değiştirilirse daha önce gönderilmiş takvim davetleri takvim uygulamalarında **yeni etkinlik** sayılır ve aynı görüşme çift görünür. Marka temizliğinde ayrı karar gerekiyor. |
| `tests/beta/roster.test.ts:74` → `a@fabrika.dev` | Bu satır "yer tutucu e-posta değil" kontrolünü test ediyor; destek adresiyle ilgisi yok. |
| `docs/BETA_DATA/generated/**` (`.ics`, davet, anket metinleri, ~160 dosya) | `.gitignore:51` kapsamında, repoda yok. Yalnız ana checkout'ta duruyor ve eski adresi taşıyor. Betikler (`beta-onboarding`, `esr-calibration`, `beta-pricing-survey`) yeniden koşunca yeni adresle üretilir. Bu iş gönderim içerdiği için koşmadım. |
| `docs/agent-results/**` | Geçmiş raporlar; tarihsel kayıt olarak kalıyor. |
| Betiklerdeki `Fabrika Beta <…>` gönderen görünen adı | Adres değil, marka metni. Kart kapsamı dışında (aşağıda açık soru). |

## 2. Kanıt (kopyalanmış çıktı)

**Taramalar:**
```
$ /usr/bin/grep -rn "fabrika\.dev" src docs   (agent-results ve BETA_DATA/generated hariç; değişiklik ÖNCESİ)
src/lib/beta/constants.ts:49-50     support@ / feedback@fabrika.dev
src/lib/beta/checkin-schedule.ts:159  uid …@fabrika.dev
docs/BETA_GUIDE(.en).md, docs/RELEASE_CHECKLIST.md:81, docs/legal/privacy-notice-gap-analysis.md:247
(+ tests/beta/{checkin-schedule,invite-email,roster}.test.ts, .env.example:176-177)

$ /usr/bin/grep -rn "(support|feedback)@fabrika\.dev" src tests .env.example   (değişiklik SONRASI)
(çıktı yok)
```

**Kapılar** (worktree `FONBRIDGE-wt-devopfb-p9`, HEAD 95ae554d):
```
npx tsc --noEmit                        → TSC=0
npm run lint (tam repo)                 → LINT_FULL_EXIT=0
npm run i18n:check                      → ✅ i18n check passed … I18N_EXIT=0
npx vitest run tests/beta tests/esr-calibration.test.ts tests/app-url-self-links.test.ts
 Test Files  9 passed (9)
      Tests  167 passed (167)
```

**Mutant kontrolü** (testlerin değişikliği gerçekten yakaladığını göstermek için):
```
M1: BETA_SUPPORT_EMAIL ?? 'support@fabrika.dev' (eski değere dönüş)
 FAIL  invite-email.test.ts > covers every brief section in tr
 FAIL  invite-email.test.ts > covers every brief section in en
      Tests  2 failed | 94 passed (96)                         → ÖLDÜ
M2: BETA_FEEDBACK_EMAIL ?? 'feedback@fabrika.dev' (yeni test eklendikten sonra)
 FAIL  invite-email.test.ts > beta contact defaults > fall back to info@fonbridge.com when the env vars are unset
      Tests  1 failed | 6 passed (7)                           → ÖLDÜ
(M2 yeni test olmadan yaşıyordu. Her iki mutant geri alındı, `git diff` yalnız hedef değişikliği gösteriyor.)
```

**Alan adı / DNS** (salt-okur `dig`; 1.1.1.1, 8.8.8.8 ve yetkili NS 77.92.144.187 aynı yanıtı verdi):
```
$ dig MX fonbridge.com @1.1.1.1  -> status: NOERROR
fonbridge.com.		14400	IN	MX	0 fonbridge.com.
$ dig TXT fonbridge.com @1.1.1.1  -> status: NOERROR
fonbridge.com.		14400	IN	TXT	"v=spf1 include:_spf.vulut.com -all"
$ dig TXT _dmarc.fonbridge.com @1.1.1.1  -> status: NOERROR
_dmarc.fonbridge.com.	14400	IN	TXT	"v=DMARC1; p=none;"
$ dig TXT default._domainkey.fonbridge.com @1.1.1.1  -> status: NOERROR
default._domainkey.fonbridge.com. 14400 IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsF5D…AQAB;"
  → openssl pkey: Public-Key: (2048 bit)
$ dig A fonbridge.com @1.1.1.1      -> fonbridge.com. 14400 IN A 77.92.144.187
$ dig A mail.fonbridge.com @1.1.1.1 -> mail.fonbridge.com. CNAME fonbridge.com. / A 77.92.144.187
$ dig +short TXT _spf.vulut.com     -> "v=spf1 a mx ip4:77.92.144.0/24 ip4:31.40.199.0/24 … -all"   (77.92.144.187 kapsanıyor)
$ dig +short -x 77.92.144.187       -> srv.iyisunucu.com.tr.   (PTR; ileri kayıt 77.92.144.187, yani tutarlı)
NS: ns1.iyisunucu.com.tr. / ns2.iyisunucu.com.tr.
```
Not: Bu makinenin varsayılan DNS çözücüsü (96.45.45.45) tutarsız davrandı. Aynı `MX fonbridge.com` sorgusu bir kez
kayıt döndürdü, bir kez `NXDOMAIN` döndürdü, ardından zaman aşımına uğradı. Yukarıdaki sonuçlar bu yüzden
genel çözücüler ve yetkili NS üzerinden alındı. Bu makinede `dig`'i `@1.1.1.1` ile koşmak gerekiyor.

**TLS erişimi** (OpenSSL 3.6.5; el sıkışma + `QUIT`. EHLO dışında komut YOK, RCPT/AUTH/MAIL gönderilmedi):
```
=== openssl s_client -starttls smtp -connect fonbridge.com:587
Connecting to 77.92.144.187
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN=*.fonbridge.com
Verification: OK
250 HELP
=== openssl s_client -connect fonbridge.com:465
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Peer certificate: CN=*.fonbridge.com
Verification: OK
220-srv.iyisunucu.com.tr ESMTP Exim 4.100.1 #2 Thu, 01 Oct 2026 16:20:49 +0300
--- cert (ikisi de)
subject=CN=*.fonbridge.com
issuer=C=US, O=Let's Encrypt, CN=YR2
notBefore=Sep 30 06:13:42 2026 GMT
notAfter=Dec 29 06:13:41 2026 GMT
X509v3 Subject Alternative Name: DNS:*.fonbridge.com, DNS:fonbridge.com
=== (ek) openssl s_client -starttls smtp -connect fonbridge.com:25   ← MX'in posta ALDIĞI port
CONNECTION ESTABLISHED · TLSv1.3 · CN=*.fonbridge.com · Verification: OK · 250 HELP
```

**Sonuç:** DNS tarafında posta almak için gereken her şey yayında. MX `fonbridge.com` adresine, o da 77.92.144.187'ye çıkıyor.
Bu sunucu 25, 465 ve 587 portlarında geçerli bir sertifikayla (sona erme 29.12.2026) yanıt veriyor. SPF `-all`, DKIM 2048 bit, DMARC `p=none` yayında.
`docs/SMTP-SUNUCU.md` §1/§8'de 29.09'da "NS REFUSED" olarak geçen durum artık geçerli değil.

**Doğrulanamayan tek şey:** `info@fonbridge.com` **kutusunun** (ya da bir yönlendirmenin) var olup olmadığı.
Bunu dışarıdan anlamanın yolu RCPT sorgusu veya deneme e-postası; kart ikisini de yasaklıyor. Patron panelden bakmalı (§5).

## 3. Değişen dosyalar (dal `devop-fb/p9-support-address`, commit 95ae554d)
```
 .env.example                              |  4 ++--
 docs/BETA_GUIDE.en.md                     |  4 ++--
 docs/BETA_GUIDE.md                        |  4 ++--
 docs/RELEASE_CHECKLIST.md                 |  2 +-
 docs/legal/privacy-notice-gap-analysis.md |  3 +++
 src/lib/beta/constants.ts                 |  4 ++--
 tests/beta/checkin-schedule.test.ts       |  6 +++---
 tests/beta/invite-email.test.ts           | 23 +++++++++++++++++++++--
 8 files changed, 36 insertions(+), 14 deletions(-)
```
Geri alma: `git revert 95ae554d`. Tek commit, şema/veri değişikliği yok.

## 4. Riskler
- **R-1 (yüksek, 02.10 için):** Kutu açık değilse davet e-postasındaki destek adresi geri dönen e-posta (bounce) üretir. Kod tarafı hazır, kutu doğrulanmadı (§5 adım 1–3).
- **R-2 (orta, merge sırası):** `cs-fb/pilot-sss` dalı (dev'de değil) `docs/beta/SSS-PILOT.md` dosyasını ekliyor. G2 maddesinde
  "destek adresi eski program adıyla `support@fabrika.dev` (`constants.ts:50`)" ve P-9 satırında "fabrika.dev mi, fonbridge.com mu?" yazıyor.
  Bu dal merge edilmeden önce G2/P-9 metni "karar: `info@fonbridge.com`" olarak güncellenmeli. Bu benim dalım değil, dokunmadım.
- **R-3 (düşük):** `docs/BETA_DATA/generated/` altındaki eski çıktılar (ana checkout, git dışı) hâlâ `support@fabrika.dev` içeriyor.
  Biri bu dosyaları elle gönderirse eski adres gider. Gönderimden önce betikler yeniden üretilmeli.
- **R-4 (düşük):** Destek ve geri bildirim tek kutuya düşüyor. Ayrıştırma gerekirse yalnız ortam değişkeniyle yapılabilir, kod değişmez.
- **R-5 (bilgi):** DMARC'ta `rua=` yok. `SMTP-SUNUCU.md` §8 madde 3'te `rua=mailto:dmarc@fonbridge.com` öneriliyordu; şu an rapor toplanmıyor.

## 5. Patronun Vulut cPanel'de yapacakları (sırayla; hiçbirini ben yapmadım)
1. **cPanel → E-posta → E-posta Hesapları:** listede `info@fonbridge.com` var mı bak. Yoksa **Oluştur**: alan adı `fonbridge.com`,
   kullanıcı `info`, güçlü parola (repoya ya da sohbete yazma), kota en az 1 GB (pilot ekleri için).
   *Alternatif:* Kutu açmak istemezsen **E-posta → Yönlendiriciler → Yönlendirici Ekle**: `info@fonbridge.com` → kişisel adresin.
   Uyarı: yönlendirmede gelen posta dış sunucuya aktarılır ve SPF/DMARC nedeniyle Gmail bazılarını spam'e atabilir. **Kutu öneriliyor.**
2. **Kutu varsa:** E-posta Hesapları → `info@` satırı → **Yönet**. "Gelen e-postayı al" ve "Giriş" **askıda değil** olmalı. Kota dolu olmamalı.
3. **Alım testi (senin yapacağın tek gönderim):** Kişisel Gmail'inden `info@fonbridge.com`'a "P-9 test" konulu bir e-posta at.
   **Webmail** (`https://fonbridge.com:2096` ya da cPanel → E-posta Hesapları → Webmail'e Git) üzerinden geldiğini gör.
   Gelmediyse cPanel → **Teslim Edilebilirlik İzleme / Track Delivery** ekranında o iletinin satırının ekran görüntüsünü bana ilet.
4. **E-posta Teslim Edilebilirliği (Email Deliverability) → fonbridge.com:** DKIM ve SPF "Geçerli" (yeşil) görünmeli. Ölçümüm ikisini de yayında gösteriyor; bu adım yalnız panelde onay.
   **DKIM'e dokunma**: anahtar zaten 2048 bit. Yeniden üretirsen yeni kayıt yayılana kadar imzalı posta doğrulanmaz.
5. **(İsteğe bağlı, önerilen)** Zone Editor'da `_dmarc` TXT kaydını `v=DMARC1; p=none; rua=mailto:info@fonbridge.com` yap.
   Ayrı bir `dmarc@` kutusu açarsan ona yönlendir. Haftalık DMARC raporları gelmeye başlar.
6. **Posta istemcisi kurarsan** (telefon/Outlook): yalnız **IMAP 993 SSL/TLS + SMTP 465 SSL/TLS** seç. Sunucu parolayı TLS'siz de
   kabul ediyor (`SMTP-SUNUCU.md` §6.6), bu yüzden "şifreleme yok" seçeneği parolayı açık metin gönderir.
7. Bitince haber ver. Adım 3'teki iletinin başlıklarında (Gmail'de "Orijinali göster") SPF/DKIM/DMARC = PASS olduğunu ben okurum, bir şey göndermeme gerek kalmaz.

## 6. Açık sorular
- **S-1:** Gönderilmiş `.ics` UID'leri `@fabrika.dev` ile kalsın mı? Değiştirmek yeni pilot için temiz bir yol ama gönderilmiş davetleri çiftler.
  Öneri: pilot davetleri henüz gönderilmediyse bir sonraki marka temizliğinde `@fonbridge.com` yap.
- **S-2:** Betiklerdeki gönderen görünen adı `Fabrika Beta <…>` (`SMTP_FROM` boşken) `FonBridge Beta` olsun mu? Üretimde `SMTP_FROM` doluysa görünmez.
- **S-3:** `BETA_MEETING_URL` varsayılanı hâlâ `https://meet.google.com/fabrika-beta-checkin`. Bu gerçek bir toplantı odası değil gibi görünüyor (P-7 kapsamı).

## 7. Sonraki adım
- Patron §5 adım 1–3'ü yapar. Ben adım 3'ün başlıklarını okuyup DMARC hizasını doğrularım.
- Entegrasyon sahibi `devop-fb/p9-support-address` dalını dev'e alır (push/merge bu kartta yapılmadı). Önce R-2 için cs-fb'ye SSS G2/P-9 notu iletilmeli.
- Dev bu iş sürerken `dbc9c90e`'ye ilerledi (be-fb system_scope + crw-fb T-5 merge'leri). `git merge-tree --write-tree dev devop-fb/p9-support-address` → çakışmasız (ağaç `10f98a35`); o commit'ler bu dosyalara dokunmuyor.
- Worktree `FONBRIDGE-wt-devopfb-p9` silindi, dal duruyor. Ana checkout `dev`'de kaldı, dalı değişmedi.
