---
name: fabrika-capability-parity-not-price-parity
description: Fabrika'da EUR 5 plan → USD 3 plan geçişinin eşleme kuralı — fiyat eşliği imkânsızdı, yetenek eşliği seçildi ve fazla kapasite seatsExtra'ya taşındı
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTR6QIE05ZKNH (2026-09-07, patron kararı: satış tarafı kazanır).
`free/starter/team/business/enterprise` (EUR) → `free/basic/pro/ultra` (USD).

**Neden fiyat eşliği yapılamadı:** USD merdiveninin tamamı ($45/$87/$147) eski
`team` fiyatının (€249) altında. Fiyata göre eşleme her müşteriyi ya düşürür ya
saçma bir yere koyar. Bu yüzden kural **yetenek eşliği** oldu:

    starter→basic (modül kümesi aynı) · team→pro (aynı) ·
    business→ultra (üst küme, M7 ekler) · enterprise→ultra
    free→free (satılık değil, aboneliksiz kiracının düştüğü durum; satırı kalmalı
    çünkü getEntitlements ona düşüyor)

**Kapasite kaybı nasıl önlendi:** `enterprise` 999 koltuk/999 alan veriyordu,
`ultra` 15/5 veriyor. Fark, satır taşınmadan **önce**
`Subscription.seatsExtra`/`workspacesExtra` üzerine eklendi — taşındıktan sonra
kaynağın ne olduğu bilinemezdi. Migration ayrıca eşlenmemiş abonelik kalmışsa
eski satırları silmeyi `RAISE EXCEPTION` ile reddediyor: `Subscription.planId`'de
**yabancı anahtar yok**, tek koruma bu.

**Açık kalan ürün sorusu:** 999 koltuklu sözleşmeli kurumsal tier fiilen kalktı.

Modül yetkisi artık `src/lib/billing/catalog.ts` → `PLAN_GRANTS`; manifestolar
`plansGrantingModule('M6')` ile türetiyor, `Plan.modules` seed izdüşümü.
Bkz. [[fabrika-server-side-price-source-decision]], [[fabrika-three-pricing-universes]].
