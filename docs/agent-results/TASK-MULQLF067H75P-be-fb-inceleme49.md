# İNCELEME-49 (Sprint FB-GAP-1) — be-fb

**Kapsam:** iki teslim. Salt-okur inceleme yapıldı; kod ve belge değiştirilmedi, canlıya yazılmadı.

| Kart | Commit | Karar |
|---|---|---|
| TASK-MULQLF067H75P (cs-fb) — K4 outreach, ortak kartı | `d53c115b` | **ONAY** (kod). 3 düşük bulgu + 1 nit. Kart `done`'a geçmeden önce e2e koşumu (kareler) şart. |
| TASK-MUN2PKA5AG2IV (devop-fb) — SMTP runbook, İNCELEME-46 düzeltmeleri | `6f9a043f` | **ONAY**. B-1 ve B-2 kapandı. 1 düşük bulgu + 1 nit. |

---

## 1) TASK-MULQLF067H75P — K4 outreach (cs-fb) → ONAY

### Kontrol listesi

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| URL üretimi encode ediliyor | ✅ | Sonda (aşağıda): `Fraunhofer & Söhne #1 ?a=b` → `keywords=Fraunhofer%20%26%20S%C3%B6hne%20%231%20%3Fa%3Db`; `topic_id=…%20%26x%3D1`. Parametre enjeksiyonu yok. |
| Kişisel veri URL'ye girmiyor | ✅ | URL'ye yalnız CORDIS'ten gelen kurum adı, ülke ve konu giriyor. Kullanıcının yazdığı alanlar (kurum/çağrı/başlık) yalnız `mailto:`'ya gidiyor. `+90 (532) 123 45 67`, `0090.532.123.4567`, `5321234567`, `ali@x.com.tr` → siliniyor. |
| Dış linkler `rel="noopener noreferrer"` | ✅ (kod) | `PartnerOutreach.tsx`: `<a target="_blank" rel="noopener noreferrer">`. Çalışan bir test bunu korumuyor (Y-2). |
| Şablonlarda yer tutucular | ✅ | 6 şablonun (tr/en × davet/bilgi/takip) hepsi yalnız `{institution}`, `{callCode}`, `{projectTitle}` kullanıyor. `fillTemplate` tek geçişli, boş değer yer tutucuyu görünür bırakıyor. İmza `[Adınız Soyadınız]` elle dolduruluyor. |
| Uygulama e-posta göndermiyor | ✅ | Sunucu eylemi ya da fetch yok. Yalnız `navigator.clipboard.writeText` ve `mailto:?subject=…&body=…` var (alıcı boş). |
| Modül kapısı | ✅ | `page.tsx:37` `moduleGate('M1', locale)` → kilitliyse sorgulardan ve bileşenden ÖNCE döner. |
| tr/en | ✅ (statik) | İki katalogda aynı anahtarlar (cs-fb `i18n:check` geçti). Şablon dili UI dilinden bağımsız seçilebiliyor. |
| 390px | ⚠ statik | `grid-cols-1 sm:grid-cols-2`, `flex-wrap`, `break-all`, `min-w-0`. Canlı ölçülmedi, e2e koşulmadı. |
| Linkler doğru siteye gidiyor | ✅ | Aşağıda curl çıktısı. Ideal-ist `topic_id` süzgeci gerçekten çalışıyor. |
| 2 mutant | ✅ 2/2 kırmızı | Aşağıda. |

### Kanıt

**Birim testleri** (`npx vitest run src/modules/m1/outreach.test.ts`, m1 ağacı HEAD ile aynı):
```
      Tests  14 passed (14)
```

**Mutantlar** (her birinden sonra dosya geri yüklendi; `git diff --quiet HEAD -- src/modules/m1` → `restored`):
```
[MA withQuery: encodeURIComponent(value) → value]       Tests  3 failed | 11 passed (14)
[MB MIN_PHONE_DIGITS 9 → 20 (telefonlar sızar)]         Tests  1 failed | 13 passed (14)
```

