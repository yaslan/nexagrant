---
name: fabrika-next-intl-placeholder-renders-the-key-path
description: next-intl'de `{brand}` taşıyan bir dizeye değer geçirilmezse sayfa 200 döner ama metin yerine ANAHTAR YOLU basar — tsc, i18n-check ve unit test göremez; tek kapı render/e2e'dir
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

**Hangi kapı görür, hangisi görmez:**
- `tsc` göremez — anahtar bir string.
- `pnpm i18n-check` göremez — anahtar paritesine ve çözünürlüğüne bakar, **render'a** bakmaz.
- `pnpm test` (vitest) göremez — sayfa mount edilmiyorsa hiçbir şey ölçülmez.
- **Yalnız** gerçekten render eden bir kapı görür: jsdom render testi ya da e2e.

**Doğru düzeltme:** React çağıranı `t('key', { brand: PRODUCT_NAME })` der ve `PRODUCT_NAME`'i
`src/lib/brand.ts`'ten okur. `withBrand()` bunun için **değildir** — o, next-intl'e değer
geçiremeyen senkron çağıranlara (doküman dışa aktarıcı) ayrılmıştır.

**Ölçüm reçetesi (kartın istediği biçim, tekrar kullanılabilir):** sayfayı `curl` ile çek,
`<body>`den script/style çıkar, etiketleri soy, `legal\.[A-Za-z]\w*\.\w+` desenini SAY; sunucu
günlüğünde `grep -c FORMATTING_ERROR`. Öncesi/sonrası iki sayı, iddiadan iyidir.

**Kapatılmamış kalan:** aynı kusur `landing`, `pricing` (ölçüldü: `/tr` sekmesi bugün
`landing.metaTitle` basıyor) ve `Dashboard` namespace'lerinde **yaşıyor**; TASK-MTVDQPG9V5WVY'nin
kapsamı üç yasal sayfaydı ve e2e kapısı da yalnız onları koruyor.
Bkz. [[fabrika-deferred-to-another-card-is-not-fixed]].

İlgili: [[brand-proof-needs-a-substitution-not-a-matching-string]] · [[rename-card-fix-the-value-not-the-52-copies]]
