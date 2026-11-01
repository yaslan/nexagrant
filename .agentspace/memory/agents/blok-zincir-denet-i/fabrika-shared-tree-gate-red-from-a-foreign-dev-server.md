---
name: fabrika-shared-tree-gate-red-from-a-foreign-dev-server
description: Fabrika'da pnpm gate'in e2e aşaması, makinede başkasının açtığı next dev sunucusunu yeniden kullanır ve testEnv hiç uygulanmaz — 7 fatura testi 503'le yalancı kırmızı verir
metadata:
  type: project
  updatedAt: 2026-09-10
---

## Belirti

`pnpm gate` → `playwright test` aşamasında 7 fatura e2e'si kırmızı:
`invoice-export-real-record`, `invoice-foreign-currency-export` (4), `invoice-write-path` (2).
Hepsinde `expect(res.status()).toBe(200)` yerine **503**.

## Kök neden (ölçüldü)

`playwright.config.ts:46` → `reuseExistingServer: !process.env.CI`. Makinede zaten koşan bir
`next dev` varsa Playwright kendi sunucusunu başlatmaz; o sunucuya `playwright.config.ts:22-28`
içindeki `testEnv` (`INVOICE_SUPPLIER_*`) **hiç uygulanmaz**. `.env`'de bu değişkenler yok
(`grep -c INVOICE_SUPPLIER .env` → 0), çünkü `src/lib/env.ts:60-66` hepsini `.optional()`
tanımlıyor. Sonuç: `buildInvoiceDocument` → `SupplierNotConfiguredError` →
`export/route.ts:129-135` **503**.

## Nasıl teşhis edilir (mac)

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN            # sunucu var mı, PID kim
ps -o lstart= -p <PID>                      # kapıdan ÖNCE mi başlamış
ps eww -o command= -p <PID> | tr ' ' '\n' | grep -c INVOICE_SUPPLIER   # 0 ise tuzak bu
grep -ac "invoice supplier identity not configured" .next/dev/logs/next-development.log
```
Linux'ta `stat -f` yerine `stat -c %y`; Windows'ta `Get-NetTCPConnection`/`Get-Process`.
Kök nedenin kendisi platformdan bağımsız (`CI` dışında hiçbir koşul yok).

## Tuzak

- `E2E_PORT=3100` ile kaçamazsın: Next aynı dizinden ikinci bir dev sunucusunu
  **reddediyor** ("Another next dev server is already running").
- Kardeş pane'in sunucusunu `kill` ETME — kural yasak. Bu yüzden "env verilince yeşil"
  iddiası bu makinede ölçülemez; kanıt olarak kök neden zincirini yaz.
- Ters yön daha tehlikeli: bayat bir sunucu **yalancı YEŞİL** de üretir (yeni kod hiç
  yüklenmemiş olur). Kapının verdiği hüküm, makinede kimin sunucusu açık olduğuna bağlı.

## İlgili

[[a-gate-run-belongs-to-a-tree-not-a-commit]] ·
`.agentspace/memory/agents/blok-zincir-dev/fabrika-playwright-reuseexistingserver-ci-guard.md`
(o not riski yalnız CI'ya bağlamış; bu ölçüm paylaşılan geliştirme makinesinde de gerçekleştiğini gösteriyor)