**Sonda** (geçici vitest dosyası, koşu sonrası silindi):
```
"ACME +90 (532) 123 45 67" -> "ACME"
"ACME 0090.532.123.4567" -> "ACME"
"ACME ali@x.com.tr" -> "ACME"
"ACME ali [at] x.com" -> "ACME ali [at] x.com"
"ACME 5321234567" -> "ACME"
EL Hydrogen EL                 ← Y-1
UK Hydrogen United Kingdom
TR Hydrogen Türkiye
https://ec.europa.eu/…/partner-search?keywords=Fraunhofer%20%26%20S%C3%B6hne%20%231%20%3Fa%3Db
https://een.ec.europa.eu/partnering-opportunities
https://www.ideal-ist.eu/partner-search?topic_id=HORIZON-CL4-2025-01%20%26x%3D1
https://greenet-partner-search-tool.b2match.io/
https://www.linkedin.com/search/results/companies/?keywords=Fraunhofer%20%26%20S%C3%B6hne%20%231%20%3Fa%3Db
```

**Canlı linkler** (30.09, curl + Chrome UA, `-L`):
```
200 https://ec.europa.eu/…/how-to-participate/partner-search?keywords=Fraunhofer      <title>EU Funding & Tenders Portal
200 https://een.ec.europa.eu/partnering-opportunities                                <title>Partnering opportunities | Enterprise Europe Network
200 https://www.ideal-ist.eu/partner-search                                          <title>Partner search | Ideal-ist
200 https://greenet-partner-search-tool.b2match.io/                                  <title>GREENET Partner Search Tool - Info
200 https://www.linkedin.com/uas/login?session_redirect=%2Fsearch%2Fresults%2Fcompanies%2F%3Fkeywords%3DFraunhofer…
```
Ideal-ist süzgeci:
```
(süzgeçsiz)                    rows=101
?topic_id=zzzz                 rows=0
?topic_id=HORIZON-CL4          rows=101
?topic_id=HORIZON-CL4-2025-01  rows=0   ve form alanı: name="topic_id" value="HORIZON-CL4-2025-01"
```
F&T ön doldurmasını kendim yeniden üretemedim. Headless Chrome `--dump-dom` 20 sn sanal sürede SPA'yı render etmedi. Sayfa ve host doğru; ön doldurma iddiası cs-fb'nin headless ölçümüne dayanıyor.

**CORDIS ülke kodu** (yerel DB, `BEGIN READ ONLY`):
```
[ { country: 'EL', n: 1 }, { country: 'UK', n: 4 } ]
```

### Bulgular

**Y-1 (Düşük) — Yunanistan kurumlarında ülke adı `EL` olarak kalıyor.** CORDIS, Yunanistan'ı `EL` olarak saklıyor (yerel DB'de 1 kayıt). `Intl.DisplayNames('en').of('EL')` → `"EL"` döner, dolayısıyla EEN/GREENET kopyalama metni `Hydrogen EL` oluyor. `UK` şans eseri çalışıyor (`United Kingdom`). Repoda eşlemenin hazırı var: `src/lib/k3-topic-stats/horizonDashboard.ts:188-189` (`EL→GR`, `UK→GB`). `countryName()` bunu kullanmalı, bir de test eklenmeli. URL'ye giden bir şey değil; yalnız kopyalama metnini etkiliyor.

**Y-2 (Düşük) — UI sözleşmesi yalnız koşulmamış e2e'de korunuyor.** `target="_blank"`, `rel="noopener noreferrer"`, `window.opener === null` ve `mailto` href'inin sayfada kullanılması yalnız `tests/e2e/m1-partner-outreach.spec.ts`'te test ediliyor. Bu spec R8 guard yüzünden koşulmadı. Bugün `rel`'i silen bir mutant hiçbir koşulan testte kırmızı olmaz. Kart `done`'a geçmeden önce cs-fb raporundaki kullanıcı komutuyla e2e koşulmalı, kareler de rapora eklenmeli. 390px de ancak bu koşumla kanıtlanmış olur.

**Y-3 (Düşük) — "Kopyalandı" durumu hiç sıfırlanmıyor.** `CopyButton` bir kez `copied` olunca, alanlar değişse de düğme "Kopyalandı" göstermeye devam ediyor. Kullanıcı metni değiştirip yeniden kopyalamadığı halde güncel metnin panoda olduğunu sanabilir. Öneri: 2 sn sonra `idle`'a dön, ya da `text` değişince sıfırla.

