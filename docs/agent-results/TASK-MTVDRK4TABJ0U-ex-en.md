# TASK-MTVDRK4TABJ0U — Çerez banner'ı: olmayan bir işlemenin beyanı + gömülü metin

**Ajan:** cr-en (Kod İnceleme Uzmanı) · **Tip:** bug (uyum + CLAUDE.md kural 8)
**Platform beyanı:** macOS (darwin 25.6.0, Node v26.5.0, Chromium/Playwright 1.62.1). **Windows/Linux koşulmadı** — gerekmedi: dokunulan kod yolu platforma bağlı değil (React client component + iki JSON kataloğu; süreç öldürme, dosya yolu, kabuk adı, DPI, cihaz izni yok). `localStorage`/çerez davranışı tarayıcı motoruna bağlıdır, işletim sistemine değil.

---

## 1. Ne yapıldı

### (a) ÖNCE ÖLÇÜLDÜ — §19'un "stub" hükmü devralınmadı, yeniden ölçüldü

`docs/legal/processing-register.md` §19 analitiğin bir stub olduğunu söylüyordu. Bu bir hipotezdi; bugün bir sağlayıcı bağlanmış olabilirdi. Kendi ölçümüm:

| Ölçüm | Sonuç |
|---|---|
| `src/lib/analytics.ts` gövdesi | 15 satır. `track`/`identify` yalnızca `NODE_ENV === 'development'` iken `console.log`. **Ağ çağrısı yok.** |
| Bu modülü import eden | **Hiç kimse** — `grep -rn "lib/analytics" src/` boş |
| `package.json` analitik/telemetri paketi | **Yok** (posthog, sentry, gtag, plausible, matomo, mixpanel, segment, amplitude, hotjar tarandı) |
| `NEXT_PUBLIC_POSTHOG_KEY/HOST` | `src/lib/env.ts`'te **tanımlı ama hiçbir tüketici okumuyor** |
| `document.cookie` yazan yer | **1 tek yer**: `src/components/ThemeProvider.tsx:35` → `fabrika-theme` |
| `localStorage.setItem` yazan yerler | **4**: consent, sepet (`fonbridge_cart_items_v2`), okunmuş bildirimler, tema |
| `cookies().set` (sunucu) | **Yok** |

**Hüküm doğrulandı:** analitik bugün gerçekten yok. Ne ağ çağrısı, ne paket, ne çerez, ne üçüncü taraf.

Gerçek tarayıcıda da ölçüldü — rıza verildikten *sonra* sayfa yeniden yüklendi ve ilk-taraf olmayan tüm istekler dinlendi:

```
-- THIRD-PARTY / ANALYTICS CHECK --
   non-first-party requests after consent: NONE ✅     (hem /tr hem /en)
```

### (b) Banner metni ölçülen gerçeğe göre düzeltildi

Analitik cümlesi **çıkarıldı** ("ileride ekleriz" diye bırakılmadı) ve yerine gerçekten yazılan anahtarlar yazıldı.

| | Önce | Sonra |
|---|---|---|
| TR | "Web sitesini geliştirmek ve **analitik verilerini toplama** için çerezleri kullanıyoruz. Tercihlerinizi ayarlayabilir veya" *(cümle yarıda bitiyor, "toplama" bozuk çekim)* | "Yalnızca sitenin çalışması için gereken çerezleri ve tarayıcı depolamasını kullanıyoruz: oturumunuz, dil ve tema tercihiniz, sepetiniz. **Analitik ya da üçüncü taraf takip çerezi kullanmıyoruz.** Ayrıntılar için bkz." |
| EN | "We use cookies to improve your experience and **collect analytics data**." | "We only use the cookies and browser storage the site needs to work: your session, your language and theme preference, and your cart. **We do not use analytics or third-party tracking cookies.** For details, see our" |

Not: ilk taslağım "oturum, tema, sepet" diyordu; gerçek tarayıcı ölçümü `NEXT_LOCALE` çerezini de gösterince metne **dil tercihi** eklendi. Vaat artık yazılan anahtar kümesiyle birebir.

### (c) Metin kataloğa taşındı, `isTr` kalıntısı sıfır

`legal.cookieConsent` ad alanı `messages/tr.json` + `messages/en.json`'a eklendi (5 anahtar × 2 dil). Bileşen `useTranslations('legal.cookieConsent')` çağırıyor; 7 satırlık `isTr ? … : …` bloğu tamamen silindi.

### (d) Gizlilik bağlantısı — çalışıyor

