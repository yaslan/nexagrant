---
name: fabrika-e2e-own-fixture-hides-route-bugs
description: Kendi kiracısını seed eden e2e testi yeşilken aynı rota demo-tenant'ta sonsuz iskelette takılabiliyor — M6 panel rotası örneği (2026-09-07)
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

`tests/e2e/m6-evaluator.spec.ts` gerçek tarayıcıyla `/[locale]/[ws]/opportunities/<id>/evaluations/panel`
rotasını açıyor, `EvaluatorForm` ve `EvaluationDashboard`'ı görüyor, iki locale'de rozeti doğruluyor —
ve GEÇİYOR. Ama test kendi fixture'ını kuruyor: `scripts/seed-m6-e2e.ts` ayrı bir kiracı
(`m6-e2e`), ayrı workspace, ayrı kullanıcı ve `Reviewer` + `Criterion` satırlarını yaratıyor.

2026-09-07 dogfood'unda (TASK-MTQUY6BHOGO66) aynı rota **demo-tenant'ta hiç açılmadı**: `loading.tsx`
iskeleti sonsuza kadar durdu — içerik yok, hata yok, zaman aşımı yok. İki farklı fırsatla
(`demo-opp-3`, `demo-opp-1`) dört navigasyonda tekrarlandı.

Veri eksikliği DEĞİL — demo-tenant fixture şekli tam: `Criterion` 4 satır, `Reviewer` 2 satır
(alice'in koltuğu dahil), `Evaluation(readerType=PANEL)` var. Sayfanın Prisma sorgusu birebir
kopyalanıp script'ten koşulduğunda **221 ms**'de doğru veriyle döndü. Yani sorun render/askıya alma
tarafında; kök neden izole edilmedi (kart: TASK-MTQW76AKXW8OP).

**Why:** Kendi kiracısını kuran bir e2e, **bileşenin** çalıştığını kanıtlar; **rotanın mevcut
kiracılar için** çalıştığını kanıtlamaz. Yeşil e2e bu yüzden "bu ekran çalışıyor" demek için yeterli
değil. [[fabrika-m6-disclaimer-surfaces]] "beş yüzey gerçek tarayıcıyla doğrulandı" diyor — doğru,
ama o doğrulama e2e fixture kiracısında; iki yüzey (EvaluatorForm, EvaluationDashboard) bugün
demo/beta kiracılarının hiçbirinde açılmıyor.

**How to apply:** Bir rotayı "çalışıyor" saymadan önce, e2e'nin kendi fixture'ıyla mı yoksa **seed
kiracısıyla mı** koştuğuna bak. Dogfood ederken her zaman `demo-tenant` (ve mümkünse bir beta
kiracısı) üzerinden yürü — e2e'nin dokunduğu kiracı üzerinden değil.

İlgili: [[fabrika-done-reports-can-be-wrong]] · [[fabrika-playwright-dogfood-recipe]]
