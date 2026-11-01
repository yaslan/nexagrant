---
name: fabrika-card-numbers-may-live-in-the-test-fixture
description: Kart "ekran şu uydurma rakamı gösteriyor" diyorsa rakamı ÜRÜN kodunda değil TÜM repoda ara — Fabrika'da en az bir kez kaynak testin fixture'ı çıktı, üretim kodu zaten doğruydu
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

TASK-MTRD91ZLKEQ3A "Faturalandırma paneli uydurma kota gösteriyor (3/6 koltuk,
500 kredi) + emekli `team` plan id'si" diyordu. Ölçüm:

- `3/6` ve `500` panelde **yoktu**. Panel `getEntitlements()` + `Membership.count()`
  okuyor; demo kiracıda gerçek değer **11 / 6** ve 500 kredi zaten kataloğun `pro`
  planının gerçek `aiCreditsMonthly` değeri (`src/lib/billing/catalog.ts`).
- `team` plan id'si üretim kodunda kullanılmıyordu; `RETIRED_PLAN_IDS.team → 'pro'`
  eşlemesi zaten vardı.
- Üçü de **`tests/billing-settings-lifetime-badge.test.tsx` fixture'ında** duruyordu
  (`ENTITLEMENTS` sabiti ve `currentPlanId="team"`). Kartı yazan büyük olasılıkla
  testi ya da test çıktısını okumuştu.

**Nasıl davranmalı:** kartın verdiği rakamı önce `grep -rn "<rakam>" src tests` ile
ara, sonra ekranı gerçek veriyle aç. Kart yanlışsa düzeltme uydurma — "kart yanlış,
ölçüm şu" diye yaz ve **kartın ruhunu** ara: o panelde gerçekten uydurma bir şey
vardı (sahte GİB fatura satırları, sahte VKN, uydurma entitlement yedeği), sadece
kartın işaret ettiği yerde değildi. Bkz. [[fabrika-fabricated-fallback-antipattern]],
[[fabrika-board-cards-go-stale]].
