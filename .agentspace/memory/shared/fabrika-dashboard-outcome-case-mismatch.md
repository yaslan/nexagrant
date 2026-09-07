---
name: fabrika-dashboard-outcome-case-mismatch
description: Fabrika dashboard başarı oranını %0 gösteriyor — kod ABOVE_THRESHOLD arıyor, DB above_threshold tutuyor (ölçüldü 2026-09-07)
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/lib/dashboard/fetch-metrics.ts:35` proposal outcome'unu
`['SUBMITTED','FUNDED','ABOVE_THRESHOLD']` ile karşılaştırıyor. Prisma şemasının kendi
yorumu ise küçük harf diyor: `funded | reserve | above_threshold | below`. Hiçbir kayıt
eşleşmiyor → "Başarı Oranı %0" gösteriliyor, gerçek değer %20 (5 fırsattan 1'i).

Aynı ailede ikinci hata: dashboard "G0→G2 süresi 0 gün" diyor, çünkü
`prisma/seed-opportunities.ts` tüm fırsatları aynı milisaniyede yaratıyor (5ms fark).

Ders: outcome gibi değer kümeleri elle string olarak karşılaştırılmamalı — enum ya da
paylaşılan sabit olmalı. UI'daki bir sayı "0" ya da "boş" görünüyorsa önce veri değil
KARŞILAŞTIRMA hatası aranmalı.

Kart: TASK-MTQTYXC0NUT0B. Kaynak ölçüm: docs/agent-results/TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md
İlgili: [[fabrika-g0-score-never-computed]]
