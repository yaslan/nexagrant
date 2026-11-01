---
name: fabrika-prisma-generate-alone-changes-nothing
description: prisma generate'i kapıya eklemek hayalet-model çağrısını TEK BAŞINA yakalamaz — ambient declare module gölgelemez, BİRLEŞİR ve içindeki index signature her adı yutar; ama withTenant çıkarımını unknown'dan kurtardığı için yine de kapıda
metadata:
  type: project
  updatedAt: 2026-09-08
---

## Düzeltme (2026-09-08, TASK-MTSI7YQWUZOFH) — mekanizma iddiam YANLIŞTI

Bu dosya önceden "`declare module '@prisma/client'` üretilmiş gerçek tipleri **gölgeler**" diyordu.
Ölçüm bunu çürüttü: **gölgelemiyor, BİRLEŞİYOR.** Üretilmiş istemci varken gerçek tipler kazanıyor —
`prisma.tenant.findMany()` gerçek satır tipini döndürüyor; istemci gizlenince aynı çağrı `any`.
(Kanıt: üretilmiş `.prisma/client` dizinini `mv` ile gizleyip ölçüm tekrarlandı — teknik:
[[phantom-dependency-proof-by-hiding-it]].)

Pratik sonuç aynı kalıyor ama sebebi başka: `[key: string]: any` birleşmede **eklemeli** davranıyor
ve şemada olmayan HER adı kabul ediyor. Ölçüldü — istemci üretilmiş + eski override yerinde,
`prisma.organization.findMany()` → **0 hata**. Yani "generate'i ekleyelim, override kalsın" yolu bu
hata sınıfı için gerçekten sıfır fayda; kapıyı kapatan şey delegate adlarının **sayılması**.

## Bugünkü durum

- `src/types/prisma-override.d.ts` artık `[key: string]: any` yerine 71 adlık `ModelName` birleşimi
  taşıyor (`lowerFirst(model)`; gerçek bir generate çıktısıyla birebir doğrulandı). Hayalet model
  çağrısı `pnpm typecheck`'i **düşürüyor** — ayrıntı: [[fabrika-typecheck-is-blind-to-db-calls]].
- `pnpm db:generate` betiği eklendi; `pnpm gate`'in İLK adımı ve `ci.yml`'de lint'ten önce.
  Gerekçesi hayalet model DEĞİL: üretilmiş istemci yokken
  `withTenant(id, (tx) => tx.planAssignment.findMany(…))` **`unknown`** çıkarıyor (TypeScript
  delegate'in `any` dönüşünü `Promise<T>` içine ayrıştıramıyor), üretilmişken `{planId: string}[]`.
  Çağrı yerlerindeki elle tip argümanları bu yüzden hâlâ yük taşıyor — silme.
- `prisma generate` veritabanı ve `DATABASE_URL` istemiyor, ~300 ms.

## Kalan gerçek boşluk

Birleşim yalnız **model** granülerliğinde. Hayalet **sütun/ilişki** typecheck'e hâlâ görünmüyor;
onları `src/modules/m8/server/schema-contract.test.ts` yakalıyor ve o yalnız `src/` tarıyor.
Yani `prisma/seed-*.ts` ve `scripts/` içindeki hayalet sütunlar korumasız — canlı örnek:
`prisma/seed-m6-evaluations.ts:62,76` (`Opportunity.callId`, `Proposal.status` şemada yok, seed
çalışma zamanında patlar). Kapatmanın tek yolu override'ı tümden silmek: ölçüldü, **52 hata /
~20 dosya** (eski "144 / 51" ve dosyanın kendi "158 / 36" notu ikisi de eskidi).