`/tr/privacy` ve `/en/privacy` → **HTTP 200** (gerçek tarayıcı navigasyonu). `href` doğru locale'i taşıyor.
**Ama hedef sayfanın gövdesi hâlâ bozuk** — ayrı kart TASK-MTVDQPG9V5WVY (blok-zincir-dev) kapsamı, dokunulmadı. Bu karta engel değil; aşağıda "Riskler"de raporlanmıştır.

### (e) Aynı sınıftan başka fazla beyanlar — DÜZELTİLMEDİ, ADIYLA BİLDİRİLİYOR

Bkz. §4 "Riskler / bildirilen bulgular" — 3 bulgu.

---

## 2. Kanıt (kopyalanmış çıktı)

### Gerçek tarayıcı, gerçek tıklama (Playwright + Chromium, headed)

```
========================================================================
  LOCALE: /tr
========================================================================
-- BANNER TEXT (rendered) --
title      : Çerez Tercihleri
description: Yalnızca sitenin çalışması için gereken çerezleri ve tarayıcı depolamasını
             kullanıyoruz: oturumunuz, dil ve tema tercihiniz, sepetiniz. Analitik ya da
             üçüncü taraf takip çerezi kullanmıyoruz. Ayrıntılar için bkz. Gizlilik Bildirimi
link label : Gizlilik Bildirimi
link href  : /tr/privacy
-- BUTTONS --
   "Gerekli Çerezler"  aria-label="Gerekli Çerezler"
   "Tümünü Kabul Et"  aria-label="Tümünü Kabul Et"

-- STORAGE *BEFORE* ACCEPT --
{ "localStorage": { "fonbridge_cart_items_v2": "[]" },
  "sessionStorage": [], "documentCookie": "" }
   cookies: []

-- REAL CLICK: "Tümünü Kabul Et" --
   banner dismissed ✅

-- STORAGE *AFTER* ACCEPT --
{ "localStorage": {
    "fonbridge_cart_items_v2": "[]",
    "fabrika_cookie_consent": "{\"accepted\":true,\"time\":\"2026-09-10T11:10:04.069Z\",\"level\":\"all\"}"
  },
  "sessionStorage": [], "documentCookie": "" }
   cookies: []

-- THIRD-PARTY / ANALYTICS CHECK --
   non-first-party requests after consent: NONE ✅
-- PRIVACY LINK REACHABLE --
   GET /tr/privacy -> HTTP 200

========================================================================
  LOCALE: /en
========================================================================
-- BANNER TEXT (rendered) --
title      : Cookie Preferences
description: We only use the cookies and browser storage the site needs to work: your session,
             your language and theme preference, and your cart. We do not use analytics or
             third-party tracking cookies. For details, see our Privacy Policy
link href  : /en/privacy
-- BUTTONS --
   "Essential Only"  aria-label="Essential Only"
   "Accept All"  aria-label="Accept All"
-- STORAGE *BEFORE* ACCEPT --
{ "localStorage": { "fonbridge_cart_items_v2": "[]" },
  "documentCookie": "NEXT_LOCALE=en" }
   cookies: ["NEXT_LOCALE"]
-- STORAGE *AFTER* ACCEPT --
   "fabrika_cookie_consent": "{\"accepted\":true,...,\"level\":\"all\"}"
   cookies: [{"name":"NEXT_LOCALE","domain":"localhost"}]
-- THIRD-PARTY / ANALYTICS CHECK --
   non-first-party requests after consent: NONE ✅
-- PRIVACY LINK REACHABLE --
   GET /en/privacy -> HTTP 200

========================================================================
  PROMISE vs REALITY
========================================================================
keys written across both locales: ["fonbridge_cart_items_v2","fabrika_cookie_consent"]
```

**Vaat ↔ gerçek tutuyor mu?** Evet. Banner "oturum, dil ve tema tercihi, sepet; analitik/üçüncü taraf yok" diyor. Ölçülen: `fonbridge_cart_items_v2` (sepet), `fabrika_cookie_consent` (rızanın kendisi), `NEXT_LOCALE` (dil), `fabrika-theme` (tema — bu turda tema değiştirilmediği için yazılmadı, kod yolu `ThemeProvider.tsx:35`), oturum çerezi (`authjs.session-token`, giriş yapılınca). Üçüncü taraf isteği **sıfır**.

**Ekran görüntüleri** (`.../scratchpad/shots/`): `before-tr.png`, `before-en.png` (analitik cümlesi görünür) · `after-tr-banner.png`, `after-en-banner.png` (katalogdan gelen metin) · `after-tr-accepted.png`, `after-en-accepted.png`.

