---
name: prisma-json-equals-compares-the-whole-document
description: Prisma'da Json kolonda `data: { equals: { key: v } }` TÜM belgeyi karşılaştırır — tek alan için `path: ['key'], equals: v` şart; bu kalıp sessizce hiç eşleşmeyen muhafızlar üretir
metadata:
  type: project
updatedAt: 2026-09-08
---

Prisma'da bir `Json` kolonda

```ts
where: { data: { equals: { stripeEventId: eventId } } }   // YANLIŞ
```

"stripeEventId alanı bu olan satır" DEĞİLDİR — `equals` **tüm belgeyi**
karşılaştırır, yani yalnızca `data` alanı tam olarak `{"stripeEventId":"..."}`
olan satırla eşleşir. Gerçek satırlar hep fazladan anahtar taşıdığı için sorgu
**hiçbir zaman eşleşmez** ve arkasındaki muhafız sessizce yok hükmündedir.
Doğrusu alan yolu:

```ts
where: { data: { path: ['stripeEventId'], equals: eventId } }   // DOĞRU
```

Bu Fabrika'da TASK-MTSY88Q6AMCGB'de üç Stripe webhook işleyicisinde birden
bulundu (`src/lib/billing/subscription-sync.ts`). Sonuç: tek Stripe olayı iki
kez işleniyor, 2 denetim satırı + 2 `monthly_grant` kredi hibesi yazıyor ve
iptal edilmiş bir aboneliği ACTIVE'e diriltiyordu.

Kalıcı dersler:

1. **Bu kalıbı depoda ara.** `data: { equals: {` ifadesi Json kolonlarda
   neredeyse her zaman kusurdur. Aynı hata üç yere kopyalanmıştı; düzeltirken
   tek bir yardımcıya indirmek tekrarını engeller.
2. **Mock'lu birim test bunu ASLA yakalayamaz.** Bir Json filtresinin eşleşip
   eşleşmediğine Postgres karar verir; mock istemci kendisine öğretilen cevabı
   döner. Bu sınıf kusur yalnız canlı DB testiyle ölçülür
   ([[live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs]]).
3. **Muhafız "eşleşmiyor" kusurunun yan etkisi para olabilir.** Ölçerken
   yalnız "ikinci satır yazıldı mı" diye bakma; kredi/fatura/durum
   diriltmesi gibi ikincil etkileri de say — Stripe retry penceresi 3 gün
   olduğu için "iptalden SONRA gelen eski olay" gerçek bir senaryodur.
4. **Kalan boşluk:** oku-sonra-yaz muhafızı sıralı yeniden teslimi durdurur,
   eşzamanlı iki teslimi durdurmaz. Tam çözüm olay kimliği üzerinde unique
   constraint = migration.
