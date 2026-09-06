---
name: fabrika-lighthouse-a11y-two-recurring-defects
description: Fabrika'da Lighthouse a11y'yi 95 altında tutan iki yapısal kusur — html lang eksikliği ve karanlık temada bg-accent üstü beyaz metin
metadata:
  type: project
  updatedAt: 2026-09-06
---

Herhangi bir Fabrika sayfasında Lighthouse accessibility skoru ~91'de takılıyorsa sebep büyük olasılıkla sayfanın
kendisi değil, bu **iki uygulama geneli kusur**. İkisi de 2026-09-06'da düzeltildi; regresyon olarak geri gelebilir.

## 1. `<html>` üzerinde `lang` yok (`html-has-lang`)

`<html>` `src/app/layout.tsx`'te, yani `[locale]` segmentinin **üstünde**; route parametresinden locale okunamıyor.
Çözüm: kök layout `async` olur ve `getLocale()` (`next-intl/server`) ile locale'i istekten okur:

```tsx
const locale = await getLocale();
return <html lang={locale} suppressHydrationWarning>
```

## 2. Karanlık temada `bg-accent` + `text-white` = 3.68:1 (WCAG AA 4.5:1 ister)

Karanlık tema `--accent: #0891B2`; beyaz metinle kontrastı 3.68. Açık tema (`#0369A1`, 6.4:1) sorunsuz —
yani hata yalnız karanlık temada görünür.

`src/app/globals.css`'te **`--accent-strong`** token'ı var (açık `#0369A1`, karanlık `#0E7490` → 5.36:1).
Beyaz metin taşıyan **dolu** butonlarda `bg-accent` değil **`bg-accent-strong`** kullan. `--accent` kenarlık,
ikon ve `accent-light` zeminler için hâlâ doğru.

## Bonus: relative canonical SEO'yu düşürür

`alternates.canonical: '/tr/privacy'` gibi göreli yol Lighthouse SEO'da "not an absolute URL" ile düşer.
Kök layout'ta `metadataBase` tanımlı (`env.NEXT_PUBLIC_APP_URL`, `process.env` değil) — göreli yollar artık
mutlak URL'e çözülüyor. Yeni bir metadata yazarken `metadataBase`'i bozma.

Ölçüm komutu (dev sunucu ayaktayken):
`lighthouse http://localhost:3000/tr/privacy --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=<yol> --chrome-flags="--headless=new --no-sandbox" --quiet`
