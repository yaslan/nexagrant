---
name: fabrika-billing-panel-copy-has-three-surfaces
description: messages/*.json'da billingPanels altında pricing/admin/settings olmak üzere ÜÇ ayrı plan-kartı kopyası var, birbirinden bağımsız elle yazılıyor — biri düzeltilse diğerleri sessizce eski kalabilir
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTRIXGYXLLQR1: Pro plana M6 (Evaluator Lens) eklenirken keşfedildi —
`messages/tr.json` ve `en.json` içinde plan kartı metni **üç farklı yerde**,
birbirinden bağımsız, elle yazılı olarak duruyor:

- `billingPanels.pricing.plans.<id>` — herkese açık fiyatlandırma sayfası,
  serbest metin özellik listesi (`f1`..`f6`)
- `billingPanels.admin.plans.<id>` — admin panelindeki plan özeti, yine serbest
  metin (`f1`..`f4`)
- `billingPanels.settings.plans.<id>` — kiracının kendi ayarlar sayfası,
  makine-okunur `modules: "M1-M6, M8"` formatında + `seats`/`credits`

Bu görevde `pricing` ve `admin` yüzeyleri zaten doğruydu (`pricing.pro.f5` ve
`admin.pro.f4` aylardır "Evaluator Lens" diyordu — patronun "public sayfa
aylardır satıyor" dediği tam olarak bu). Sadece `settings.plans.pro.modules`
bir sürüm geride kalmıştı ("M1-M5, M8"). Yani drift her zaman aynı yönde
olmayabilir; üçünü de kontrol etmeden "kart metni tutarlı" denemez.

**Neden:** Hiçbiri `PLAN_GRANTS`'tan otomatik üretilmiyor — üçü de `src/lib/billing/catalog.ts`
değiştiğinde elle güncellenmesi gereken ayrı JSON alanları. [[fabrika-capability-parity-not-price-parity]]

**Nasıl uygulanır:** Bir modül bir plana eklenip/çıkarılırken sadece
`settings.plans` değil, `grep -n "M<n>\b"` ile üç `billingPanels.*.plans` bloğunu
da tara. `settings.plans.<id>.modules` alanı için artık bir nöbetçi test var
(`src/lib/billing/catalog.test.ts` → "plan card copy matches grantsFor()
exactly") — `pricing`/`admin` serbest metin alanları için henüz yok, o yüzden
oralarda drift sessiz kalabilir.
