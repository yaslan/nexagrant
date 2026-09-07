---
name: fabrika-side-by-side-evidence-shot
description: "İki ekranı YAN YANA kanıtla" istendiğinde — Playwright ile her ekranın ELEMENT görüntüsünü al, data URI olarak tek bir setContent sayfasına koy, onu screenshot'la
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Patron "aynı fiyatı gösterdiklerini YAN YANA ekran görüntüsüyle kanıtla" dediğinde iki ayrı PNG
yetmez (okuyucu iki dosyayı kendi kafasında birleştirmek zorunda kalır). iframe de çalışmaz —
uygulama kendi sayfasını çerçeveletmeyebilir.

Çalışan yol, tek Playwright koşusunda:

```js
const a = await p.locator('[data-testid="plan-card-pro"]').screenshot();      // Buffer
// … diğer sayfaya git, oturum aç …
const b = await p.locator('[data-testid="admin-plan-card-pro"]').screenshot();
const uri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
await p.setContent(`<div style="display:flex;gap:18px">
  <img src="${uri(a)}"><img src="${uri(b)}"></div>`);
await p.screenshot({ path: `${OUT}/08-side-by-side.png`, fullPage: true });
```

Karşılaştırılacak her kart/bölüme önceden `data-testid` koy — hem element görüntüsü hem de
`innerText` ile makine karşılaştırması (`match: true`) aynı seçiciden çıkar; rapora ikisini birden
koy, görüntü tek başına "aynı" iddiasını kanıtlamaz.

`import { chromium } from '@playwright/test'` (repoda `playwright` paketi ayrıca kurulu değil) ve
betik **repo kökünde** koşmalı ([[fabrika-tsx-script-must-live-in-repo-root]]); bitince sil.

İlgili: [[fabrika-e2e-gate-was-never-running]]
