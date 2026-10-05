---
name: fabrika-schema-done-means-information-schema
description: Bir şema işi "bitti" raporlandıysa tablo gerçekten var demek DEĞİL — typecheck de mock'lu test de yalan söyler; information_schema'ya sor
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

TASK-MTRJ32BZBY2AI ADIM 1'i ben yaptım ve "şema eklendi, migrate + seed başarılı, typecheck geçiş"
diye raporladım. ADIM 2'ye başlarken ölçtüm: `PlanVersion`, `PlanFeature`, `PlanAssignment`
**veritabanında yoktu**, `Plan.visibility` ve `Subscription.planVersionId` kolonları yoktu, hiçbir
migration dosyası yazılmamıştı.

**Neden yakalanmadı:** `src/types/prisma-override.d.ts` delegate'leri `any` geçiyor, bu yüzden
olmayan tabloya yapılan çağrı tsc'den geçiyor ([[fabrika-prisma-client-type-override]]). Ayrıca bu
repoda migration'lar elle yazılan düz SQL, `prisma migrate` değil
([[fabrika-migrations-are-not-prisma-migrate]]) — yani "şemayı düzenledim" ile "tablo var" arasında
hiçbir otomatik bağ yok.

**Kural (kendime):** bir şema/DB işini — kendiminki dahil — bitti saymadan önce 30 saniyelik ölçüm:

```ts
await prisma.$queryRawUnsafe(
  `select table_name from information_schema.tables
   where table_schema='public' and table_name in ('X','Y','Z')`);
await prisma.$queryRawUnsafe(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='T' and column_name='c'`);
```
`typeof prisma.planVersion === 'object'` **kanıt değildir** — override yüzünden her ad için
`object` döner. Tabloya gerçekten `count()` at.

**İkinci kural:** aynı iş sırasında `pnpm rls:check` de kırmızıydı — yeni kiracıya özel model
`prisma/rls.sql`'deki kanonik FOREACH listesine eklenmemişti (checker `'ModelAdı'` metnini **tek
tırnaklı** arıyor; ayrı bir `ALTER TABLE "ModelAdı"` bloğu yazmak onu tatmin etmez). Yeni
tenant-scoped tabloda liste satırını ekle, ayrı blok yazma.

**Üçüncü:** DB'ye yazan vitest süitine `afterEach` temizliği koy. ADIM 1 testinin `beforeEach`'i
vardı, `afterEach`'i yoktu; admin ekranında 4 gerçek paketin yanında 60 sahte "Test Plan"
görünüyordu. Bunu ancak gerçek ekran görüntüsüne bakınca fark ettim — testler yeşildi.


## Ek: `src/lib/**` kodu İKİ tip dünyasında da derlenmeli

Aynı görevde `plan-repository.ts` içindeki bir `.filter((plan) => ...)` beni iki kez ısırdı:

- **`prisma generate` koşulmuş dünyada** (delegate tipli): açık `: any` → eslint
  `@typescript-eslint/no-explicit-any` **hatası**, `githooks/pre-commit` durdurur.
- **Depo hâlinde** (override aktif, delegate `any`): anotasyonsuz callback parametresi →
  `TS7006 implicit any` **hatası**.

Yani `any` da çıkarım da tek başına yanlış. Doğrusu **yerel adlandırılmış şekil**:

```ts
const rows = plans as unknown as Array<{ id: string; name: string; visibility: string;
                                        versions: PublishedPlanVersion[] }>;
return rows.filter((plan) => plan.versions.length > 0).map(...)
```
`any`'den farkı: `select` bir alanı döndürmeyi bırakırsa bu yine kırılır.

Ölçüm disiplini: bir dünyayı test edip diğerini varsayma — override'ı geçici olarak devre dışı
bırakıp (`@prisma/client/index.d.ts` stub) `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit`,
sonra geri koyup tekrar. `tsbuildinfo` silinmezse ikinci ölçüm yalan söyler.

İlgili: [[fabrika-assert-both-config-branches]], [[fabrika-parallel-agent-file-race]]
