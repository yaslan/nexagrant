---
name: fabrika-theme-is-a-server-resolved-cookie
description: Fabrika'da tema artık fabrika-theme çerezinden SUNUCUDA çözülüyor ve html etiketine basılıyor; theme-init.js yok, localStorage yok — Next kendi Vary'sini yazdığı için config'teki Vary satırı boşa gidiyor
metadata:
  type: project
  updatedAt: 2026-09-09
---

TASK-MTTZ1AYG8RA55 ile tema mekanizması değişti (commit `feat(app): resolve the theme
on the server from a cookie`):

- Gerçeğin kaynağı **`fabrika-theme` çerezi** (`light|dark|system`), sözleşme
  `src/lib/theme.ts`'te. `public/theme-init.js` **silindi**, `localStorage` artık hiç
  okunmuyor/yazılmıyor.
- Kök layout `cookies()` ile çerezi okuyup `<html class="dark" data-theme="dark">`
  render ediyor; çerez yoksa/`system` ise `Sec-CH-Prefers-Color-Scheme` başlığına
  bakıyor (`next.config.ts`'te `Accept-CH` + `Critical-CH`). Safari/Firefox bu ipucunu
  göndermiyor → orada ilk ziyarette bir kez açık tema flaşı; bilinçli kabul.

Ölçülen iki şey, tekrar ölçmeye gerek yok:

- **Statiklik bedeli sıfır.** `cookies()` kök layout'u dinamikleştirir diye beklenirdi
  ama uygulamanın 117 rotasından zaten 116'sı `ƒ`; tek `●` olan
  `/[locale]/calls/[region]` değişmedi. Önce/sonra build'lerin prerender manifest'i ve
  prerender edilmiş HTML listesi de birebir aynı (`_global-error.html` + `favicon.ico`).
- **`Vary: Sec-CH-Prefers-Color-Scheme` config'e yazılamıyor.** Next her app-router
  yanıtına kendi `Vary`'sini (`rsc, next-router-state-tree, …`) yazıp yapılandırılanı
  eziyor — curl ile doğrulandı. Bugün sorun değil (her rota `ƒ` +
  `Cache-Control: no-cache`), ama önüne CDN konursa vary CDN'de ayarlanmalı.

`ThemeProvider`'a eski localStorage tercihini çereze taşıyan bir effect yazıldı ve
GERİ ALINDI: effect içinde `setState` çağırdığı için `react-hooks/set-state-in-effect`
`pnpm gate`'i kırıyor. Bedel tek seferlik — tema seçmiş kullanıcı bir kez daha seçer.

Bkz. [[fabrika-use-client-exports-are-client-references]] ·
[[fabrika-react-script-warning-is-a-hydration-miss]]
