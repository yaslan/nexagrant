---
name: fabrika-playwright-webserver-probe-blocks-e2e
description: Fabrika'da pnpm test:e2e hiç koşmuyor — playwright.config hazırlık probu / (=> /tr, 500) üzerinden gidiyor, sunucuyu kapalı sanıp ikincisini açıyor ve EADDRINUSE ile ölüyor; çözüm scratch config
metadata:
  type: project
  updatedAt: 2026-09-07
---

`pnpm test:e2e` çalışan bir dev sunucusu varken bile şu hatayla ölebilir:

```
[WebServer] Error: listen EADDRINUSE: address already in use :::3000
Error: Process from config.webServer was not able to start. Exit code: 1
```

Sebep `reuseExistingServer` DEĞİL. `playwright.config.ts` hazırlık için `BASE_URL` kökünü
(`http://localhost:3000/`) yokluyor; kök `/tr`'ye 307 atıyor ve **`/tr` şu an 500 dönüyor**
([[fabrika-e2e-blocked-by-landing-page-500]]). Playwright son statüyü ≥400 görünce "sunucu
yok" deyip ikinci bir `next dev` başlatıyor, o da portu dolu bulup ölüyor. Yani ana sayfa
500'ü **bütün e2e kapısını** kapatıyor, sadece ana sayfayı değil.

**Why:** "e2e kanıtı ver" denen bir görevde kapının neden koşmadığını dakikalarca yanlış yerde
ararsın (port, reuse, hook) — oysa sebep tamamen ilgisiz bir sayfa.

**How to apply:** Ana sayfa 500'ü düzelene kadar repo dışında (scratchpad'de) `webServer`
bloğu OLMAYAN bir config yaz ve zaten ayakta olan sunucuya bak:

```ts
export default defineConfig({
  testDir: '/Users/macbook/AgentSpace/fabrika/tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```
`pnpm exec playwright test --config <scratch>/pw.config.ts <spec-adı>`.
Config'i repoya koyma (paralel ajanların kapısını değiştirir); raporda hangi config'le
koştuğunu **yaz**.

Ayrıca: her `test()` kendi tarayıcı bağlamını alır — 1. testte yapılan giriş 2. teste
TAŞINMAZ. `mode: 'serial'` bunu değiştirmez. Her testte giriş yapan bir `signInAs(page, url)`
yardımcısı kullan ve `waitForURL(target)` ile oturumun gerçekten kurulduğunu doğrula; yoksa
test sessizce giriş ekranında koşar ve "izolasyon var" diye **boş yere** geçer.

İlgili: [[fabrika-e2e-own-fixture-hides-route-bugs]] · [[fabrika-notfound-returns-http-200]]
