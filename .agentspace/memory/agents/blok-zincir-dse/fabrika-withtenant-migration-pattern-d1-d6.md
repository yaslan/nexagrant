---
name: fabrika-withtenant-migration-pattern-d1-d6
description: Fabrika'da sarmalayıcısız prisma çağrısını withTenant'a taşırken izlenen altı maddelik desen — sarmalayıcı kiracı sınırını verir ama satır sahipliğini VERMEZ, o yüzden sahiplik yüklemi yazının where'inde de durmalıdır.
metadata:
  type: project
updatedAt: 2026-09-10
---

TASK-MTVR7W9ZXO7M (tenant-bypass Dilim 1, M9 takvim) ile kurulan ve Dilim 2-5'in kopyalayacağı desen:

1. **İmza:** `tenantId`'yi zaten elde etmiş fonksiyonun gövdesi `return withTenant(tenantId, async (tx) => { … })` içine alınır, `prisma.` → `tx.`. `tenantId`'nin KAYNAĞI asla değişmez — bu bir erişim katmanı taşımasıdır, yetki değişikliği değil.
2. **Transaction sınırı:** oku-ve-yaz TEK sarmalayıcıya girer. İkiye bölmek `app.tenant_id`'yi iki kez kurar ve okuma-yazma arası atomikliği kaybettirir. Callback'ten çıkan hata transaction'ı geri alır.
3. **Sarmalayıcı ≠ satır sahipliği.** `withTenant` yalnız `app.tenant_id`'yi kurar; bu RLS AÇIK bir rolde kiracı sınırı verir, `userId` sınırı vermez, BYPASSRLS rolde hiçbir şey vermez. Sahiplik yüklemi yazının `where`'inde de durmalı: `delete({where:{id}})` + önceden JS kontrolü → `deleteMany({where:{id,tenantId,userId}})`.
4. **Test kurulumu:** `vi.mock('@/lib/db', () => ({ withTenant: withTenantMock }))` ve mock callback'e sahte `tx` verir. `prisma` mock'tan HİÇ export edilmez — böylece çıplak `prisma`'ya dönen bir regresyon test dosyasını import anında düşürür, sessizce geçmez. Ayrıca hangi `tenantId` ile girildiği gözlenebilir olur.
5. **Kritik iddiayı DB'ye sor:** satır varlığı `$queryRaw` ile ölçülür (`.live.test.ts` + `describe.skipIf(!dbReachable)`), dönüş sayısına DEĞİL — `deleteMany` count'una bağlanan test guard'sız `delete({where:{id}})` kodunda da geçer. Yanına karşı-olgusal kol konur (sahibi gerçekten silebiliyor mu), yoksa hiçbir şeyi silmeyen bozuk bir eylem de yeşil geçer.
6. **i18n korunumu:** `delete`→`deleteMany` dönüşümü yeni bir "0 satır" dalı yaratır. Eski Prisma P2025 hiçbir `CALENDAR_*` kodu taşımadığı için ekran `errors.unknown` gösteriyordu; yeni dalın fırlattığı hata da kod taşımamalı ve bu bir testle sabitlenmeli — yoksa erişim katmanı taşıması sessizce bir UX değişikliği taşır.

Mutasyonla ölçüldü: guard silinip eski `delete({where:{id}})` geri konunca 2 test kırmızı; guard yine silik ama `deleteMany({id,tenantId,userId})` kalınca 3 test yeşil. Tek fark silme yüklemi. Bkz. [[fabrika-verification-recipe-mutation-and-counterfactual]], [[fabrika-rls-green-on-a-bypassrls-connection]], [[fabrika-main-db-connection-bypasses-rls]].
