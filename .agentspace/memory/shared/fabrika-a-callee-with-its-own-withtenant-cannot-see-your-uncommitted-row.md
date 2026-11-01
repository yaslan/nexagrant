---
name: fabrika-a-callee-with-its-own-withtenant-cannot-see-your-uncommitted-row
description: Bir çağrıyı withTenant'a alırken, kendi withTenant'ını açan bir yardımcıyı da içeri almak kilitlenme değil SESSİZ YANLIŞ VERİ üretir — callee ayrı transaction'dan senin commit edilmemiş satırını göremez
metadata:
  type: project
  updatedAt: 2026-09-10
---

Tenant-bypass dilimlerinde bitişik çağrıları tek `withTenant`'a alırken, bloğun içinde kalan
yardımcının **kendi `withTenant`'ını** açıp açmadığına bak. Açıyorsa içeri alma.

TASK-MTVR9T834EPUC, `createOpportunity` (`…/pipeline/actions.ts`): iki `workspace.findFirst` +
`opportunity.create` tek scope'a alındı. Hemen ardından gelen satır:

```ts
const scored = await rescoreOpportunityG0(tenantId, created.id);
// src/lib/scoring/g0-compute.ts:458
//   return withTenant(tenantId, async (tx) => { computeG0ForOpportunity(tx, …) })
```

"Hepsi aynı işin parçası" diye onu da bloğun içine almak, iç içe bir interaktif transaction
açar: callee **başka bir bağlantıdan** bakar ve senin henüz commit edilmemiş `Opportunity`
satırını **göremez**. `computeG0ForOpportunity` hiçbir şey bulamaz, `null` döner, her yeni
fırsat sessizce **puansız** kalır. Atılan hata yok, kızaran test yok.

**Why:** [[fabrika-no-bare-client-inside-a-withtenant-callback]] ile aynı aileden ama başarısızlık
şekli farklı ve daha sinsi. Orada belirti kilitlenme (gürültülü, havuz dolunca görülür); burada
belirti **doğru görünen ama eksik veri**. İkisinin ortak kökü aynı: masum görünen bir yardımcının
içeride ne yaptığını okumadan sarmalayıcının içine almak. `deletedAt`/skor gibi türetilmiş
alanlar yazılmadığında ekran yine dolu görünür, o yüzden mutlu-yol e2e'si de yakalamaz.

**How to apply:** Sarmalayıcıya taşırken bloğun içinde kalan HER fonksiyon çağrısını aç ve şu üç
şıktan hangisi olduğunu söyle: (a) `tx` üzerinden gidiyor → içeride kalır; (b) çıplak `prisma`'ya
gidiyor → havuz tuzağı, dışarı hoist et; (c) **kendi `withTenant`'ını açıyor → dışarı, ve commit'ten
SONRA çağır.** (c) için gerekçeyi koda yorum olarak yaz, yoksa bir sonraki kişi "tek transaction
daha temiz" diye geri içeri alır. Testle bağlamak istersen: yaratılan satırın türetilmiş alanını
(burada `g0Score`) iddia et — `null` kalıyorsa (c) ihlal edilmiştir.
