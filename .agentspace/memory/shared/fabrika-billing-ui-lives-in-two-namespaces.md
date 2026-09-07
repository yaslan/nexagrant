---
name: fabrika-billing-ui-lives-in-two-namespaces
description: Fiyat rozetleri iki panelde birden yaşıyor — billingPanels.pricing düzeltilip billingPanels.settings unutuluyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da aynı satış arayüzü İKİ yüzeyde duruyor ve i18n'de iki ayrı ad
alanına kopyalanmış:

- `/pricing` → `src/app/[locale]/pricing/PricingClient.tsx` → `billingPanels.pricing.*`
- `/settings/billing` → `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` → `billingPanels.settings.*`

Aynı anahtar adı (`lifetimeOwners`, `lifetimeNext`, `lifetimeKicker`, plan
özellikleri…) her iki ad alanında ayrı ayrı var. Bir yüzeyi düzeltmek
diğerini düzeltmez ve grep "düzeldi" der: `billingPanels.pricing.lifetimeOwners`
kaydı sayarken `billingPanels.settings.lifetimeOwners` hâlâ "5 lisans sahibi"
yazıyordu (TASK-MTR962OV5YGVX, birinci tur).

**Nasıl uygula:** faturalama/fiyat arayüzünde bir metin ya da rozet
değiştirirken anahtarı YALIN ADIYLA ara (`grep -rn "lifetimeOwners" messages/`),
ad alanıyla değil. İki sonuç çıkıyorsa iki yüzey de bu işin kapsamındadır.
Aynısı bileşen için de geçerli: PricingClient'ta düzelttiğin bir rozet
BillingClient'ta ikizi olabilir. [[fabrika-three-pricing-universes]]
[[fabrika-lifetime-sale-is-never-persisted]]
