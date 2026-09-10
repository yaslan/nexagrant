# TASK-MTVDQPG9V5WVY — the legal pages print their text, not their key paths

**Platform beyanı:** doğrulama **macOS** (Darwin 25.6.0, arm64) üzerinde yapıldı. Değişen kod
platformdan bağımsızdır — üç React Server Component'te `t()` çağrısına interpolasyon değeri
eklendi; süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI ya da cihaz izni içeren tek satır
yok. Linux ve Windows'ta aynı davranır; **koşulmadı**, çünkü bu depoda başka platform çalıştırıcısı
yok ve render yolu Node + next-intl'e özgüdür (platforma dallanan kod yok).

## 1. Ne yapıldı

Katalogdaki `legal.*` dizeleri `{brand}` yer tutucusu taşıyor; sayfalar `t()`'yi interpolasyon
değeri **vermeden** çağırıyordu. next-intl 4.14.2 eksik değişkeni `FORMATTING_ERROR` ile
karşılıyor ve mesaj yerine **anahtarın kendisini** basıyor. Sonuç: `/tr/privacy`'de "1. Veri
Sorumlusu" başlığının altında kullanıcı `legal.privacy.controllerBody` okuyordu — KVKK md.10/1-a
veri sorumlusu kimliği eksik değil, **hiç yoktu**; altı sayfanın tarayıcı sekmesinde ve Open Graph
kartında da `legal.*.metaTitle` yazıyordu.

**Sayım (elle değil, katalogdan üretildi).** Yer tutucu taşıyan `legal.*` dizeleri: **dil başına 8**
(tr ve en birebir aynı), hepsi tek değişkenli `{brand}`:

```
legal.privacy.metaTitle · legal.privacy.metaDescription · legal.privacy.controllerBody
legal.terms.metaTitle   · legal.terms.metaDescription   · legal.terms.scopeBody
legal.dpa.metaTitle     · legal.dpa.metaDescription
```

Bu 8 anahtarın çağrı yerleri tarandı: **7'si bozuktu**, 1'i (`legal.terms.scopeBody`,
`terms/page.tsx:56`) zaten `{ brand: PRODUCT_NAME }` geçiriyordu. Yedi çağrının tamamı düzeltildi:

| Dosya | Satır | Çağrı |
|---|---|---|
| `src/app/[locale]/privacy/page.tsx` | 18, 19 | `metaTitle`, `metaDescription` |
| `src/app/[locale]/privacy/page.tsx` | 49 | `controllerBody` |
| `src/app/[locale]/terms/page.tsx` | 17, 18 | `metaTitle`, `metaDescription` |
| `src/app/[locale]/compliance/dpa/page.tsx` | 19, 20 | `metaTitle`, `metaDescription` |

`PRODUCT_NAME` `src/lib/brand.ts`'ten import edildi; hiçbir yere `'FonBridge'` literali yazılmadı.
`withBrand()` **kullanılmadı** — `brand.ts` kendi belgesinde bu yardımcıyı next-intl'e değer
geçiremeyen senkron çağıranlara (doküman dışa aktarıcı) ayırıyor ve React çağıranları için
`t('key', { brand: PRODUCT_NAME })` diyor. Yeni desen icat edilmedi. Metnin içeriğine dokunulmadı;
katalog dosyaları değiştirilmedi.

### Devralınan iddianın düzeltilmesi

Kart `/tr/terms` ve `/tr/compliance/dpa` için de gövde sızıntısı bildiriyordu; ölçtüm, **gövdede
sızıntı yok**. `terms` gövdesi zaten `brand` geçiriyordu, DPA gövdesi ise `docs/legal/dpa-*.md`
dosyalarından render ediliyor ve hiç `t()` çağırmıyor. Bu iki sayfada kusur **yalnızca**
`<title>` + meta description'daydı — yani hata gerçekti ama yeri farklıydı. Kartın "gövde düzelirken
`generateMetadata` unutulur" uyarısı tam da bu yüzden isabetliydi.

## 2. Kanıt

### (a) Düzeltme ÖNCESİ — canlı sunucu, altı sayfa, iki dil

Ölçüm: temiz `pnpm dev --port 3117`, `curl`, görünür metin = `<body>` içinden script/style
çıkarılıp etiketler soyularak elde edildi.

