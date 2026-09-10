---
name: fabrika-withtenant-migration-can-keep-bare-prisma
description: Fabrika'da prisma.$transaction'ı withTenant'a taşırken platform tablolarına (Tenant, Plan) yapılan gerçek okumalar bare prisma'da kalabilir — [[fabrika-withtenant-migration-pattern-d1-d6]]'in "prisma hiç export edilmesin" kuralı her dosyada geçerli değil
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Durum

TASK-MTVU5DI4C96DB'de `src/lib/iyzico.ts`'i `prisma.$transaction` → `withTenant(tenantId, …)`'a
taşırken [[fabrika-withtenant-migration-pattern-d1-d6]]'in 4. maddesini uyguladım ama bir
noktada bilerek sapındım: o desen test mock'unda `prisma`'nın **hiç** export edilmemesini
öneriyor ("çıplak prisma'ya dönen regresyon import anında düşsün"). `iyzico.test.ts`'te
`prisma`'yı da bıraktım, çünkü `handleIyzicoWebhook` gövdesinin write-transaction'dan ÖNCEKİ
kısmı `prisma.tenant.findUnique` / `prisma.plan.findUnique` ile **gerçekten** platform
tablolarına (RLS yok, `Tenant`/`Plan` `prisma/rls.sql`'de yok) okuma yapıyor — bunlar
`withTenant`'ın içine taşınmadı, taşınmasına da gerek yok.

## Why

D1-D6'daki takvim kartı tüm gövdeyi `tx`'e taşımıştı (hiç platform-tablo okuması yoktu), o
yüzden "prisma hiç export edilmesin" orada doğru bir sıkı kapıydı — çıplak `prisma`'ya dönen
bir regresyon gerçekten anlamsızdı. iyzico'da durum farklı: `prisma.plan.findUnique` bare
client üzerinde kalmak **doğru** — `withTenant`'ın içine alınsaydı platform tablosu için
gereksiz bir `set_config` round-trip'i ve (teorik) bir yarış penceresi eklenirdi (bkz.
`subscription-sync.ts`'in kendi yorumu, "Plan is a platform table … asking for it while a
tenant transaction holds a pool connection needs a second one").

## How to apply

`prisma.$transaction` → `withTenant` taşımasında mock'tan `prisma`'yı çıkarma kararı otomatik
DEĞİL — önce sor: bu dosyanın `withTenant` çağrısından ÖNCEKİ/SONRAKİ kısmında platform
tablosuna (RLS'siz: `Tenant`, `Plan`, ya da `prisma/rls.sql`'in iki listesinde de olmayan
her şey) gerçek bir okuma var mı? Varsa `prisma`'yı mock'ta bırak (o okumalar zaten doğru
yerde), sadece `withTenant`'ı ekle. Yoksa D1-D6'nın sıkı kapısını uygula.

## Related

[[fabrika-withtenant-migration-pattern-d1-d6]], [[fabrika-run-a-handler-under-the-rls-role]]
