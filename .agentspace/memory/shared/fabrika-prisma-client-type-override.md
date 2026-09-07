---
name: fabrika-prisma-client-type-override
description: src/types/prisma-override.d.ts @prisma/client'ı gölgeliyor — PrismaClient repoda any, Role gerçek enum, withTenant<T> T'yi çıkaramaz ve Prisma ad alanı import edilemez
metadata:
  type: project
  updatedAt: 2026-09-07
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

## Üçüncü sonuç: `withTenant<T>` T'yi ÇIKARAMAZ (2026-09-07, ölçüldü)

Override `PrismaClient`'ı `[key: string]: any` ile ilan ettiği için `TenantTx` üzerindeki
`tx.membership.findMany(...)` dönüşü jenerik çıkarım için bir tutamak vermiyor:

```ts
// HER İKİSİ DE: TS18046 'rows' is of type 'unknown'  →  sonra TS7006 implicit any on `m`
const rows = await withTenant(t, (tx) => tx.membership.findMany({ where: { tenantId: t } }));
const rows = await withTenant(t, (tx) => tx.membership.findMany({ ..., include: { user: true } }));
```

Depodaki mevcut çağrı yerlerinin hepsi bunu **hedef değişkeni anotasyona bağlayarak** dolanıyor
(`let dbOpportunities: OpportunityItem[] = await withTenant(...)` — `pipeline/page.tsx:20`,
`settings/api-keys/page.tsx:40`, `tto/page.tsx:18`). Dönüşü doğrudan `.map()`'e verdiğin için
anotasyon yeri yoksa **tip argümanını çağrıya ver**:

```ts
interface MembershipRow { userId: string; role: string; user: { name: string | null; email: string } }

const rows = await withTenant<MembershipRow[]>(tenantId, (tx) =>
  tx.membership.findMany({
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    ...
  })
);
```

`include` yerine `select` kullan: satır şekli `MembershipRow`'a birebir sabitlenir, tip yalanı olmaz.

`Prisma.MembershipGetPayload<...>` ile çözmeye ÇALIŞMA — override `Prisma` ad alanını export
etmediği için `import { Prisma } from '@prisma/client'` → `TS2305: Module '"@prisma/client"' has
no exported member 'Prisma'`. Üretilmiş client'ta o ad alanı var, ama override onu gölgeliyor.

Ve `any` ile susturma: CLAUDE.md yasak listesinde ve `githooks/pre-commit` staged dosyada
`@typescript-eslint/no-explicit-any`'yi hata olarak durduruyor.


İlgili: [[fabrika-team-handover-cekirdek]], [[fabrika-prisma7-driver-adapter]], [[fabrika-local-dev-db]], [[fabrika-withtenant-set-config]]
