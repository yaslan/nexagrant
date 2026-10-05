---
name: fabrika-tsbuildinfo-lies-after-ambient-type-change
description: Fabrika'da ambient tip yüzeyi değişince tsconfig.tsbuildinfo bayatlıyor ve typecheck sahte hata yağdırıyor — kodu suçlamadan önce sil
metadata:
  type: project
updatedAt: 2026-09-08
---

`tsconfig.json`'da `incremental: true` var. Bir **ambient** tip yüzeyi değiştiğinde
(bir `.d.ts` eklenip kaldırılınca, bir compilerOption denenince, `prisma generate`
sonrası) `tsconfig.tsbuildinfo` bayat kalıyor ve `npx tsc --noEmit` **kaynakta hiç
değişiklik olmadığı halde** onlarca sahte hata döküyor.

Ölçüldü (TASK-MTSJHTJZSCILI, 2026-09-08): `prisma-override.d.ts` geçici geri konup
kaldırıldıktan sonra typecheck **28 hata** verdi — hepsi
`'res' is of type 'unknown'` / `Property 'applicationParts' does not exist on type '{}'`
biçiminde, yani "Prisma client üretilmemiş" imzası. `find src -newermt '-12 minutes'`
boştu: hiçbir dosya değişmemişti. `rm -f tsconfig.tsbuildinfo` sonrası aynı ağaçta
`TYPECHECK_EXIT=0`.

**Why:** Bu tuzak, olmayan bir regresyonu kovalamana ya da daha kötüsü — sahte hataları
"düzeltmek" için gerçek kodu bozmana yol açar. Sinyal aldatıcı çünkü hatalar makul görünüyor.

**How to apply:** `pnpm typecheck` beklenmedik şekilde kırmızıya döndüyse ve
(a) ambient bir `.d.ts` eklendi/kaldırıldıysa, (b) compilerOption denendiyse, ya da
(c) `prisma generate` koştuysa — ÖNCE `rm -f tsconfig.tsbuildinfo` yapıp tekrar koş.
Hata kalıyorsa gerçektir. Bir tip bayrağını ölçen her kartın adım listesine bunu yaz.
İlgili: [[fabrika-parallel-agent-file-race]]
