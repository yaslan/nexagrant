---
name: fabrika-prisma7-driver-adapter
description: Fabrika'da Prisma 7 driver adapter zorunlu — çıplak new PrismaClient() ve tsx script'lerinde .env yüklenmemesi tuzağı
metadata:
  type: project
updatedAt: 2026-09-08
---

Fabrika Prisma 7 kullanır. `new PrismaClient()` çıplak çağrıldığında bağlantı kurmadan
`PrismaClientInitializationError: A driver adapter is required to connect to your database` fırlatır.
Tek doğru istemci `src/lib/db.ts` (PrismaPg + pg.Pool) — yeni adapter kurmak yerine onu import et.
`prisma/` altındaki script'ler bunu `import { prisma } from '../src/lib/db'` ile alabilir (db.ts'te `@/` alias yok).

İkinci tuzak: `tsx` `.env`'i OTOMATİK YÜKLEMEZ. `dotenv` yalnızca `prisma.config.ts` içinde çağrılır ve o
sadece Prisma CLI için geçerlidir. `tsx` ile koşan her script'e (`pnpm db:seed`, `scripts/*.ts`) başına
`import 'dotenv/config'` gerekir, yoksa `DATABASE_URL` undefined kalır.

2026-09-08 ölçümü (TASK-MTSJK8VVG9MKM): bu desenden geriye **tek** dosya kaldı —
`prisma/seed-templates.ts` (koşturulduğu an ölür; `prisma/seed.ts`'e bağlı değil, yalnız elle
koşuluyor). `prisma/seed-m6-evaluations.ts` düzeltildi; takipli `scripts/` altında örnek yok
(`grep -rl 'new PrismaClient' $(git ls-files scripts)` → boş).

İlgili: [[fabrika-local-dev-db]]
