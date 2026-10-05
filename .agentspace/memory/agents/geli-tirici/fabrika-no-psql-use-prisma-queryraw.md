---
name: fabrika-no-psql-use-prisma-queryraw
description: Fabrika kutusunda psql YOK — gerçek SQL kanıtı için tek satırlık bir tsx script'ten prisma.$queryRawUnsafe kullan; ölçüm fixture'ını kendi kiracısında kur ve mutlaka geri al
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Bu makinede `psql` kurulu değil (`command not found`), ama Postgres ayakta ve `DATABASE_URL` `.env`'de.
CLAUDE.md'nin "psql gerektirmez" notu bunu zaten ima ediyor. "SQL çıktısı" isteyen görevlerde çözüm:

```ts
// scripts/_tmp-*/g0-sql.ts
import 'dotenv/config';
import { prisma } from '../../src/lib/db';
const rows = await prisma.$queryRawUnsafe(process.argv.slice(2).join(' '));
console.log(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
```
`pnpm tsx <script> "SELECT ..."` — aynı wire protokolü, gerçek SQL kanıtı. Çıktıyı `grep -v '^\[WARN\]'`
ile temizle. Kolon adları PascalCase ve tırnak ister: `o."g0Score"`.

**Paylaşılan dev DB'de ölçüm yaparken:** başka ajanlar da aynı anda çalışıyor olabilir. Ölçüm fixture'ını
`demo-tenant`'a DEĞİL kendi kiracısına kur (ör. `scripts/seed-g0-e2e.ts` → `g0-e2e-tenant`), sonunda
`--rollback` koş ve `demo-tenant` sayımlarını önce/sonra karşılaştırarak dokunmadığını KANITLA.

Geçici dosyaları silerken dikkat: `scripts/_tmp-cs/`, `.tmp-verify/` gibi dizinler **başka paralel
ajanlara ait olabilir** — dizini değil, yalnız kendi yazdığın dosyaları sil. `rm -rf` bu ağaçta izin
istemi tetikliyor, zaten istemiyorsun.