```
http://localhost:3117/tr/privacy
  TITLE      : legal.privacy.metaTitle
  META-DESC  : legal.privacy.metaDescription
  BODY leaks : 1  -> legal.privacy.controllerBody
  {brand} in visible text: 0
http://localhost:3117/tr/terms
  TITLE      : legal.terms.metaTitle
  META-DESC  : legal.terms.metaDescription
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/tr/compliance/dpa
  TITLE      : legal.dpa.metaTitle
  META-DESC  : legal.dpa.metaDescription
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/en/privacy
  TITLE      : legal.privacy.metaTitle
  META-DESC  : legal.privacy.metaDescription
  BODY leaks : 1  -> legal.privacy.controllerBody
  {brand} in visible text: 0
http://localhost:3117/en/terms
  TITLE      : legal.terms.metaTitle
  META-DESC  : legal.terms.metaDescription
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/en/compliance/dpa
  TITLE      : legal.dpa.metaTitle
  META-DESC  : legal.dpa.metaDescription
  BODY leaks : 0
  {brand} in visible text: 0

FORMATTING_ERROR in server log: 28
```

Sunucu günlüğünden kusurun kendi sesi:

```
Error: FORMATTING_ERROR: The intl string context variable "brand" was not provided to the string
"{brand} SaaS Platformu olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve AB Genel
Veri Koruma Tüzüğü (“GDPR”) uyarınca kişisel verilerinizin güvenliğine azami özen göstermekteyiz."
    at PrivacyPage (src/app/[locale]/privacy/page.tsx:49:46)
> 49 |     { heading: t('controllerHeading'), body: t('controllerBody') },
     |                                              ^
  code: 'FORMATTING_ERROR',
```

### (b) Düzeltme SONRASI — aynı ölçüm, aynı komut

```
http://localhost:3117/tr/privacy
  TITLE      : Gizlilik Politikası ve KVKK Aydınlatma Metni — FonBridge
  META-DESC  : FonBridge&#x27;nın KVKK ve GDPR uyumlu gizlilik politikası: işlenen veriler, işleme amaçları, saklama süreleri ve veri s
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/tr/terms
  TITLE      : Kullanım Koşulları ve Hizmet Sözleşmesi — FonBridge
  META-DESC  : FonBridge hizmetinin kapsamı, yapay zeka çıktılarına ilişkin sorumluluk reddi, abonelik ve kredi koşulları.
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/tr/compliance/dpa
  TITLE      : Veri İşleme Sözleşmesi (DPA) — FonBridge
  META-DESC  : FonBridge ile kurumsal müşteriler arasındaki KVKK/GDPR uyumlu veri işleme sözleşmesi.
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/en/privacy
  TITLE      : Privacy Policy &amp; GDPR Disclosure — FonBridge
  META-DESC  : FonBridge&#x27;s GDPR and KVKK compliant privacy policy: what we process, why, how long we keep it, and the rights you c
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/en/terms
  TITLE      : Terms of Service — FonBridge
  META-DESC  : Scope of the FonBridge service, the disclaimer covering AI-generated output, and the subscription and credit terms.
  BODY leaks : 0
  {brand} in visible text: 0
http://localhost:3117/en/compliance/dpa
  TITLE      : Data Processing Agreement (DPA) — FonBridge
  META-DESC  : The GDPR-compliant data processing agreement between FonBridge and its customers.
  BODY leaks : 0
  {brand} in visible text: 0

FORMATTING_ERROR in server log: 0
```

Sızıntı **2 → 0**, `<title>` anahtarı **6 → 0**, FORMATTING_ERROR **28 → 0**.
(`&#x27;` ve `&amp;` HTML kaçışıdır, sızıntı değil — tarayıcı `'` ve `&` olarak basar.)

### (c) Regresyon kapısı — önce KIRMIZI, sonra YEŞİL

Yeni dosya: `tests/e2e/legal-pages-no-key-leak.spec.ts` — üç sayfa × iki dil için görünür
gövdede, `<title>`'da ve meta description'da `legal.<ns>.<key>` deseni geçmemeli; ayrıca
substitüe edilmemiş `{brand}` de geçmemeli. Yedinci test gizlilik metninin veri sorumlusunu
gerçekten adlandırdığını doğrular ve beklenen adı **`brand.ts`'ten okur** (literal değil), emekli
adı (`Fabrika`) ise literal olarak yasaklanır — depodaki `tests/brand-surfaces-render.test.tsx`
kuralı budur.

