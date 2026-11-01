---
name: fabrika-single-language-assertion-is-blind-to-locale-regressions
description: Bir sayfanın locale'ini test ederken tek dilde metin aramak yetmez — ÖTEKİ dilin metninin YOKLUĞUNU da iddia et, yoksa "herkese Türkçe" regresyonu paketi yeşil bırakır
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTS6MMOD8XF3A. `tests/e2e/notfound-status.spec.ts` 11 rotada 404'ü
doğruluyordu ama gövde iddiası tek satırdı:

```ts
await expect(page.getByText('Sayfa Bulunamadı')).toBeVisible();   // sadece TR, sadece /tr rotalarında
```

Bu iddia bir locale regresyonunu **göremez**. Sayfa bozulduğunda kaybolmaz — sadece herkese
varsayılan dilde (tr) gelir. `/tr` iddiası yine geçer, `/en` hiç ölçülmediği için paket yemyeşil
kalır ve İngiliz kullanıcı Türkçe 404 görür.

Locale iddiası üç parçalı olmalı:

```ts
await expect(page.locator('html')).toHaveAttribute('lang', locale);   // 1. kabuk
await expect(page.getByRole('heading', { name: title })).toBeVisible(); // 2. doğru dil VAR
await expect(page.getByText(foreignTitle)).toHaveCount(0);             // 3. öteki dil YOK  ← kritik olan bu
```
Bir de çıkış yolu: CTA `href`'i `/${locale}` olmalı, yoksa kullanıcı 404'ten öteki dilin ana
sayfasına düşer.

**Kilidin kırmızıya dönebildiğini kanıtla.** Yeşil kalan test kanıt değil. `not-found.tsx`'te
locale çözümünü geçici olarak `const locale = 'tr'` diye sabitledim → test kırmızı; geri aldım →
yeşil. Bu 60 saniyelik çürütme olmadan "korunuyor" deme
([[fabrika-a-passing-test-may-assert-nothing]]).

**Ölçüm OTURUMLU olmalı.** `src/app/not-found.tsx` `[locale]` segmentinin ÜSTÜNDE: okuyacak route
param'ı yok, dili `getLocale()` → `getRequestConfig(requestLocale)` → proxy üzerinden çözüyor.
`(app)` altındaki bir 404'ü oturumsuz ölçersen düzen seni `/giris`'e 307'ler, `notFound()` hiç
çalışmaz, ölçüm hiçbir şey kanıtlamaz ([[fabrika-notfound-200-needs-a-signed-in-measurement]]).
Ölçülecek iki AYRI 404 yolu var, ikisini de kapsa:
- `(app)` içinden `notFound()` — `/{locale}/<ws>/opportunities/<olmayan-id>/briefs`
- hiçbir rotayla eşleşmeyen yol — `/{locale}/boyle-bir-sayfa-yok`

İlgili: [[fabrika-i18n-gate-is-effectively-off]], [[fabrika-playwright-dogfood-recipe]]
