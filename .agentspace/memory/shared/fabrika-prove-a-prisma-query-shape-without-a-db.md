---
name: fabrika-prove-a-prisma-query-shape-without-a-db
description: Prisma argümanları bağlantıdan ÖNCE doğrulanır — kapalı bir porta bağlanan client ile "şema reddetti" (PrismaClientValidationError) ile "tele ulaştı" (PrismaClientKnownRequestError) ayırt edilir; her test dosyası kendi sorgu şeklini VERİTABANISIZ kanıtlayabilir
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Prisma, `findMany`/`create`/`update` argümanlarını **istemci tarafında, bağlantıyı kullanmadan
önce** doğrular. Bu yüzden veritabanı olmadan da bir sorgunun şemaya uyup uymadığı ölçülebilir:

- Şemaya UYMAYAN sorgu → `PrismaClientValidationError` (tele hiç çıkmaz)
- Şemaya UYAN sorgu → `PrismaClientKnownRequestError` (bağlanamadı; **şekil doğru demektir**)

```ts
import { createDbClient } from '@/lib/db';   // @prisma/client'ı elle kurma, repo'nun fabrikası
const db = createDbClient('postgresql://nobody:nobody@127.0.0.1:1/does-not-exist'); // port KAPALI

async function rejectionKind(run: () => Promise<unknown>): Promise<string> {
  try { await run(); return 'none'; }
  catch (e) { return (e as object).constructor.name; }
}

expect(await rejectionKind(() => db.savedSearch.findMany(MY_QUERY)))
  .not.toBe('PrismaClientValidationError');          // şekil geçerli
expect(await rejectionKind(() => db.savedSearch.findMany(ESKI_BOZUK_SEKIL as any)))
  .toBe('PrismaClientValidationError');              // NEGATİF KONTROL: koruma gerçekten görüyor
```

Ölçüm ~90 ms sürer (`connectionTimeoutMillis: 1000`), yani birim testte serbestçe kullanılabilir.

**Why:** `vi.mock('@/lib/db')` ile yazılan bir test **hangi kolonun var olduğuna karar veremez** —
mock her alan adını kabul eder ([[fabrika-db-mock-invents-the-model]]). `pnpm typecheck` de
göremez, çünkü çağrı `as any`/gevşek tiple geçiyorsa tip hatası çıkmaz
([[fabrika-typecheck-is-blind-to-db-calls]]). Sonuç: **yeşil suite + her sabah ölen cron**.

Ölçülmüş örnek (TASK-MTRKWBLXUYSHS, 2026-09-07) — aynı repoda ÜÇ ayrı "hayalet kolon":

| Yer | Yazılan | Şemada olan |
|---|---|---|
| `inngest/jobs/alerts-daily.ts` | `include: { tenant: true }` | `SavedSearch` yalnız `tenantId` skaleri (ilişki YOK) |
| `lib/sso.ts` | `tenant.update({ data: { domain } })` | `Tenant`'ta `domain` kolonu YOK (`settings` Json var) |
| `lib/calendar/sync.ts` | `{ severity, type, sourceModule, metadata }` | `SystemAlert` = `{ level, source, message, meta }` |

Üçünün de testi vardı ve üçü de **yeşildi**, çünkü hepsi Prisma'yı mock'luyordu.

**How to apply:**
1. Bir job/aksiyon yazarken sorgu argümanlarını **dışa aktarılmış bir sabit/fonksiyon** yap
   (`export const SAVED_SEARCH_ALERT_QUERY = {...} as const`). Handler'ın içine gömülü kalan
   argüman test edilemez.
2. Test dosyanda mantığı mock ile, **şekli gerçek client ile** doğrula. İkisi ayrı işler.
3. Negatif kontrolü **her zaman** yaz: eski bozuk şeklin hâlâ reddedildiğini iddia et. Yoksa
   testin hiç kırmızı olamayacağını fark etmezsin ([[fabrika-red-first-or-it-locks-nothing]]).
4. Bunu m8 `schema-contract.test.ts`'e bırakmak zorunda değilsin — o `src/` genelini tarar,
   bu ise **senin dosyanın kendi sorgusunu** kilitler; ikisi çakışmaz, tamamlar.

Uyarı: `import { PrismaClient } from '@prisma/client'` ile elle client kurma —
Prisma 7'de `datasources`/`datasourceUrl` constructor seçenekleri YOK, driver adapter
(`PrismaPg` + `pg.Pool`) gerekir. `createDbClient(url)` bunu zaten yapıyor
([[fabrika-tsx-script-must-live-in-repo-root]]).

İlgili: [[fabrika-swallowed-catch-returns-fake-success]]
