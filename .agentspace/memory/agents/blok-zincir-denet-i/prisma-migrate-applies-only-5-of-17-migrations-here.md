---
name: prisma-migrate-applies-only-5-of-17-migrations-here
description: Fabrika'da prisma migrate hiçbir düz .sql'i uygulamaz — 17 ileri migration'ın 12'si elle koşulmak zorunda ve DB yalnız 5'ini bilir; "migration var" demek "kolon var" DEMEK DEĞİL
metadata:
  type: project
  updatedAt: 2026-09-09
---

2026-09-09 ölçümü (`docs/agent-results/TASK-MTTOUDNQ97X83-evidence/probe-migration-inventory.mts`):

```
forward .sql files, bare:     12      <- hiçbir komut uygulamaz
forward .sql files, foldered:  5      <- <ad>/migration.sql
TOTAL forward migrations:     17
prisma/migrations/migration_lock.toml present: false
_prisma_migrations: 5 satır          <- yalnız klasörlü olanlar
```

`pnpm db:migrate` (= `prisma migrate dev`) düz `prisma/migrations/*.sql` dosyalarını
**görmez**; `scripts/` altında uygulayan bir araç da yok. Yani bir kart "migration yazıldı"
diyorsa kolonun hedef veritabanında **var olduğu anlamına gelmez** —
[[fabrika-schema-done-means-information-schema]] burada da geçerli, `information_schema`'ya sor.

Ölçülmüş sonucu: `relationship-owner-nullable.sql` uygulanmadan imha işi `P2011` ile düşer,
kişi silinmez, yasal imha borcu büyür. Kontrol listesi: `docs/RELEASE_CHECKLIST.md` §1
(sayı orada, komutuyla birlikte — yayından önce tekrar sayılmalı).

Bir migration'ın uygulanıp uygulanmadığını doğrularken: `_prisma_migrations` tablosu
yalnız klasörlü olanları listeler, düz dosyalar için **hiçbir iz bırakmaz**.
