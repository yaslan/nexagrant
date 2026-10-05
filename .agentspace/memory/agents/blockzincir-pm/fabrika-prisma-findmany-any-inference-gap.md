---
name: fabrika-prisma-findmany-any-inference-gap
description: Fabrika'da prisma.<model>.findMany() TÜM modeller için `any[]` dönebiliyor — TopicMatch'e özgü değil, repo genelinde bilinen bir gap; scripts/rescore-g0.ts'te de elle-tip ile atlatılmış
metadata:
  type: project
---

`scripts/**` altında yazılan bir tsx script'te `await prisma.<herhangi-bir-model>.findMany({select:...})`
sonucu implicit-any hatası veriyorsa (`Parameter 'r' implicitly has an 'any' type` gibi), bu o modele
özgü bir sorun değil — **repo genelinde bir prisma type-inference gap'i**. İzole prob dosyasıyla
doğruladım: `prisma.opportunity.findMany()` (uzun süredir çalışan, iyi bilinen bir model) bile aynı
şekilde `any[]` dönüyor.

**Neden:** kesin kök nedeni bulamadım (muhtemelen Prisma 7'nin `$Result` koşullu tiplerinin
`moduleResolution: bundler` + birden fazla pnpm-hash'li `@prisma/client` kopyası altında
çözülememesi — `node_modules/.pnpm` içinde aynı anda `prisma@7.10.0` ve `prisma@8.0.0-rc.12`'ye
bağımlı iki farklı `@prisma+client@7.10.0_*` varyantı var). `pnpm prisma generate` sorunu ÇÖZMÜYOR
(denedim, hâlâ any dönüyor).

**Kanıtlanmış geçici çözüm (repo'da zaten kullanılıyor):** `scripts/rescore-g0.ts:53-59` bu sorunu
`findMany` sonucuna elle satır tipi vererek atlatmış:
```ts
const opportunities: { id: string; tenantId: string; ... }[] = await prisma.opportunity.findMany({...});
```
Aynı deseni `scripts/clean-orphan-topic-matches.ts`'te (TASK-MTQWBAJ2T5XSV) kullandım — `interface
TopicMatchRow {...}` tanımlayıp `findMany` ve ara değişkenlere elle tip verdim. `any` eklemedim.

**Nasıl uygula:** `scripts/**` altında yeni bir prisma sorgusu yazarken implicit-any hatası alırsan,
önce bunun modele özgü olmadığını (izole `prisma.opportunity.findMany` prob'uyla) doğrula, sonra
`rescore-g0.ts` desenini kopyala — modelin gerçek `select` alanlarına karşılık gelen bir interface
yaz. `src/` altındaki React/server-action kodunda bu sorunu görmedim (yalnızca `scripts/` altında,
muhtemelen farklı bir derleme yolundan geçiyor) — orada karşılaşırsan önce doğrula, körlemesine
aynı deseni uygulama.

**İlgili:** [[fabrika-agents-share-one-working-tree]]
