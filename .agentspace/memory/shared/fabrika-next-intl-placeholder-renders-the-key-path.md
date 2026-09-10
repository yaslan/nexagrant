---
name: fabrika-next-intl-placeholder-renders-the-key-path
description: next-intl'de `{brand}` taşıyan bir dizeye değer geçirilmezse sayfa 200 döner ama metin yerine ANAHTAR YOLU basar — artık pnpm i18n:check'in Check 5'i "hiç argüman yok" alt-sınıfını statik yakalıyor; kısmi eksik argüman hâlâ yalnız render/e2e ile görülür
metadata:
  type: project
  updatedAt: 2026-09-10
---

Kusurun şekli (TASK-MTVDQPG9V5WVY): katalogda yer tutucu var, çağıran `t('key')` diyor.
next-intl 4.14.2 `FORMATTING_ERROR` üretir ve **mesaj yerine anahtarın kendisini** basar.

Sonuç sessizdir ve bu yüzden tehlikelidir: sayfa **200** döner, düzen bozulmaz, hiçbir şey
fırlatılmaz — yalnız kelimeler yok olur. `/tr/privacy`'de "1. Veri Sorumlusu" başlığının altında
kullanıcı `legal.privacy.controllerBody` okuyordu; KVKK md.10 veri sorumlusu bildirimi eksik
değil, **hiç yoktu**.

**Hangi kapı görür, hangisi görmez (TASK-MTVTIU3LAYFOA'dan sonra güncel):**
- `tsc` göremez — anahtar bir string.
- `pnpm test` (vitest) göremez — sayfa mount edilmiyorsa hiçbir şey ölçülmez.
- `pnpm i18n:check` artık KISMEN görüyor: eklenen **Check 5**, katalogda `{var}` taşıyan bir
  anahtarın `t('key')` ile **hiç ikinci argüman almadan** çağrıldığı her yeri statik olarak
  yakalıyor (dosya+satır+eksik değişken adı basar) — bu görevdeki 6 çağrı yerinin hepsi bu
  şekilde yakalanabilirdi. Görmediği: ikinci argüman VAR ama içindeki anahtarlardan biri eksik
  (ör. `ModuleGate.reason.DEV_INTERNAL_ONLY`'nin `module`+`plans` geçip `brand`'i unutması) —
  bunun için çağrının obje literalinin gerçek anahtarlarını mesajın ihtiyaç duyduğu
  değişkenlerle eşleştirmek gerekir, bugün yok. ICU plural/select (`{count, plural, ...}`) de
  kapsam dışı bırakıldı (yanlış-pozitif riski).
- **Kısmi eksik argüman ve ICU biçimleri için hâlâ yalnız** gerçekten render eden bir kapı
  görür: jsdom render testi ya da e2e.

**Ölçüm tuzağı (yeni):** next-intl'in davranışını izole bir `createTranslator({ messages: {...
tek anahtar... } })` testiyle doğrulama — eksik mesaj bağlamıyla FORMATTING_ERROR'ı yutmadan
**ham `{brand}` metnini olduğu gibi basar**, hata fırlatmaz. Gerçek `getTranslations`/tam
`messages/en.json` kataloğuyla çağrıldığında ise FORMATTING_ERROR loglanır VE **anahtar yoluna**
düşer — iki davranış birbirinden FARKLI. Bu sınıftaki bir kusuru ölçerken izole probe yeterli
DEĞİL; gerçek sunucu (`pnpm dev` + curl, ya da tam kataloğu yükleyen bir `createTranslator`)
şart, yoksa "hata yok" yanlış-negatifine düşülür.

**Doğru düzeltme:** React çağıranı `t('key', { brand: PRODUCT_NAME })` der ve `PRODUCT_NAME`'i
`src/lib/brand.ts`'ten okur. `withBrand()` bunun için **değildir** — o, next-intl'e değer
geçiremeyen senkron çağıranlara (doküman dışa aktarıcı) ayrılmıştır.

**Ölçüm reçetesi (kartın istediği biçim, tekrar kullanılabilir):** sayfayı `curl` ile çek,
`<body>`den script/style çıkar, etiketleri soy, `legal\.[A-Za-z]\w*\.\w+` desenini SAY; sunucu
günlüğünde `grep -c FORMATTING_ERROR`. Öncesi/sonrası iki sayı, iddiadan iyidir.

**Kapandı (TASK-MTVTIU3LAYFOA, 2026-09-10):** `landing`, `pricing`, `Dashboard.metaDescription`,
`ModuleGate.askAdmin`, `ModuleGate.reason.DEV_INTERNAL_ONLY`, `billingPanels.admin.ssoAcsPlaceholder`
— hepsi `{ brand: PRODUCT_NAME }` ile düzeltildi ve gerçek dev server + curl ile doğrulandı.
`ModuleGate.reason.DEV_INTERNAL_ONLY` en ciddisiydi: meta tag değil, kullanıcının EKRANDA
gördüğü metindi. Repo genelinde `{var}` taşıyan 119 anahtarın tamamı tek tek tarandı; kalan
placeholder'lı anahtarların hepsi ya çalışma-zamanı değeri zaten alıyor ya da next-intl'i hiç
kullanmıyor (`DocumentExport.*`, `invoice.linePeriodFallback` → `src/lib/document-exporter.ts`
kendi `labels()`+`withBrand()` mekanizmasıyla senkron dolduruyor, next-intl dışı, ayrı bir yol).
Bkz. [[fabrika-deferred-to-another-card-is-not-fixed]] (bu kartın kendisi, artık kapalı).

İlgili: [[brand-proof-needs-a-substitution-not-a-matching-string]] · [[rename-card-fix-the-value-not-the-52-copies]]
