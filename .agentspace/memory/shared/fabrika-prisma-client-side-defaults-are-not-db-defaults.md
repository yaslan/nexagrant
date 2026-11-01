---
name: fabrika-prisma-client-side-defaults-are-not-db-defaults
description: Prisma'da @updatedAt ve @default(cuid()) veritabaninda DEFAULT birakmaz — Prisma disindan (Python worker, ham SQL, psql) yazan her istemci bu sutunlari kendi doldurmali
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Prisma'nın bazı varsayılanları **istemci tarafındadır**: migration'a `DEFAULT` yazılmaz,
değeri Prisma Client üretir. `@default(now())` ise gerçek bir `DEFAULT CURRENT_TIMESTAMP`
bırakır. Fark, Prisma dışından yazarken NOT NULL ihlaline dönüşür.

2026-09-08'de canlı şemada ölçüldü:

```
CordisOrganization : organisationId, name, updatedAt   <- NOT NULL, DEFAULT YOK
CordisImportRun    : runId, dataset, status            <- NOT NULL, DEFAULT YOK
CordisProject      : importedAt  -> DEFAULT CURRENT_TIMESTAMP   (@default(now()))
CordisImportRun    : startedAt   -> DEFAULT CURRENT_TIMESTAMP
```

Yani `updatedAt` (`@updatedAt`) ve `runId` (`@default(cuid())`) veritabanı tarafından
doldurulmaz. `workers/cordis/main.py` bu yüzden her ikisini de açıkça yazıyor.

Ölçüm komutu (tahmin etme, say):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='CordisOrganization' AND is_nullable='NO' AND column_default IS NULL;
```

**Nasıl uygula:** Prisma dışından yazan her yolda (Python worker, ham SQL, seed script,
psql) önce bu sorguyu koş; `@updatedAt` ve `@default(cuid()|uuid())` sütunlarını elle
doldur. `@default(now())` ve `@default(false)` için gerek yok.

İlgili: [[fabrika-phantom-model-bug-also-lives-in-the-python-worker]] ·
[[fabrika-live-postgres-for-evidence]]
