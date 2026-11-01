---
name: fabrika-prisma-client-has-three-copies
description: pnpm db:generate üretilen Prisma istemcisinin TypeScript'in OKUMADIĞI kopyasını tazeliyor — şema değişikliğinden sonra typecheck sessizce ESKİ tiplere karşı doğrular; üç kopyayı da senkronla
metadata:
  type: project
updatedAt: 2026-09-08
---

`node_modules` içinde üretilmiş Prisma istemcisinin **üç** kopyası var ve
`pnpm db:generate` bunlardan yalnız birini tazeliyor — **TypeScript'in okuduğunu değil.**

Ölçüldü (2026-09-08, `tsc --traceResolution`):

- `db:generate` şuraya yazıyor:
  `node_modules/.pnpm/@prisma+client@…/node_modules/.prisma/client`
- TypeScript şunu çözüyor (`@prisma/client/default.d.ts` → `.prisma/client/default`):
  `node_modules/.pnpm/@prisma+client@…/node_modules/@prisma/client/node_modules/.prisma/client`
- Üçüncü bir kopya da kökte duruyor: `node_modules/.prisma/client`

## Belirti

Şemaya model/alan ekle, `pnpm db:generate` koş — ve typecheck yeni şeyi **görmesin**:

```
error TS2344: Type '"tenantBillingIdentity"' does not satisfy the constraint
  'symbol | "$transaction" | "tenant" | … | "tenantProfile" | …'
error TS2353: 'paymentRef' does not exist in type 'InvoiceWhereInput'
```

`db:generate` çıktısı `✔ Generated Prisma Client` diyor, üretilen dosyada model **var**
(`grep -c TenantBillingIdentity …/.prisma/client/index.d.ts` → 462), ama tsc hâlâ eskiyi
okuyor. `tsconfig.tsbuildinfo` silmek **çözmez** — bu bir cache sorunu değil, çözümleme
sorunu (o yüzden [[fabrika-tsbuildinfo-lies-after-ambient-type-change]] ile aynı şey DEĞİL).

## Çözüm

`db:generate` sonrası üç kopyayı da tazelenmiş olandan senkronla:

```bash
SRC=$(find node_modules/.pnpm -type d -path '*@prisma+client@*/node_modules/.prisma/client' | head -1)
for D in $(find node_modules -type d -path '*/.prisma/client' -not -path "$SRC*"); do
  [ -f "$D/index.d.ts" ] && rsync -a "$SRC/" "$D/"
done
```

Yalnız `node_modules` dokunuluyor; her şey yeniden üretilebilir.

## Neden önemli

Ters yönü daha tehlikeli: şemadan bir alan **kaldırıldığında** typecheck onu hâlâ var
sanar ve silinmiş alana yapılan çağrı kapıdan geçer. Yani "typecheck 0 hata" bir şema
değişikliğinden sonra **tek başına kanıt değildir** — model/alanın gerçekten yeni tiplerde
olduğunu `grep` ile doğrula. İlgili: [[fabrika-prisma-generate-required-after-schema-edit]] ·
[[fabrika-typecheck-is-blind-to-db-calls]]
