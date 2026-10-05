---
name: fabrika-server-priced-surfaces-must-not-price-in-the-browser
description: Fabrika'da bir fiyat DB'den geliyorsa o fiyatı gösteren HER yüzey sunucudan almalı — tarayıcıda priceLine() çağıran bir bileşen kaldıysa "okuduğun fiyat ≠ ödediğin fiyat" kusuru geri gelir
metadata:
  type: project
updatedAt: 2026-09-08
---

TASK-MTSHVKTSGC8A4 (commit `2015fac`) plan fiyatını statik `src/lib/billing/catalog.ts`'ten yayınlanmış `PlanVersion` satırına taşıdı. Kritik ders: fiyatın kaynağı DB olur olmaz, tarayıcıda fiyat hesaplayan her bileşen **bayat rakam** gösterir hâle gelir — TASK-MTR6Q2IODYQRC'nin ("Ultra 50 sente") kapattığı kusurun görsel kardeşi.

Fiyat gösteren yüzeyler (hepsi artık sunucudan besleniyor):
`/[locale]/pricing`, `/[locale]/(app)/[workspace]/settings/billing`, `/[locale]/admin/billing`, `components/cart/CartDrawer` (→ `POST /api/billing/quote`), `api/billing/checkout`.

Kurallar:
* Aritmetik tek yerde: `catalog.ts:priceEntry()`. Storefront bir `PlanVersion`'ı `PricablePlan`'a çevirip ona verir; `YEARLY_DERIVATION` yuvarlama kuralının ikinci kopyası olmamalı.
* Döngü seçici (aylık/yıllık) istemci kontrolü olduğu için sunucu **iki döngüyü de** hesaplayıp gönderir — istemciye liste fiyatı verip indirimi ona yaptırmak eski kusurun ta kendisi.
* Kampanya/kilit çözümü `billing/tenant-tier.ts:tierForTenant()` — quote ve checkout aynı fonksiyonu çağırmalı, yoksa çekmece kampanya fiyatı gösterirken checkout kilitli oranı tahsil eder.
* Liste okunamazsa **statik kataloğa DÜŞME**: "fiyat veremiyoruz" de (`measured: false`). Düşmek tam da stüdyonun değiştirdiği eski rakamı gösterir.

HÂLÂ AÇIK: hak-ediş (`getEntitlements` → `PLAN_GRANTS`) `PlanVersion`'ı okumuyor; stüdyo fiyatı değiştirir, koltuk/kredi/modül değişmez. `Subscription.planVersionId` şemada var, yazılmıyor.
