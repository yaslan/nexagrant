---
name: fabrika-prisma-cannot-key-on-null
description: Bir tabloda hem "NULL anahtarlı" hem dolu satır tutuluyorsa Prisma bileşik-unique where'e null koyduramaz — tekilliği Postgres'te NULLS NOT DISTINCT ile kur, NULL satırı findFirst+create ile yaz
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Bir tablo iki tür satır tutuyorsa (ör. `TopicMatch`: `opportunityId IS NULL` → konu başına K1
eşleşmesi, dolu → fırsat başına G0 kanıt kaydı), tekillik anahtarına nullable bir kolon girer ve iki
tuzak birden çıkar:

1. **Postgres varsayılanı NULL'ları farklı sayar** — düz `UNIQUE (a, b, c)` ile `c IS NULL` olan
   satırlardan istediğin kadar eklenir, yani "konu başına tek K1 satırı" garantisi olmaz.
   Çözüm: `CREATE UNIQUE INDEX ... (a,b,c) NULLS NOT DISTINCT` (Postgres ≥ 15; buradaki yerel DB
   16.15). Prisma bunu şemada ifade EDEMEZ; `@@unique([...])` yaz, indeksi migration SQL'inde
   `NULLS NOT DISTINCT` ile kur — indeks adı Prisma'nın ürettiğiyle aynı olsun
   (`Tablo_a_b_c_key`), yoksa sürüklenme (drift) görünür.
2. **Prisma bileşik-unique `where`'e `null` kabul etmez** — `where: { a_b_c: { a, b, c: null } }`
   çalışmaz. NULL'lu satırı `findFirst({ where: { a, b, c: null } })` + `create`/`update` ile yaz;
   dolu anahtarlı satır normal `upsert` ile gider. Bu kalıbı yazan HER yer tekrarlar (ürün kodu,
   `prisma/seed.ts`, e2e fixture) — birini unutursan çalışma zamanında `Unknown argument` alırsın,
   `pnpm typecheck` yakalamaz (`src/types/prisma-override.d.ts` delege metodlarını gevşek tipler).

Kanıt: 2026-09-08, `prisma/migrations/topicmatch-per-opportunity/`. İkinci K1 satırı denemesi
`TopicMatch_tenantId_topicId_opportunityId_key` ile REDDEDİLDİ.

İlgili: [[fabrika-dev-server-stale-prisma-client]] (şema değişince ayakta olan `next dev` eski
istemciyi bellekte tutar; sayfa 500 verir) · [[fabrika-db-mock-invents-the-model]]
