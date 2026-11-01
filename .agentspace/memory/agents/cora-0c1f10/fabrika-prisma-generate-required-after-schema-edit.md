---
name: fabrika-prisma-generate-required-after-schema-edit
description: Fabrika'da şemaya alan eklemek yetmez — pnpm prisma generate + dev sunucu restart şart; typecheck bu hatayı ASLA yakalamaz
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Bu repoda `prisma/schema.prisma`'ya yeni alan ekledikten sonra kod o alanı kullanıyorsa **iki ayrı adım** gerekir,
yoksa çalışma anında 500 alırsın:

```
Unknown field `deletionRequestedAt` for select statement on model `User`. Available options are marked with ?.
```

1. `pnpm prisma generate` — client `node_modules/.pnpm/@prisma+client@…/` altına üretiliyor
   (`node_modules/.prisma/client` **yok**; orayı aramak boşuna).
2. **Dev sunucuyu yeniden başlat.** Turbopack üretilmiş client'ı bellekte tutuyor; `touch src/lib/db.ts`
   ya da action dosyasına dokunmak yetmiyor — denendi, aynı hata devam etti.

## Neden statik kontroller bunu kaçırıyor

`src/types/prisma-override.d.ts` `@prisma/client`'ı gölgeliyor ve `PrismaClient`'ı `[key: string]: any` yapıyor
(bkz. [[fabrika-prisma-client-type-override]]). Bu yüzden **`pnpm typecheck` şema uyumsuzluğunu hiç görmez** —
olmayan bir alanı `select` etmek tertemiz geçer. Şema alanlarının doğruluğunu kanıtlamanın tek yolu gerçek bir
HTTP çağrısı ya da gerçek DB'ye karşı çalışan bir script.

## Migration deseni (bu repo)

`prisma/migrations/` düz `.sql` dosyaları tutuyor (`add-<konu>.sql` + `add-<konu>.down.sql`); klasör+`migration.sql`
biçimi bu repoda kullanılmıyor. Şema `prisma db push` ile senkronlanıyor — bunun bir sonucu var:
**partial index kullanma.** Prisma `WHERE`'li indeks ifade edemediği için partial indeks drift eder ve ilk
push'ta düz indeksle değiştirilir. Düz b-tree + şemada `@@index` = DB ile şema birebir aynı.

Geri alma testini **transaction içinde** yap — Postgres'te DDL transactional:
`BEGIN` → down.sql → sütunları say → up.sql → `ROLLBACK`. Dev DB'ye hiç dokunmadan tam kanıt.

İlgili: [[fabrika-runtime-verification-recipe]] · [[additive-table-extension-pattern]]
