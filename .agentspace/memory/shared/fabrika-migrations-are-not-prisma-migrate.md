---
name: fabrika-migrations-are-not-prisma-migrate
description: Fabrika'da prisma/migrations KARIŞIK — eski işler düz SQL (Migrate dışı), S9-S10'dan itibaren yeni işler gerçek Prisma Migrate klasörü kullanıyor ve DB artık kısmen Migrate'e bağlı
metadata:
  type: project
  updatedAt: 2026-09-07
---

**2026-09-07 güncellemesi:** Aşağıdaki "veritabanı Prisma Migrate tarafından yönetilmiyor" tespiti
**artık kısmen eski.** S10'da iki yeni iş (`add-m9-meeting-schedule`, `add-calendar-connections`)
gerçek Prisma Migrate klasörü formatında (`<ad>/migration.sql`) geldi ve DB bugün bu ikisi için
`_prisma_migrations` defterine baseline'landı — `npx prisma migrate status` artık "Database schema
is up to date!" diyor (yalnız bu iki migration için; `add-feedback.sql` gibi eski loose-SQL dosyaları
hâlâ Migrate defterinin dışında, aşağıdaki eski tespit onlar için geçerli).

**Yeni gotcha — P3005 "schema not empty":** Bir ajan önce `prisma db push` ile şemayı DB'ye yazıp
SONRA gerçek bir migration klasörü eklerse (`add-m9-meeting-schedule` böyle oldu), `prisma migrate
deploy` P3005 ile reddeder çünkü tablo zaten var ama migration history'de kaydı yok. Bu **reset
gerektirmez** — yıkıcı olmayan çözüm:
```
npx prisma migrate resolve --applied <migration-adı>   # zaten var olanı baseline'la
npx prisma migrate deploy                                # geri kalanını gerçekten uygula
```
İçeriği `CREATE TABLE IF NOT EXISTS` / additive ise (veri kaybı riski yoksa) bunu kullanıcı onayı
beklemeden uygulamak makul — bkz. `docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md` §3.5.
Bir ajan raporunda "migration reset için kullanıcı onayı gerekiyor, BLOKE" derse önce bunun gerçekten
reset mi yoksa yalnızca baseline mi gerektirdiğini kontrol et — çoğu zaman baseline yeterli.

---

## Eski tespit (2026-09-06, hâlâ loose-SQL dosyalar için geçerli)

`prisma/migrations/` bu repoda Prisma Migrate klasörü **değil**. İçi düz, elle yazılmış
`add-<ad>.sql` + `add-<ad>.down.sql` çiftleri (`add-soft-delete`, `add-feedback`,
`add-m6-evaluator-lens`). Şema `prisma db push` ile senkronlanıyor; veritabanında Prisma
Migrate defteri yok.

2026-09-06'da ölçüldü:

```
$ npx prisma migrate status
No migration found in prisma/migrations
The current database is not managed by Prisma Migrate.
```

**Why:** `package.json`'da `db:migrate` hâlâ `prisma migrate dev`. Prisma Migrate ile
yönetilmeyen bir veritabanında bu komut "drift" görür ve **baseline için sıfırlama**
önerir/uygular — yani `pnpm db:migrate` bu repoda yıkıcı bir komut, adı öyle
görünmese de.

Aynı gün somut zarar da görüldü: biri `prisma/migrations/add_soft_delete/migration.sql`
diye Prisma tarzı bir klasör bırakmıştı. O klasör varken `migrate status` onu
"uygulanmamış migration" sayıyordu; içeriği de `add-soft-delete.sql`'in idempotent
olmayan, tek tablolu, geri-alma dosyasız eksik kopyasıydı. Silindi (bkz. commit
`d04e657` dalgasının raporu, `docs/agent-results/DALGA-1-geli-tirici.md`).

**How to apply:**

1. Yeni şema değişikliği: `prisma/migrations/add-<ad>.sql` + `add-<ad>.down.sql` yaz,
   `IF NOT EXISTS` / `IF EXISTS` ile idempotent kur. Prisma tarzı zaman damgalı klasör
   AÇMA — Prisma'nın migration defterini kirletir.
2. Uygulamak için `pnpm db:migrate` KULLANMA. `npx prisma db execute --file
   prisma/migrations/add-<ad>.sql` koş, sonra iki kez koşup değişmediğini kanıtla.
3. `psql` bu makinede PATH'te YOK, yani `pnpm db:rls` (= `psql -f prisma/rls.sql`)
   doğrudan patlar. Yerine `npx prisma db execute --file prisma/rls.sql`, doğrulama için
   `pnpm rls:check` (37/37 bekleniyor).
4. `docker` CLI de PATH'te yok ama Docker Desktop 5432'yi dinliyor — `lsof -nP
   -iTCP:5432 -sTCP:LISTEN` ile bak, `docker ps` ile değil.

İlgili: [[fabrika-parallel-agent-file-race]] · [[fabrika-known-failing-tests]]