**N-1 (Nit)** — Ülke adı istemci bileşeninde `Intl.DisplayNames` ile hem SSR'da (Node ICU: `Türkiye`) hem tarayıcıda hesaplanıyor. Eski ICU'lu bir tarayıcı `Turkey` döndürürse hidrasyon uyuşmazlığı uyarısı çıkar. Zararsız. İstenirse `searchText` sunucuda hesaplanıp prop olarak verilebilir.

Not (bulgu değil): Gizlenmiş e-posta (`ali [at] x.com`) silinmiyor. Kaynak CORDIS kurum adı, serbest metin değil; kabul edilebilir.

---

## 2) TASK-MUN2PKA5AG2IV — SMTP runbook, İNCELEME-46 düzeltmeleri (devop-fb) → ONAY

### B-1 / B-2 kapanış kontrolü

| İNCELEME-46 | Düzeltme (`docs/SMTP-SUNUCU.md`) | Sonuç |
|---|---|---|
| **B-1** 25 ön kontrolü + alternatifler | §7.0 adım **7-ön**: `nc -vz -w 5 mail.fonbridge.com 25` (Linux) / `nc -vz -G 5 …` (mac); AÇIK/KAPALI çıktıları; alternatifler (i) başka makine, (ii) MXToolbox, (iii) §8 7a biletine geçici 25 sorusu, (iv) yalnız (c) → madde 15 "kısmi". Madde 15 ve §8 7a da buna göre güncellendi. | ✅ kapandı |
| **B-2** pozitif kontrolde gönderici | §7.0 adım 7 **(d)**: `swaks … --port 25 --quit-after RCPT --from info@fonbridge.com --to info@fonbridge.com`. `probe@example.org` ile ve var olmayan yerel göndericiyle 550 alınacağı açıkça yazıldı. 220/550 teşhis tablosu eklendi. Madde 15 "(d) 250 olmadan a/b 5xx'i okunmaz" diyor. | ✅ kapandı |
| Y-1…Y-4, N-1 | OpenSSL 3 DKIM metni, `<**`/`<~*`, S-1 ifadesi (§5, §8.6), §7.0 başlığı, `7b→7-web` | ✅ hepsi uygulanmış |
| N-2 (mac `nc -w`) | devop-fb İNCELEME-46'nın N-2'sini **düzeltti**: mac `nc -w` bağlantıyı sınırlamıyor. Bu doğru, aşağıda benim ölçümüm var. İNCELEME-46'daki "5,02 sn" ölçümü yanlıştı. | ✅ |

### Kanıt (salt-okur; ileti yok, AUTH yok)

**Linux — Debian stable-slim konteyneri, netcat-openbsd** (bu ağda dışarı 25 kapalı, yani KAPALI kolu gerçek):
```
nc: connect to 77.92.144.187 port 25 (tcp) timed out: Operation now in progress
rc=1 5s
Connection to 77.92.144.187 465 port [tcp/*] succeeded!
rc=0
```
Runbook'taki AÇIK (`… succeeded!`) ve KAPALI (`… timed out`, ~5 sn) beklentileri doğru. Konteynerde services DB olmadığı için `[tcp/*]` görünüyor; VPS'te `[tcp/smtp]` olur.

**mac (Darwin 27.0.1, BSD nc):**
```
nc -vz -w 5        77.92.144.187 25  → connectx … failed: Operation timed out      75 s   (runbook'taki "~75 sn" doğru)
nc -vz -G 5        77.92.144.187 25  → connectx … failed: Operation timed out       5 s   (7-ön'deki mac biçimi doğru)
nc -vz -w 5 -G 5   77.92.144.187 25  → nc: timeout cannot be negative               0 s  rc=1   ← Y-1
nc -vz -G 5 -w 5   77.92.144.187 25  → nc: invalid tcp connection timeout           0 s  rc=1   ← Y-1
nc -vz -w 5 -G 5   77.92.144.187 465 → Connection to … port 465 [tcp/urd] succeeded! rc=0
printf 'QUIT\r\n' | nc -G 5 -w 5 77.92.144.187 25 → rc=1 5s   (§6.6 a biçimi, -z yok: doğru çalışıyor)
```