**Düzeltmeden ÖNCE (kırmızı):**

```
  7 failed
    [chromium] › legal-pages-no-key-leak.spec.ts:45:11 › /tr/privacy leaks no key path and no raw placeholder
    [chromium] › legal-pages-no-key-leak.spec.ts:45:11 › /tr/terms leaks no key path and no raw placeholder
    [chromium] › legal-pages-no-key-leak.spec.ts:45:11 › /tr/compliance/dpa leaks no key path and no raw placeholder
    [chromium] › legal-pages-no-key-leak.spec.ts:45:11 › /en/privacy leaks no key path and no raw placeholder
    [chromium] › legal-pages-no-key-leak.spec.ts:45:11 › /en/terms leaks no key path and no raw placeholder
    [chromium] › legal-pages-no-key-leak.spec.ts:45:11 › /en/compliance/dpa leaks no key path and no raw placeholder
    [chromium] › legal-pages-no-key-leak.spec.ts:80:7  › the privacy notice names the controller in the reader's language
```

Kırmızının gövdesi — testin gerçekten kusuru gördüğünün kanıtı:

```
    Error: /tr/privacy must name the controller
    Expected substring: "FonBridge"
    Received string:    "Gizlilik Politikası ve KVKK Aydınlatma Metni
    1. Veri Sorumlusu·
    legal.privacy.controllerBody·
    2. İşlenen Veriler ve Toplama Amaçları·
    ...
```

**Düzeltmeden SONRA (yeşil):**

```
Running 7 tests using 1 worker
  ✓  1 › /tr/privacy leaks no key path and no raw placeholder (684ms)
  ✓  2 › /tr/terms leaks no key path and no raw placeholder (635ms)
  ✓  3 › /tr/compliance/dpa leaks no key path and no raw placeholder (716ms)
  ✓  4 › /en/privacy leaks no key path and no raw placeholder (315ms)
  ✓  5 › /en/terms leaks no key path and no raw placeholder (309ms)
  ✓  6 › /en/compliance/dpa leaks no key path and no raw placeholder (363ms)
  ✓  7 › the privacy notice names the controller in the reader's language (390ms)

  7 passed (7.1s)
```

Test gevşetilmedi: kırmızı ile yeşil **aynı** dosyadan, tek fark üç sayfadaki `t()` çağrılarıdır.

### (d) Ekran görüntüsü — `/tr/privacy` "1. Veri Sorumlusu"

`docs/agent-results/TASK-MTVDQPG9V5WVY-screenshots/`

| Kare | İçerik |
|---|---|
| `before-tr-privacy-controller.png` | Başlığın altında tek satır: `legal.privacy.controllerBody` |
| `after-tr-privacy-controller.png` | "FonBridge SaaS Platformu olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve AB Genel Veri Koruma Tüzüğü (“GDPR”) uyarınca kişisel verilerinizin güvenliğine azami özen göstermekteyiz." |
| `before-tr-privacy-full.png` / `after-tr-privacy-full.png` | Sayfanın tamamı |

### (e) Statik kapılar — üçü de temiz

```
$ pnpm lint       → eslint, çıkış 0, bulgu yok
$ pnpm typecheck  → tsc --noEmit, çıkış 0, hata yok
$ pnpm test
 Test Files  147 passed | 2 skipped (149)
      Tests  1757 passed | 8 skipped (1765)
   Duration  7.70s
```

1757 yeşil — kartın bildirdiği taban ile birebir aynı, regresyon yok.

### Ölçüm ortamı hakkında bir not (dürüstlük gereği)

