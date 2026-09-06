---
name: fabrika-prisma7-driver-adapter
description: Fabrika'da Prisma 7 driver adapter zorunlu — çıplak new PrismaClient() ve tsx script'lerinde .env yüklenmemesi tuzağı
metadata:
  type: project
updatedAt: 2026-09-06
---

Fabrika Prisma 7 kullanır. `new PrismaClient()` çıplak çağrıldığında bağlantı kurmadan
`PrismaClientInitializationError: A driver adapter is required to connect to your database` fırlatır.
Tek doğru istemci `src/lib/db.ts` (PrismaPg + pg.Pool) — yeni adapter kurmak yerine onu import et.
`prisma/` altındaki script'ler bunu `import { prisma } from '../src/lib/db'` ile alabilir (db.ts'te `@/` alias yok).

İkinci tuzak: `tsx` `.env`'i OTOMATİK YÜKLEMEZ. `dotenv` yalnızca `prisma.config.ts` içinde çağrılır ve o
sadece Prisma CLI için geçerlidir. `tsx` ile koşan her script'e (`pnpm db:seed`, `scripts/*.ts`) başına
`import 'dotenv/config'` gerekir, yoksa `DATABASE_URL` undefined kalır.

`prisma/seed-templates.ts` ve `scripts/` altındaki bazı script'ler hâlâ eski çıplak `new PrismaClient()`
desenini kullanıyor — dokunulduğunda aynı iki düzeltme uygulanmalı.

İlgili: [[fabrika-local-dev-db]]
