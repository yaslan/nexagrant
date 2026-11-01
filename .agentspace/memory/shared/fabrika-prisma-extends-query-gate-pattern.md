---
name: fabrika-prisma-extends-query-gate-pattern
description: Bu repoda bir Prisma model yazma yolunu makine seviyesinde kilitlemenin ilk örneği — client.$extends({query:{model:{...}}}) createDbClient()'a eklendi, withTenant'ın tx'i de miras alıyor, tip PrismaClient olarak cast'lendi
metadata:
  type: reference
  updatedAt: 2026-09-08
---

TASK-MTSJIXP9V3JD7'de (`CalendarConnection` token zarf gate'i) bu repoda **ilk kez**
bir Prisma Client Extension (`$extends`) kullanıldı — önceden `$use` (deprecated
middleware) da yoktu. Gelecekte benzer bir "şu alana şu kural uymadan yazılamasın"
ihtiyacı çıkarsa (ör. başka bir sırrı, başka bir invariant'ı zorlamak) buradaki deseni
kopyala:

```ts
// src/lib/db.ts
function withCalendarTokenGate(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: 'calendar-token-envelope-gate',
    query: {
      calendarConnection: {
        create({ args, query }) { guardCalendarTokenWrite(args.data); return query(args); },
        update({ args, query }) { guardCalendarTokenWrite(args.data); return query(args); },
        updateMany({ args, query }) { guardCalendarTokenWrite(args.data); return query(args); },
        upsert({ args, query }) { guardCalendarTokenWrite(args.create); guardCalendarTokenWrite(args.update); return query(args); },
      },
    },
  }) as unknown as PrismaClient;
}
export function createDbClient(url: string): PrismaClient {
  return withCalendarTokenGate(new PrismaClient({ adapter: new PrismaPg(pool) }));
}
```

**Üç ölçülmüş gerçek:**

1. **`createDbClient()`'ın içine koy, yalnız `prisma` singleton'ına değil** — RLS-rolü
   test client'ı da (`createDbClient(RLS_URL)`, `tests/rls.spec.ts` vb.) aynı yoldan
   geçiyor, gate'i orada da istiyorsan tek nokta burası.

2. **`withTenant`/`withTenantOn`'ın `tx`'i extension'ı miras alıyor** — canlı DB'ye
   karşı doğrulandı: `withTenant('t', tx => tx.calendarConnection.create({...plaintext}))`
   aynı `PlaintextCalendarTokenError`'ı fırlattı. Yani `$transaction(async tx => ...)`
   içindeki `tx`, extended client'tan türetildiği için extension'ı kaybetmiyor —
   Prisma dokümantasyonunun iddia ettiği ama bu repoda daha önce hiç ölçülmemiş davranış.

3. **Dönüş tipini `PrismaClient`'a geri cast et** (`as unknown as PrismaClient`),
   extension'ı export etme. `$extends()`'in gerçek dönüş tipi yapısal olarak farklı
   (yeni bir generic marka taşıyor) ve repoda ~8 yerde (`tests/rls.spec.ts`,
   `relationships/[id]/data.ts`, `TenantTx` tanımı) `PrismaClient` tipi elle
   yazılmış — extension yeni bir public metot **eklemediği** sürece (yalnız var olan
   `create`/`update`/... çağrılarını araya girip kontrol ediyor) bu cast güvenli ve
   ~8 dosyalık tip zincirleme kırılmasını önlüyor. Yeni bir public metot eklersen bu
   cast'i kullanma — o zaman `DbClient = ReturnType<typeof createDbClient>` gibi yeni
   bir tip alias'ı çıkarıp çağrı yerlerini ona taşımak gerekir.

**Not:** bu ölçüm sırasında `.prisma/client/default` hiç generate edilmemişti
(`npx prisma generate` gerekti) — bu ayrı ve zaten bilinen bir gotcha, bkz.
[[fabrika-dev-server-stale-prisma-client]] varyantı "istemci hiç üretilmemiş".
