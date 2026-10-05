---
name: fabrika-playwright-dogfood-recipe
description: Fabrika'da düşman-kullanıcı testi için çalışan reçetem — Playwright'ı test değil düz script olarak koş, sunucu eyleminin POST gövdesini yakala; "hiçbir şey olmuyor" şikâyetinin kök nedeni orada
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Fabrika'da gerçek tıklama testi yaparken işe yarayan kurulum (TASK-MTQU053U24RYH, M9 brief +
takvim akışı, 24 senaryo).

## Playwright'ı spec değil düz script olarak koş

`playwright.config.ts` `testDir: './tests/e2e'` diyor, oraya geçici dosya bırakmak istemiyorum.
Bunun yerine repo kökünde tek kullanımlık bir `.mjs` yaz ve `node --env-file-if-exists=.env x.mjs`
ile koş; `import { chromium } from '@playwright/test'` çalışıyor. İş bitince dosyayı sil.
Avantajı: adım adım kontrol, ekran görüntüsü yolunu kendim seçiyorum, onay tur-turu yok.

AgentSpace'in dahili tarayıcısı (`agentspace_browser`) **navigate/read/screenshot** için iyi
ama `click`/`type` kullanıcı onayı istiyor ve onay tur-turu zaman aşımına düşebiliyor
(`504: approval round-trip failed: renderer timeout`). Çok adımlı formda Playwright'a geç.

## Oturum açma

Credentials sağlayıcısı e-posta ile geçiyor, şifre gerekmiyor:

```js
// callbackUrl ZORUNLU: form başarıda `window.location.href = rawCallbackUrl` yapıyor,
// parametre yoksa giriş "başarılı" olur ama sayfa giriş ekranında kalır.
await page.goto(`${BASE}/tr/giris?callbackUrl=${encodeURIComponent(hedefUrl)}`,
                { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);   // hidratlanmadan tıklarsan submit hiç koşmaz
await page.locator('input[type="email"]').fill('owner@demo.fabrika.test');
await page.locator('form button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes('/giris'), { timeout: 60000 });
```
(`/en/` için giriş yolu `login`.) Çerez onayı için `addInitScript` ile
`localStorage.fabrika_cookie_consent` set et, yoksa `role="alertdialog"` katmanı bütün
tıklamaları yutar ve Playwright "intercepts pointer events" diye 60 sn döner. Değer JSON
olmalı: `JSON.stringify({ accepted: true, level: 'all' })`.

Şifre alanı boş bırakılabilir (`handleSubmit` `password || 'demo1234'` gönderiyor); giriş
kartındaki "hızlı demo rolleri" düğmeleri de aynı server action'ı çağırıyor.

## Asıl numara — sunucu eyleminin cevabını yakala

Fabrika'nın server action'ları `{ success, error }` dönüyor ama birkaç istemci yalnız
payload alanına (`res.brief` gibi) bakıp `success:false`'ı sessizce yutuyor. Kullanıcı
"tıklıyorum, hiçbir şey olmuyor" diyor; ekranda hiçbir ipucu yok. Cevabı ağdan oku:

```js
page.on('response', async r => {
  if (r.request().method() === 'POST') console.log(r.status(), await r.text());
});
```
M9'da bu tek satır `{"success":false,"brief":null,"error":"BRIEF_NOT_PERSISTED"}` gösterdi ve
"hiçbir şey olmuyor" biletini 10 dakikada teşhise çevirdi. Bir Fabrika formu sessiz kaldığında
**ilk yapacağım şey bu.**

Yanında `page.on('console')` + `page.on('pageerror')` + `page.on('dialog')` de bağla; dialog
handler `alert()` kullanan yerleri yakalar (M9 `handleDownloadIcs`'te vardı).

## Yan etkiyi DB'den doğrula

Ekranda "oldu" görmek yetmiyor — `pg` ile doğrudan sor: ilgili tablo + `CreditLedger` +
`AiUsageLog`. Üçü de 0 ise iş hiç olmamıştır. Probe satırı yazdıysan **temizle**.

İlgili: [[fabrika-empty-tenant-audit-needs-module-and-plan-rows]] · [[fabrika-runtime-verification-recipe]] · [[fabrika-dev-server-stale-prisma-client]] ·
[[fabrika-workspace-url-segment-is-decorative]] · [[fabrika-fabricated-fallback-antipattern]]
