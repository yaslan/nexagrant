---
name: fabrika-three-pricing-universes
description: Fabrika'da fiyat üç ayrı yerde koda gömülüydü ve sunucu hiçbirini bilmiyordu — kanonik katalog USD 3 plan (patron kararı, 2026-09-07)
metadata:
  type: project
updatedAt: 2026-09-07
---

Patron "admin ve ön paneldeki paketler uyuşmuyor" diye bildirdi. Ölçüm, uyuşmazlığın
görsel değil YAPISAL olduğunu gösterdi — üç ayrı fiyat evreni vardı:

1. **Kanonik sanılan:** `docs/BILLING.md` + `Plan` tablosu + `src/lib/billing.ts` +
   `src/lib/iyzico.ts` → **EUR 5 plan** (free/starter/team/business/enterprise).
   Yetkilendirme ve abonelik mantığı bunu kullanıyor.
2. **Ön panel** `pricing/PricingClient.tsx` → **USD 3 plan** (Basic $45 / Pro $87 /
   Ultra $147) + 7 kademeli indirim seçici + Ultra Lifetime $1.288.
3. **Admin** `admin/billing/client.tsx` → aynı 3 planın kopyası, ama indirim
   `price * 0.3` diye DONMUŞ; kampanya kademesi değişince geride kalıyor.

Yani müşteriye satılan paketle sistemin içeride tanıdığı paket aynı şey değildi.

**Bulunan P0 (kimse sormamıştı):** `src/app/api/billing/checkout/route.ts` Stripe tutarını
İSTEMCİNİN gönderdiği `price`/`originalPrice`/`discountPercent` alanlarından hesaplıyordu —
kodun kendi yorumu "a caller can name its own price" diyordu. `Math.max(50, ...)` alt sınırı
yüzünden Ultra 50 sente alınabilirdi.

**Patron kararı (2026-09-07):** kanonik katalog **USD 3 plan**; satış tarafı kazanır, iç
sistem (EUR 5 plan) ona uyacak şekilde emekliye ayrılır.

**Nasıl uygula:** fiyatla ilgili her işte önce `src/lib/billing/catalog.ts`'e bak — orası
tek kaynak. Panelde, seed'de ya da route'ta gömülü rakam görürsen bu bir regresyondur.
Tutarlar Int minor unit (cent) + currency; hesap `src/lib/money.ts` (CLAUDE.md kural 9).
