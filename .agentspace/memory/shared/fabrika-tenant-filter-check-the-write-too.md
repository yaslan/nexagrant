---
name: fabrika-tenant-filter-check-the-write-too
description: Bir fonksiyonda kiracı filtresiz OKUMA bulduğunda aynı fonksiyondaki YAZMAYA da bak — Fabrika'da kapı motorunda okuma rapor edilmişti, asıl ağır kusur update({where:{id}}) idi
metadata:
  type: project
updatedAt: 2026-09-07
---

TASK-MTQZMLLZE1I29'da görev metni tek bir kusuru işaret ediyordu: `evaluateGate()` fırsatı
`findUnique({ where: { id } })` ile kiracı şartsız OKUYOR. Aynı fonksiyonun sonunda, kimsenin
bakmadığı yerde, geçen kapı `prisma.opportunity.update({ where: { id }, data: { stage } })`
çalıştırıyordu — yine kiracı şartsız. Okuma sızıntıdır; yazma **başka kiracının verisini
değiştirir**. İkincisi daha ağırdı ve görev tanımında yoktu.

**Kural:** Prisma'da kiracı denetimi yaparken `findUnique`/`findFirst` kadar `update`/`delete`/
`upsert` çağrılarını da tara. `update({ where: { id } })` tekil id ile çalıştığı için kiracı şartı
EKLENEMEZ — `updateMany({ where: { id, tenantId } })`'e çevirmek gerekir. Aynı kalıp
`pipeline/actions.ts`'in `assignOpportunityOwner`'ında zaten doğru uygulanmış ve yorumla
gerekçelendirilmişti; depoda örneği vardı, motor onu kaçırmıştı.

`grep -rn "\.update({" src/ | grep -v updateMany` bu sınıfın hızlı taraması.

İlgili: [[fabrika-prove-the-fix-against-the-real-database]]
