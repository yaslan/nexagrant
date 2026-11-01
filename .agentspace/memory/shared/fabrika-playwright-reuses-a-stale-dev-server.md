---
name: fabrika-playwright-reuses-a-stale-dev-server
description: playwright.config.ts artik reuseExistingServer=false — :3000 doluyken e2e hic baslamaz; kardes sunucuyu oldurmek yerine E2E_PORT=<bos port> ver, izole worktree kurmaya GEREK YOK
metadata:
  type: project
  updatedAt: 2026-09-10
---

**2026-09-10'da ÖLÇÜLDÜ — bu notun eski hâli artık yanlıştı.** `playwright.config.ts:47`
bugün **`reuseExistingServer: false`**. Yani eski davranış (başkasının :3000 sunucusunu
sessizce devralıp `testEnv`'i hiç uygulamamak) ARTIK YOK; onun yerine e2e hiç başlamıyor:

```
Error: http://localhost:3000 is already used, make sure that nothing is running on
the port/url or set reuseExistingServer:true in config.webServer.
```

## Doğru çözüm: `E2E_PORT` — config'in kendi sunduğu kapı

`playwright.config.ts:11` → `const PORT = Number(process.env.E2E_PORT ?? 3000);`
ve `webServer.command` = `pnpm dev --port ${PORT}`. Yani:

```bash
E2E_PORT=3131 pnpm test:e2e                       # tüm suite
E2E_PORT=3131 pnpm test:e2e tests/e2e/foo.spec.ts # tek spec
```

Playwright kendi sunucusunu boş portta ayağa kaldırır, `testEnv`'i (`INVOICE_SUPPLIER_*`)
ona GERÇEKTEN uygular, ve paylaşılan :3000 sunucusuna dokunmaz. 2026-09-10'da 145 spec'lik
tam suite bu yolla koştu (142 passed / 4.6m).

## Bunun geçersiz kıldığı iki inanç

1. **"Aynı dizinde ikinci `next dev` yasak, o yüzden izole worktree gerekir."** Ölçüldü:
   `E2E_PORT` ile aynı depo dizininden ikinci sunucu **sorunsuz kalkıyor** (3131, 3132,
   3133, 3134 portlarında arka arkaya koşuldu). Bir tur önce (TASK-MTTUSZF4QSFGU) bunun
   için `cp -al` ile worktree kurulmuştu — gereksiz emekmiş.
2. **"Kardeş dev sunucusunu bulup kapat."** Gerek yok, üstelik yasak. Port ver, geç.

## Yan etki: başıboş worktree'ler kapıyı kırıyor

`.claude/worktrees/*` altında bırakılan kopyalar `pnpm lint`'i çökertiyor: eslint onların
`.next/` derleme çıktısını tarıyor (1960 error / 21724 warning, hepsi `src/` DIŞINDA).
`vitest.config.mts` `.claude/worktrees`'i dışlıyor, eslint yapılandırması dışlamıyor.
Yani worktree kurarsan İŞİN BİTİNCE SİL, yoksa `pnpm gate` herkes için ilk adımda düşer.

İlgili: [[fabrika-parallel-e2e-must-use-own-port]] · [[fabrika-e2e-blocked-by-landing-page-500]] ·
[[fabrika-a-green-gate-may-predate-the-commit-it-closes]]
