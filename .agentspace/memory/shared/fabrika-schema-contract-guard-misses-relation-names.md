---
name: fabrika-schema-contract-guard-misses-relation-names
description: schema-contract.test.ts'in repo-genelinde taraması yalnız phantom MODEL çağrılarını yakalar; phantom RELATION adları (include:{x:true}) sadece SCANNED listesindeki dosyalarda kontrol edilir — M2 bunun dışında kaldı
metadata:
  type: project
  updatedAt: 2026-09-07
---

[[fabrika-typecheck-is-blind-to-db-calls]]'de anlatılan repo-genelinde Prisma
guard'ının (`src/modules/m8/server/schema-contract.test.ts`) **iki farklı katmanı**
var ve ikisi aynı güçte değil:

1. **Repo-genelinde sweep** (`SWEEP_ROOT = 'src'`) — yalnızca `prisma.<model>`
   çağrısındaki **model adının** şemada var olup olmadığını kontrol eder
   (`prisma.organization` gibi). Bu katman her dosyayı tarar.
2. **Alan-seviyesi kontrol** (model + **ilişki** + kolon adı) — yalnızca
   `SCANNED` listesindeki dosyalarda çalışır, ve o liste bugün yalnız M8
   yüzeylerini içeriyor (`src/modules/m8`, `consortium.ts`, birkaç M8 sayfası,
   `api/v1/partners`).

Sonuç: **var olan bir modelde var olmayan bir ilişkiyi `include` etmek**
(`tx.opportunity.findFirst({ include: { topic: true } })` — `Opportunity` modeli
gerçek, ama `topic` ilişkisi şemada tanımlı değil, sadece `topicId String?` skaleri
var) repo-genelinde sweep'i **geçer** (model adı `opportunity` gerçek) ve
`SCANNED` listesinde olmayan her dosyada tamamen görünmez kalır. Tam da bu
yüzden M2'nin `src/modules/m2/server/actions.ts` ve
`src/app/api/concept-notes/[id]/export/route.ts` dosyalarındaki
`include: { topic: true }` / `include: { opportunity: true }` hataları
(TASK-MTRKV25PNBHPX, 2026-09-07) hem `pnpm typecheck` hem de bu guard tarafından
yakalanmadan production'a kadar geldi.

**Nasıl uygula:** Bir dosyada `include: { <isim>: true }` ya da
`where: { <isim>: { ... } }` görürsen — dosya `SCANNED` listesinde değilse bu
guard seni KORUMUYOR. `prisma/schema.prisma`'da o modelin gerçekten böyle bir
ilişki alanı tanımladığını (relation field, `@relation` ile) ELLE doğrula; sadece
scalar `xId` kolonunun var olması yeterli değil. Eğer ilişki gerçekten yoksa, düzeltme
şeması değiştirmek DEĞİL (ayrı bir mimari karar) — `xId` üzerinden ayrı bir sorgu
yazmaktır (bkz. TASK-MTRKV25PNBHPX çözümü: `actions.ts`, `export/route.ts`).

Guard'ı genişletmek (SCANNED listesini `src` geneline çıkarmak ya da ayrı bir
repo-wide relation-sweep eklemek) ayrı bir iyileştirme kartı olabilir — bunu
gördüğünde ilgili lead'e öner, kendi başına şemaya dokunma.

İlgili: [[fabrika-typecheck-is-blind-to-db-calls]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]
