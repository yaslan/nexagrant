---
name: fabrika-clean-install-needs-prisma-generate
description: Fabrika'da temiz pnpm install --frozen-lockfile sonrası build ".prisma/client/index-browser" ile ölür — postinstall yok, prisma generate'i elle koşmak gerekir; bu bir kod hatası değildir
metadata:
  type: project
  updatedAt: 2026-09-08
---

`package.json`'da **`postinstall` yok**. Bu yüzden atılabilir bir worktree'de
`pnpm install --frozen-lockfile` sonrası `pnpm build` şununla ölür:

```
Error: Module not found: Can't resolve '.prisma/client/index-browser'
Import trace: @prisma/client/index-browser.js -> src/modules/m11/manifest.ts
              -> src/lib/modules/registry.ts -> settings/modules/client.tsx
```

Bu **senin değişikliğinin hatası değil**. Çözüm: kurulumdan sonra

```bash
pnpm exec prisma generate
```

Üretilen istemci kök `node_modules/.prisma`'ya değil, pnpm store'undaki
`node_modules/.pnpm/@prisma+client@…/node_modules/.prisma/client` altına yazılır —
`ls node_modules/.prisma` her zaman "yok" der, buna aldanma
(bkz. [[fabrika-prisma-client-type-override]] shared'da).

Sonuç: `pnpm install --frozen-lockfile && pnpm build` diyen bir CI işi bugün Fabrika'da
YEŞİL OLAMAZ. Temiz kurulumla ilgili bir bulguyu raporlarken bunu ayrı bir açık madde
olarak bildir, kendi işinin kanıtına karıştırma.

Bağlantılı: [[phantom-dependency-proof-by-hiding-it]]
