---
name: fabrika-fault-injection-must-be-narrow-to-prove-an-alert
description: Bir alarm yolunu test ederken sahte istemcide "findMany hep patlasın" demek alarmın kendi dedup sorgusunu da öldürür ve yolu ÇALIŞMIYOR gibi gösterir — arızayı yalnız ölçtüğün sorguya enjekte et, tercihen gerçek sürücü hatasıyla
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTVRC1UGA3B6Y'de yeni yazdığım alarm yolu testte hiç satır üretmedi ve bir an "kod
yanlış" sandım. Değildi: sahte DB'de `failScan` **her** `findMany`'yi patlatıyordu,
`recordAlert` de yazmadan önce açık kopya aramak için `findMany` çağırıyor → arama
patlıyor, `recordAlert` `failed` dönüyor, hiçbir şey yazılmıyor.

**Kural:** gözlemlenebilirlik testinde arızayı ölçmek istediğin **tek sorguya** enjekte et.
Ayırt edici bir imzadan tanı — bende süpürmenin aday sorgusu `where.createdAt` taşıyan
tek sorguydu:

```ts
if (opts.failScan && a.where?.createdAt) throw new Error('connect ECONNREFUSED …');
```

Blanket arıza ayrı bir seçenek olarak dursun (`failEveryRead`) ve **başka** bir şeyi
kanıtlasın: "alarm da yazılamadığında iş yine de atmıyor".

İki ek not, ikisi de işe yaradı:
- **Sahte istemci yerine bellek-içi tablo.** Çağrıları kaydeden bir stub "alarm istendi"yi
  kanıtlar, "3 başarısızlık tek satıra katlandı"yı kanıtlamaz. `where` eşitliklerini,
  `resolvedAt: null`'ı, `orderBy/take`'i cevaplayan küçük bir mağaza yaz — dedup gerçekten
  koşsun.
- **Canlı doğrulamada uydurma `Error` atma.** Prisma'ya var olmayan bir sütun seçtirip
  gerçek `PrismaClientValidationError` aldım — `alerts-daily`'yi aylarca öldüren hatanın
  (`include: { tenant: true }`) tam sınıfı, ve mock'un asla yakalayamayacağı sınıf.