### `isTr` kalıntısı — bu bileşende sıfır

```
$ grep -n "isTr" src/components/CookieConsent.tsx
NONE ✅
$ grep -nE "locale\s*===\s*'tr'|\?\s*'.*'\s*:\s*'" src/components/CookieConsent.tsx
NONE ✅
```

### Katalog pariteleri ve anahtar çözümü

```
CHECK 1 — catalog parity
  tr keys: 1477   en keys: 1477
  only in tr: none        only in en: none        parity: OK
CHECK 2 — every key CookieConsent uses resolves
  namespace: legal.cookieConsent
  legal.cookieConsent.acceptAll        tr=✅ en=✅
  legal.cookieConsent.description      tr=✅ en=✅
  legal.cookieConsent.essentialOnly    tr=✅ en=✅
  legal.cookieConsent.privacyLink      tr=✅ en=✅
  legal.cookieConsent.title            tr=✅ en=✅
```

### Kapı

```
$ pnpm i18n:check
  Literals found:   325 in 37 file(s)
  Baseline allows:  325 in 37 file(s)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves,
   and no file gained hard-coded text.

$ pnpm lint       → temiz (eslint çıktısı yok)
$ pnpm typecheck  → temiz (exit 0)
$ pnpm test       → Test Files 149 passed | 2 skipped (151)
                    Tests 1795 passed | 8 skipped (1803)
```

### ⚠ Baseline "küçülmedi" — kart bu noktada YANLIŞ VARSAYIYORDU

Kart "baseline KÜÇÜLDÜ (önce/sonra sayı)" bekliyordu. Ölçülen: **önce 325/37 → sonra 325/37, DEĞİŞMEDİ.** Baseline büyütülerek geçilmedi; küçülmesi **mümkün değildi**, çünkü:

```
$ grep -n "SCAN_ROOTS" src/../scripts/i18n-hardcoded.ts
41:export const SCAN_ROOTS = ['src/app', 'src/modules'];

$ python3 -c "... 'CookieConsent' in baseline ..."
CookieConsent / src/components entries: NONE
```

`src/components/**` gate'in gömülü-metin taramasına **hiç girmiyor**. Yani `CookieConsent.tsx`'in 7 gömülü metni baseline'da hiç sayılmamıştı; borç ödendi ama sayaç zaten bu dosyayı görmüyordu. Bu, kartın bir hatası değil — **gate'in kör noktasıdır** ve kusurun yeşil kapı altında nasıl hayatta kaldığının cevabıdır (§4/R-1).

---

## 3. Değişen dosyalar

| Dosya | Değişim |
|---|---|
| `src/components/CookieConsent.tsx` | +10 / −18: `useTranslations` eklendi, 7 satırlık `isTr` bloğu silindi, 8 kullanım `t()`'ye bağlandı |
| `messages/tr.json` | `legal.cookieConsent` (5 anahtar) |
| `messages/en.json` | `legal.cookieConsent` (5 anahtar) |

Davranış değişmedi: görünürlük mantığı, hidrasyon koruması (`useIsHydrated`), `localStorage` yazma şekli ve buton `onClick`'leri aynı. E2E testleri banner metnini iddia etmiyor (rıza anahtarını tohumlayıp banner'ı atlıyorlar), bu yüzden metin değişimi test kırmıyor.

---

## 4. Riskler / bildirilen bulgular (kapsam dışı — DÜZELTİLMEDİ)

**R-1 · i18n gate'inin iki kör noktası — bu kusurun hayatta kalma sebebi (yüksek)**
1. `scripts/i18n-hardcoded.ts:41` → `SCAN_ROOTS = ['src/app', 'src/modules']`. `src/components/**` **hiç taranmıyor**. Kural 8 orada denetimsiz.
2. Taranan dosyalarda bile yalnız şu türler sayılıyor (satır 36): `jsx-text`, `attr:title|label|placeholder|aria-label`. `const title = isTr ? 'Çerez Tercihleri' : 'Cookie Preferences'` bunların hiçbiri değil → **görünmez**. Kanıt: `src/app/[locale]/page.tsx` 68 `isTr` kullanıyor ama baseline'da yalnız **4** literal ile kayıtlı.

Sonuç: `isTr ? 'TR' : 'EN'` deseni **29 dosyada** yaşıyor (`src/app/[locale]/page.tsx` 68, `evidence-client.tsx` 48, `src/lib/routes.ts` 33, `UserMenu.tsx` 28, `AuthCard.tsx` 21 …) ve kapı yeşil. Ayrı kart hak ediyor.

