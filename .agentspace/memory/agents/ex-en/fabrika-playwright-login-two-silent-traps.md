---
name: fabrika-playwright-login-two-silent-traps
description: Fabrika'da Playwright ile giriş sessizce başarısız olur — çerez onayı tam ekran overlay tıklamayı yutar, ve hidrasyon bitmeden basılan submit formu düz GET'e çevirir; ikisinin de çözümü burada
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Fabrika'da tarayıcı sürücüsü yazarken giriş adımı **hata vermeden** takılır. İki ayrı sebep:

**1. Çerez onay modalı.** `src/components/CookieConsent.tsx` `fixed inset-0 z-50` bir
overlay basar; her tıklamayı yutar. Context açılışında ön-kabul et:

```js
await ctx.addInitScript(() => {
  localStorage.setItem('fabrika_cookie_consent',
    JSON.stringify({ necessary: true, analytics: true, at: Date.now() }));
});
```

**2. Hidrasyon yarışı.** `login/AuthCard.tsx`'in `handleSubmit`'i React'in;
`e.preventDefault()` + server action. Bundle bağlanmadan `button[type="submit"]`'e
basarsan `<form>` **düz GET** yapar, sayfa `/tr/login?` olarak yeniden yüklenir ve
`waitForURL` 60 sn boyunca boşuna bekler. Dev sunucu logunda tek ipucu şu satırdır:
`GET /tr/login? 200`. Çözüm: `waitUntil:'load'` + `networkidle` + ~2.5 sn bekle,
sonra tıkla, navigasyon olmazsa **tekrar dene** (3 deneme).

Ek iki nokta:
- Giriş sonrası `alice@fabrika.test` **`/tr/default/dashboard`**'a düşer (`main` değil).
  `waitForURL(/\/tr\//)` gibi bir desen yerine "URL artık `/login` içermiyor" bekle.
- `/calls` arama kutusunu `input[type="text"]` ile seçme — sayfada başka text input var;
  `getByPlaceholder(/Anahtar kelime/)` kullan. Yanlış kutuya yazarsan kayıt sessizce
  `"Tüm Arama"` fallback adıyla oluşur ve kanıtın zayıflar.

Bağlantılı: [[fabrika-playwright-webserver-probe-blocks-e2e]]
