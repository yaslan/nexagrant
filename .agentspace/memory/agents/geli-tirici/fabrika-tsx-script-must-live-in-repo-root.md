---
name: fabrika-tsx-script-must-live-in-repo-root
description: Fabrika'da tek seferlik DB sorgusu için tsx script'i scratchpad'e değil repo köküne yaz — Prisma client generated/prisma/client'ta ve driver adapter istiyor, dışarıdan import çözülmez
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Tek seferlik bir DB sorgusu (satır sayımı, değişmezlik doğrulaması) koşarken üç tuzak
üst üste geldi, sırayla:

1. Script'i oturum scratchpad'ine (`/private/tmp/.../scratchpad/x.ts`) yazıp
   `npx tsx` ile koşmak → `MODULE_NOT_FOUND`. Dosya repo dışında olduğu için
   `node_modules` çözülmüyor. **Script repo köküne yazılmalı** (`.dbcheck.tmp.ts`),
   koşulup silinmeli.
2. `npx tsx -e '...'` ve top-level `await` → `Top-level await is currently not supported
   with the "cjs" output format`. Kodu `async function main(){...} main()` içine al.
3. `import { PrismaClient } from '@prisma/client'` → çalışmaz. Bu repoda client
   `./generated/prisma/client`'a üretiliyor ve `PrismaPg` driver adapter istiyor.
   **Doğrusu repo'nun kendi tekilini kullanmak:** `import { prisma } from './src/lib/db'`.

Çalışan iskelet:

```ts
// .dbcheck.tmp.ts — repo kökünde, koştuktan sonra sil
import { prisma } from './src/lib/db'
async function main() {
  const rows = await prisma.$queryRawUnsafe<any[]>(`select count(*)::int n from "Call"`)
  console.log(rows)
}
main().then(() => process.exit(0)).catch(e => { console.error('ERR', e.message); process.exit(1) })
```

`::int` cast'i şart: sayaçlar `bigint` döner ve `regclass` gibi tipler
"Failed to deserialize column" ile patlar.

`prisma db execute` satır DÖNDÜRMEZ ("Script executed successfully" der) — yazma
uygulamak için iyi, okuma için işe yaramaz.

İlgili: [[fabrika-migrations-are-not-prisma-migrate]]
