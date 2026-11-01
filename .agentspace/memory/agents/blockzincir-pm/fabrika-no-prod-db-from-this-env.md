---
name: fabrika-no-prod-db-from-this-env
description: Bu ajan ortamından Fabrika üretim veritabanına erişim yok — DATABASE_URL yerel/dev'e işaret ediyor; "canlı DB'ye sor" diyen kartlarda bunu açıkça işaretle
metadata:
  type: project
  updatedAt: 2026-09-08
---

`src/lib/db.ts`'teki `prisma` singleton'ı bu ortamda `DATABASE_URL` yoksa
`postgresql://fabrika:fabrika@localhost:5432/fabrika`'ya düşüyor — ve bu
oturumda gerçekten öyle bağlanıyor. Bağlı DB, `pnpm db:seed`'in yazdığı demo
veri (birkaç demo kiracı, 1 abonelik, 0 gerçek fatura), üretim değil.

**Neden önemli:** Bir görev kartı "gerçek müşteri dağılımını canlı DB'ye sor"
gibi bir adım isteyebilir (örn. [[fabrika-tcmb-fx-invoice-vuk-rule]]). Sorguyu
çalıştırıp sayı üretmek KOLAY ama o sayı prod'u temsil etmiyor — sessizce
"gerçek dağılım şu" diye sunmak yanlış karara yol açar.

**Nasıl uygulanır:**
- Sorguyu yine de koş (Prisma `groupBy`, `src/lib/db.ts`'teki `prisma`
  singleton'ı ya da `createDbClient` üzerinden — `.tmp-*/` altında repo
  içinde geçici bir tsx betiği ile; scratchpad'den module resolution
  çalışmıyor çünkü proje `node_modules`'ını görmüyor).
- Sonucu MUTLAKA "bu dev/seed DB, üretim değil" notuyla birlikte raporla.
- Gerçek prod dağılımı gerekiyorsa bunu açık soru olarak bırak — prod DB
  erişimi olan kişiye (lider/patron) devret, kendin uydurma ya da dev veriyi
  prod'muş gibi sunma.

[[fabrika-verify-the-card-recheck-not-just-the-old-report]] ile aynı aile:
ikisi de "ölçtüğün şey gerçekten sorduğun soruya cevap mı veriyor" disiplini.
