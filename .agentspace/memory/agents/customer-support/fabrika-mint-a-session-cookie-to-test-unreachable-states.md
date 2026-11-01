---
name: fabrika-mint-a-session-cookie-to-test-unreachable-states
description: Fabrika'da adsız/rolsüz oturum credentials girişiyle ÜRETİLEMEZ — session çerezini uygulamanın kendi AUTH_SECRET'ıyla üretip gerçek tarayıcıya koy, giriş koduna dokunma
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Fabrika'nın credentials sağlayıcısı (`src/lib/auth.ts`, `authorize`) e-postadan HER ZAMAN bir ad
türetir (`computedName`) ve `name: user.name || computedName` döner. Bu yüzden "adı olmayan
kullanıcı" durumu normal giriş yoluyla asla oluşmaz — yalnız OAuth'ta oluşur. Aynı şekilde rolsüz
oturum ancak üyeliği olmayan bir kullanıcıda çıkar.

Bu tür bir durumu GERÇEK tarayıcıda doğrulamak gerektiğinde giriş mantığını değiştirme (yasak ve
gereksiz): session çerezini uygulamanın kendi secret'ıyla üret. Auth.js v5, JWT stratejisi:

```ts
import { encode } from 'next-auth/jwt';
const COOKIE = 'authjs.session-token';           // http'de __Secure- öneki YOK
const value = await encode({
  token: { sub: id, id, email, tenantId: 'demo-tenant', role: 'PIPELINE_MANAGER' },
  secret: process.env.AUTH_SECRET, salt: COOKIE, maxAge: 3600,
});
await page.context().addCookies([{ name: COOKIE, value, url: 'http://localhost:3000' }]);
```

İki tuzak:
1. `token.tenantId` MUTLAKA doldur. `jwt` callback'i `!token.tenantId` ise DB'den kullanıcıyı çekip
   `token.name`'i geri doldurur — adsızlık senaryon sessizce bozulur.
2. E-postayı `DEMO_PROFILES` dışından seç; o listedeki e-postalar için callback adı zorla ezer.

Playwright'ta `page.locator('header')` iki sonuç döner (mobil + masaüstü çerçeve); masaüstü
viewport'ta ilki GİZLİDİR ve `toBeVisible()` çakar. `header:visible` kullan.

HTML kaynağında dizge arama ile "bu metin ekranda yok" KANITLANMAZ: `NextIntlClientProvider`
tüm `messages` nesnesini RSC yüküne serileştirir, yani her çeviri anahtarı sayfa kaynağında geçer.
Görünürlük iddiası için `page.locator('body').innerText()` kullan.

İlgili: [[fabrika-honest-fallback-over-invented-identity]]
