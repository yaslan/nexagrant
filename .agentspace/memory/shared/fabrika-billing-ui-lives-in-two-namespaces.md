---
name: fabrika-billing-ui-lives-in-two-namespaces
description: Fiyat rozetleri ÜÇ panelde birden yaşıyor (pricing, settings, admin) — biri düzeltilip diğer ikisi unutuluyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da aynı satış arayüzü ÜÇ yüzeyde duruyor ve i18n'de üç ayrı ad
alanına kopyalanmış (başlık "iki" diyor ama TASK-MTRD9EUQB33QV'de üçüncüsü
bulundu — başlığı değiştirmedim çünkü linkler ona işaret ediyor, ama sayı
üçtür):

- `/pricing` → `src/app/[locale]/pricing/PricingClient.tsx` → `billingPanels.pricing.*` (plan başına `f1`..`f6` özellik satırları)
- `/settings/billing` → `.../[workspace]/settings/billing/BillingClient.tsx` → `billingPanels.settings.*` (plan başına `seats`/`credits`/`modules`)
- `/admin/billing` → `src/app/[locale]/admin/billing/client.tsx` → `billingPanels.admin.plans.*` (plan başına `f1`..`f4`, daha kısa bir kopya)

Aynı anahtar adı (`lifetimeOwners`, `lifetimeNext`, `lifetimeKicker`, plan
özellikleri…) üç ad alanında ayrı ayrı var. Bir yüzeyi düzeltmek diğerini
düzeltmez ve grep "düzeldi" der: `billingPanels.pricing.lifetimeOwners`
kaydı sayarken `billingPanels.settings.lifetimeOwners` hâlâ "5 lisans sahibi"
yazıyordu (TASK-MTR962OV5YGVX, birinci tur).

TASK-MTRD9EUQB33QV'de (2026-09-07) `pricing` ve `settings` blokları patron
onaylı 10 düzeltmeyle senkronize edildi, ama `admin.plans.pro.f4` hâlâ
"Evaluator Lens (AB hakem simülatörü)" diyor — pro planı M6'yı içermiyor
(`M1-M5, M8`). Bu üçüncü kopya o görevin onaylı kapsamında yoktu, bilerek
dokunulmadı; hâlâ açık.

**Nasıl uygula:** faturalama/fiyat arayüzünde bir metin ya da rozet
değiştirirken anahtarı YALIN ADIYLA ara (`grep -rn "lifetimeOwners" messages/`
veya özellik metniyle `grep -rn "Evaluator Lens" messages/`), ad alanıyla
değil. Üç sonuç çıkabilir — hepsi bu işin kapsamındadır, patron onayı
hangisini kapsıyorsa yalnız onu değiştir, kalanını "açık soru" olarak bildir.
[[fabrika-three-pricing-universes]] [[fabrika-plan-card-copy-contradicts-plan-grants]]
[[fabrika-lifetime-sale-is-never-persisted]]