Playwright'ın `webServer`'ı ana ağaçta başlatılamadı: Next 16 dizin başına tek `next dev`
kilidi tutuyor ve kardeş pane'ler bu paylaşımlı ağaçta sürekli sunucu açıyor (3121, sonra 3130
gözlendi). Kardeş süreçleri **öldürmedim**. Yabancı bir sunucuyu yeniden kullanmak da seçenek
değildi — depo bunun tuzağını zaten kaydetmiş (`reuseExistingServer: false`; bayat build + eksik
test env'i yalancı yeşil üretir). Bu yüzden e2e ve ekran görüntüleri **izole bir git worktree**
içinde, HEAD'in kopyasına karşı koşuldu; kırmızı ölçüm düzeltilmemiş HEAD'de, yeşil ölçüm aynı
worktree'ye kopyalanan düzeltilmiş üç dosyayla alındı. Worktree iş sonunda kaldırıldı.
(Turbopack `node_modules` sembolik bağını reddediyor — sabit bağ kopyası `cp -al` ile çözüldü.)

## 3. Değişen dosyalar

```
src/app/[locale]/privacy/page.tsx            (+3 −2: import + 3 çağrı)
src/app/[locale]/terms/page.tsx              (+2 −2: 2 çağrı)
src/app/[locale]/compliance/dpa/page.tsx     (+3 −2: import + 2 çağrı)
tests/e2e/legal-pages-no-key-leak.spec.ts    (yeni, regresyon kapısı)
docs/agent-results/TASK-MTVDQPG9V5WVY-screenshots/*.png  (4 kare)
docs/agent-results/TASK-MTVDQPG9V5WVY-blok-zincir-dev.md (bu rapor)
```

Katalog (`messages/*.json`), hukuki metin ve `src/lib/brand.ts` **değiştirilmedi**.

## 4. Riskler

- **Aynı kusur bu kartın dışında yaşıyor — ölçüldü, varsayım değil.** `landing`, `pricing` ve
  `Dashboard` namespace'lerindeki meta dizeleri de `{brand}` taşıyor ve çağıranları değer
  geçirmiyor. Düzeltilmiş ağaçta canlı ölçüm:

  ```
  /tr            TITLE: landing.metaTitle
  /en            TITLE: landing.metaTitle
  /tr/pricing    TITLE: pricing.metaTitle
  /en/pricing    TITLE: pricing.metaTitle
  ```

  Yani ana sayfanın tarayıcı sekmesi ve paylaşım kartı **bugün** anahtar yolu basıyor.
  `Dashboard.metaDescription` de aynı yer tutucuyu taşıyor (`src/app/[locale]/(app)/[workspace]/dashboard/page.tsx:22`)
  ama oturum arkasında olduğu için ölçmedim — katalog kanıtı var, render kanıtı yok, öyle sunuyorum.
  Bu kartın kapsamı üç yasal sayfaydı; **dokunmadım ve bu satır düzeldiğinin kanıtı değildir** —
  kapatılması için ayrı bir kart gerekiyor. Yeni e2e kapısı bu üç sayfayı koruyor, o dördünü
  **korumuyor**.
- Kapı yalnız `legal.<ns>.<key>` desenini arıyor. Tek segmentli bir anahtar (`t('foo')` → `foo`)
  sızarsa yakalamaz; desen bilerek dar tutuldu, aksi halde metnin içindeki normal noktalı
  ifadeler yanlış alarm üretirdi.
- `pnpm gate`'in tamamı (RLS ölçümleri + tüm e2e paketi) koşulmadı — paylaşımlı ağaçta dev
  sunucusu kilidi ve kardeş trafiği yüzünden. Kartın istediği üç statik kapı + yeni e2e dosyası
  koşuldu ve temiz.

## 5. Açık sorular

- Ana sayfa/fiyatlandırma/dashboard meta sızıntısı için kart açılacak mı? Açılırsa yeni e2e
  kapısını o rotalara genişletmek tek satırlık iş (`PAGES` dizisine eklemek).
- Katalogdaki `{brand}` yer tutucusunu taşıyan **her** dizeyi, çağıranının değer geçirdiğine
  karşı statik olarak eşleyen bir birim testi (render değil, kaynak taraması) istenir mi? Bu,
  kusuru e2e'ye hiç ulaşmadan yakalar; bugün böyle bir kapı yok.

## 6. Sonraki adım

Ana sayfa + fiyatlandırma + dashboard meta çağrılarını aynı biçimde düzelten bir kart aç
(4 çağrı yeri, aynı tek satırlık düzeltme, aynı kanıt biçimi) ve yeni e2e kapısını o rotalara
genişlet.
