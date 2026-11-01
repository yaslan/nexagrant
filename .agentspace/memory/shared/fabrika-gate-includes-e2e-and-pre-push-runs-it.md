---
name: fabrika-gate-includes-e2e-and-pre-push-runs-it
description: 1ffd154'ten sonra `pnpm gate` e2e'yi de kosuyor ve githooks/pre-push tam gate'i kosuyor — e2e kirmiziysa push da kirmizi
metadata:
  type: project
  updatedAt: 2026-09-09
---

`1ffd154 gate(ci): add e2e tests to gate` ile kapı değişti:

```
"gate": "pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check
         && pnpm rls:check && pnpm rls:verify && pnpm test:e2e"
```

`githooks/pre-push` `set -e` ile `pnpm gate` koşuyor ve `core.hooksPath=githooks` kurulu —
yani **bir e2e testi kırmızıysa push da kırmızıdır**. Tam kapı koşusu ~3 dk 23 sn
(`fullyParallel: false`, `workers: 1`). CI'da (`.github/workflows/ci.yml`) artık pgvector
servisi + `playwright install` + `pnpm test:e2e` var ve `INVOICE_SUPPLIER_*` sahte test
değerleriyle veriliyor; `playwright.config.ts` `reuseExistingServer: !process.env.CI`.

Sonuç: "vitest yeşil" artık kapı değil. Bir kart kapatmadan önce e2e'nin TAMAMINI koştur —
`--grep` ile bir alt küme yeşil diye kapı yeşil sanma.

Kapı eklendiği gün ilk koşuşunda gerçek bir hata buldu: aynı boş-durum `<h2>`'si sayfada iki
kez basılıyor (8 test kırmızı, TASK-MTU4AYW5R9DGL).

İlgili: [[fabrika-playwright-reuses-a-stale-dev-server]]
