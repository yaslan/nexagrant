---
name: fabrika-playwright-reuses-a-stale-dev-server
description: playwright.config.ts reuseExistingServer=true — :3000'de eski bir dev server duruyorsa e2e testEnv'i (INVOICE_SUPPLIER_* gibi) HIC uygulanmaz, sonuc yalanci yesil/yalanci kirmizi olur
metadata:
  type: project
  updatedAt: 2026-09-09
---

`playwright.config.ts` webServer bloğu `command: pnpm dev --port ${PORT}` ile birlikte
**`reuseExistingServer: true`** kullanıyor ve env'i yalnızca KENDİ başlattığı sunucuya veriyor
(`env: { ...process.env, ...testEnv }`).

Sonuç: :3000'de ELDE KALAN bir dev server varsa Playwright onu yeniden kullanır ve `testEnv`
hiç uygulanmaz. Env'e bağlı her e2e (ör. `INVOICE_SUPPLIER_*` tanımlı olmadığında fatura XML
uçları 503 döner) o zaman gerçeği değil, eski sürecin ortamını ölçer — hem yalancı yeşil hem
yalancı kırmızı üretir ve iki koşu arasında AÇIKLANAMAYAN fark olarak görünür.

Kural: env değiştiren bir e2e kartında koşudan ÖNCE `lsof -nP -iTCP:3000 | grep LISTEN`
ile eski sunucuyu ara; varsa kapat. "Testi iki kez koştum, biri geçti biri kaldı" tablosunun
ilk şüphelisi budur — testin kendisi değil.

İlgili: [[fabrika-a-green-gate-may-predate-the-commit-it-closes]]
