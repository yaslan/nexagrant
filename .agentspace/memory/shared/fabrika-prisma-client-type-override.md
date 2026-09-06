---
name: fabrika-prisma-client-type-override
description: src/types/prisma-override.d.ts @prisma/client'ı gölgeliyor — PrismaClient repoda any, Role gerçek enum olduğu için string literal atanamıyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

`src/types/prisma-override.d.ts` (commit c915bc4 ile geldi) `declare module '@prisma/client'`
yapıyor ve üretilmiş Prisma tiplerini **tamamen gölgeliyor**:

```ts
export class PrismaClient { [key: string]: any; ... }
export enum Role { TENANT_OWNER = 'TENANT_OWNER', ... }
```

**İki sonucu var — ikisi de tuzak:**

1. **Repo genelinde Prisma çağrılarının tip güvenliği kapalı.** `prisma.foo.bar()` her şeyi kabul
   eder; yanlış alan adı, eksik `tenantId`, yanlış `where` tsc'den geçer. `pnpm typecheck` temiz
   çıkması Prisma kullanımının doğru olduğunu **göstermez**. CLAUDE.md'nin "`any` yasak" kuralına da
   aykırı; ayrı bir temizlik görevi gerektiriyor (tek başına kaldırmak çok dosyayı kırar).

2. **`Role` gerçek TS `enum` olarak tanımlı**, oysa üretilmiş client'ta string literal birleşimi
   (`export type Role = (typeof Role)[keyof typeof Role]`). Bu yüzden
   `const r: Role = 'PIPELINE_MANAGER'` → `TS2322: Type '"PIPELINE_MANAGER"' is not assignable to
   type 'Role'`. Çözüm: ya `Role.PIPELINE_MANAGER` (değer importu) ya da yerel birleşim tipi
   (`type SeatRole = 'PIPELINE_MANAGER' | 'WRITER' | 'MEMBER'`). `import type { Role }` + literal
   **derlenmez** — bunu Prisma'nın kendi tipleri sanıp saatlerce aramaya değmez.

Ek not: `node_modules/.prisma` kök dizinde **yok**; üretilmiş client pnpm store'unda
(`node_modules/.pnpm/@prisma+client@.../node_modules/.prisma/client`). "Client generate edilmemiş"
sonucuna atlamadan önce oraya bak.

İlgili: [[fabrika-prisma7-driver-adapter]], [[fabrika-local-dev-db]]
