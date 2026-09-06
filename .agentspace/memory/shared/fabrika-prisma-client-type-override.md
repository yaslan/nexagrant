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

## Override'ı kaldırmak isteyene (2026-09-06, ölçüldü)

Silme DENENDİ: 8 adet `Role` tip hatası sıfırlanıyor, ama override'ın **maskelediği 3 gerçek
hata** ortaya çıkıyor:
- `prisma/seed-m6-evaluations.ts` ×2 — `callId` / `status` diye alanlar `Opportunity`/`Proposal`
  modellerinde YOK, yani bu seed çalışma anında patlar (tsc bugüne dek görmedi).
- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` ×1.

Ayrıca **CI `prisma generate` koşmuyor** (`.github/workflows/ci.yml`: validate + lint + typecheck
+ test). Override kaldırılırsa CI, üretilmiş tipler olmadan tsc koşar ve kırılır.

Doğru sıra: (1) yukarıdaki 3 hatayı düzelt, (2) CI'ya `prisma generate` adımı ekle,
(3) sonra `prisma-override.d.ts`'i sil. Tek adımda kaldırma denemesi geri alınır.

İlgili: [[fabrika-team-handover-cekirdek]], [[fabrika-prisma7-driver-adapter]], [[fabrika-local-dev-db]]