**Pozitif kontrolün karşılama satırı** (`swaks --quit-after CONNECT`, 587; runbook'taki beklenen metinle aynı):
```
<-  220-srv.iyisunucu.com.tr ESMTP Exim 4.100.1 #2 Wed, 30 Sep 2026 00:33:45 +0300
```
(d)'nin RCPT'ye `250` beklentisi ölçülemedi, çünkü bölge ve `info@` kutusu yok ve 25 bu ağdan kapalı. Runbook da bunu "ölçülemedi" diye dürüstçe yazıyor. cPanel Exim varsayılanı kimliksiz yerel→yerel teslimi kabul eder (SPF ret varsayılan kapalı), yani beklenti makul.

**MXToolbox:**
```
200 https://mxtoolbox.com/diagnostic.aspx   <title> … Open Relay Test and verify the server has a reverse DNS (PTR) rec…
```
Adres var ve açık relay testi yapıyor.

### Bulgular

**Y-1 (Düşük) — §6.1 notu (satır 235) "mac'te -G 5 ekle" diyor. Ama `-z` ile `-w` ve `-G` birlikte verilince mac nc kapalı portta ölçüm yapmıyor.** Satır 237-238'deki `nc -vz -w 5 …` komutlarına `-G 5` eklenirse, tam da önemli olan durumda (port kapalı) 0 sn'de `nc: timeout cannot be negative` ya da `invalid tcp connection timeout` çıkıyor. Açık portta çalışıyor. Yanlış pozitif üretmiyor (rc=1, "succeeded" yok), ama "timed out" da yazmıyor. Operatör bunu komut hatası sanabilir. Düzeltme: "mac'te `-w 5` yerine `-G 5` yaz". 7-ön (satır 369) bunu zaten doğru yapıyor. §6.6(a) (satır 312) `-z` kullanmadığı için etkilenmiyor (ölçüldü: rc=1, 5 sn).

**N-1 (Nit)** — 7-ön'ün KAPALI listesinde `Connection refused` / `No route to host` yok. Sağlayıcı paketi düşürmek yerine RST ya da ICMP ile reddederse bu satırlar görülür, anlamı da "KAPALI"dır. Tek bir "başarısız her çıktı = KAPALI" cümlesi yeter.

---

## Değişen dosyalar
- `docs/agent-results/TASK-MULQLF067H75P-be-fb-inceleme49.md` (bu rapor). Başka dosyaya dokunulmadı. Mutant ve sonda dosyaları geri yüklendi ya da silindi. Ağaçtaki başka ajanlara ait commit'lenmemiş `src/modules/m11/*` değişikliklerine dokunulmadı.

## Riskler
- K4'te tarayıcı kanıtı hâlâ yok (Y-2). Kod incelemesi ve birim testleri sağlam, ama `rel`/390px/pano davranışı gerçek tıklamayla görülmedi.
- SMTP madde 15, bölge açılıp 25 bir yerden ölçülene kadar "kısmi" kalabilir. Runbook bunu açıkça yazıyor.

## Açık sorular
- Yok.

## Sonraki adım
1. Kullanıcı cs-fb raporundaki e2e komutunu koşar (`! cd /Users/macbook/alan/FONBRIDGE && E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/m1-partner-outreach.spec.ts`), kareler rapora eklenir, sonra K4 `done`.
2. cs-fb: Y-1 (`EL→GR` eşlemesini yeniden kullan + test) ve Y-3 (küçük, tek dosya). İsteğe bağlı: N-1.
3. devop-fb: SMTP Y-1 (satır 235 ifadesi) ve N-1, iki satırlık belge düzeltmesi. Yeni inceleme gerektirmez.

## Platform beyanı
- İnceleme **macOS** (Darwin 27.0.1, zsh, Node 26.5) üzerinde yapıldı: vitest, mutantlar, sonda, curl, swaks, BSD nc.
- SMTP komutlarının **Linux** kolu Docker'daki Debian stable-slim (netcat-openbsd) konteynerinde koşuldu. Hedef VPS'in kendisinde koşulmadı, çünkü erişim yok ve bölge henüz açılmadı.
- K4 kodu platforma bağlı değil (saf URL üretimi, tarayıcı pano API'si, `mailto:`). `mailto:` davranışı işletim sisteminin varsayılan istemcisine bağlı; "Metni kopyala" her platformda çalışır. **Windows'ta koşulamadı**, çünkü bu makinede Windows yok.
