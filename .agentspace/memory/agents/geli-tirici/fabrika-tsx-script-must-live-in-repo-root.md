---
name: fabrika-tsx-script-must-live-in-repo-root
description: Fabrika'da tek seferlik DB probe'unu repo köküne .mts olarak yaz ve dotenv-cli ile koş — scratchpad'ten node_modules çözülmez, .ts'te top-level await patlar, prisma'yı src/lib/db'den al
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Tek seferlik bir DB sorgusu (satır sayımı, değişmezlik doğrulaması) koşarken üç tuzak
üst üste geldi, sırayla:

1. Script'i oturum scratchpad'ine (`/private/tmp/.../scratchpad/x.ts`) yazıp
   `npx tsx` ile koşmak → `MODULE_NOT_FOUND`. Dosya repo dışında olduğu için
   `node_modules` çözülmüyor. **Script repo köküne yazılmalı** (`.dbcheck.tmp.ts`),
   koşulup silinmeli.
2. `npx tsx -e '...'` ve top-level `await` → `Top-level await is currently not supported
   with the "cjs" output format`. **En kolay çözüm uzantıyı `.mts` yapmak** — o zaman
   top-level `await` doğrudan çalışır, `async function main(){...}` sarmalayıcısına gerek
   kalmaz. (2026-09-07'de `.probe-live.ts` → `.probe-live.mts` yeniden adlandırması tek
   başına 21 transform hatasını sıfırladı.)
3. `import { PrismaClient } from '@prisma/client'` tek başına yetmez: `PrismaPg` driver
   adapter'ı ve bir `pg.Pool` istiyor. **Doğrusu repo'nun kendi tekilini kullanmak:**
   `import { prisma } from './src/lib/db'` — havuzu ve adapter'ı o kuruyor.
   DÜZELTME (2026-09-07): bu notun eski hâli client'ın `./generated/prisma/client`'a
   üretildiğini yazıyordu; artık öyle değil. `npx prisma generate` çıktıyı
   `node_modules/.pnpm/@prisma+client@<sürüm>/.../@prisma/client` altına koyuyor ve
   `@prisma/client` spesifikatörü çözülüyor. Ama `prisma generate` kurulumun/kapının parçası
   DEĞİL, yani temiz bir ağaçta o dizin hiç yoktur — bir DB probe'u koşmadan önce
   `npx prisma generate` çalıştırman gerekebilir (yalnız `node_modules`'a yazar, commit edilmez).

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

Ortam değişkenleri otomatik gelmez: script'i `npx dotenv-cli -e .env -- npx tsx ./x.mts`
ile koş, yoksa `DATABASE_URL` boştur ve `src/lib/db.ts` sessizce localhost varsayılanına düşer.

İlgili: [[fabrika-migrations-are-not-prisma-migrate]] · [[fabrika-typecheck-is-blind-to-db-calls]]