**R-2 · Banner etkisi olmayan bir seçim sunuyor (orta — aynı sınıftan fazla beyan)**
"Tümünü Kabul Et" ve "Gerekli Çerezler" farklı `level` değerleri (`"all"` / `"essential"`) yazıyor, ama **`level` hiçbir yerde okunmuyor**: `grep -rn "CONSENT_STORAGE_KEY" src/` yalnız yazma ve `Boolean(getItem)` varlık kontrolü gösteriyor. İki buton işlevsel olarak özdeş; kullanıcıya var olmayan bir kontrol gösteriliyor. Kart (e) gereği düzeltilmedi. *(Not: bugün her iki dal da yalnızca zorunlu depolamayla sonuçlandığı için kullanıcı yanıltılıp fazladan bir işlemeye maruz kalmıyor; kusur "vaat edilen kontrolün gerçek olmaması".)*

**R-3 · `/[locale]/privacy` gövdesi anahtar yolu basıyor (ayrı kart)**
`curl -s .../tr/privacy` → `1. Veri Sorumlusu **legal.privacy.controllerBody** 2. İşlenen Veriler…`. Çözümlenmemiş anahtar ekrana yazılıyor. TASK-MTVDQPG9V5WVY (blok-zincir-dev) kapsamı — dokunulmadı, bu kart onu beklemedi.

**R-4 · Envanterin kendi açık maddesi hâlâ güncellenmemiş görünüyor**
§19 gövdesi PostHog/Sentry'nin envanterden çıkarıldığını söylüyor, ama §22 madde 7 hâlâ "PostHog ve Sentry, DPA'nın alt işleyen listesinde ama kodda hiç bağlı değil — ya kaldırılmalı ya da entegre edilmeli" diyor. Aynı belgenin iki yeri çelişiyor. Belge kapsamım dışında, dokunulmadı.

**Paylaşımlı ağaç gürültüsü (bu kartın kusuru değil):** çalışma sırasında kardeş ajan(lar) `BillingIdentityForm.tsx` + `billing-identity-action.test.ts` ekledi; ara koşularda i18n kapısı 24 eksik `billingPanels.settings.identity*` anahtarıyla, typecheck 4 hatayla kırmızıydı, sonra kendiliğinden düzeldi. Katalog yazarken okuma-yaz yarışı kontrol edildi: kardeşin 31 `identity*` anahtarı **korundu** (`identity* keys present: 31`, iki dilde). Ayrıca `tests/withholding-rounding.test.ts` ve `invoice-writer.test.ts` tam suit yükü altında `Test timed out in 5000ms` ile düştü, **izole koşuda 33/33 geçti** — yük kaynaklı flake, bu kartla ilgisiz.

**R-5 · Bu kartın commit'i bana ait değil (provenans, düşük ama iz bırakır)**
Dört dosyam da (`CookieConsent.tsx`, `messages/tr.json`, `messages/en.json`, bu rapor)
kardeş bir ajanın geniş `git add`'i ile **`301ce22 docs(qa): the alert pile is 90% debris…`**
commit'ine karıştı. İçerik doğrulandı — `git diff HEAD` dört dosyada da boş, commit'teki
gövde benim doğruladığım gövdeyle birebir (yukarıdaki `git show HEAD:` çıktıları). Kayıp yok,
ama commit mesajı bu değişikliği anlatmıyor: çerez banner'ı düzeltmesi git geçmişinde
"alert pile" başlığı altında aranacak.

---

## 5. Açık sorular

1. **R-2 kararı:** banner tek "Anladım" butonuna mı inmeli (bugün gerçekten yalnız zorunlu depolama var, granüler rıza yalan), yoksa `level` gerçekten tüketilecek şekilde mi bağlanmalı? Uyum tarafının kararı; kod tarafı ikisine de hazır.
2. Yalnız zorunlu/işlevsel çerez kullanılırken bu banner'ın **hukuken gerekli olup olmadığı** (KVKK/ePrivacy açısından zorunlu çerezler rıza gerektirmez) — gösterilmeye devam edilecekse gerekçesi envantere yazılmalı.

---

## 6. Sonraki adım

- R-1 için kart: `SCAN_ROOTS`'a `src/components` eklensin + ternary/const literal türü tanınsın, sonra `--update-baseline` ile borç gerçek boyutuyla kaydedilsin (mevcut 325 rakamı gerçeği eksik gösteriyor).
- R-2 için uyum kararı alınsın (yukarıdaki açık soru 1).
- R-3 ayrı kartta zaten sahipli; kapandığında banner bağlantısının hedefi de düzelmiş olacak.
