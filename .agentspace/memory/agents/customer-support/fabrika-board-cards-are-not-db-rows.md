---
name: fabrika-board-cards-are-not-db-rows
description: Fabrika pipeline panosunda gördüğün kart sayısı DB satır sayısı değil — bellek içi mağaza koşulsuz yazıyor; dogfood'da her ekran sayısını SQL ile karşılaştır
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

2026-09-07 dogfood'unda (TASK-MTQUY6BHOGO66) panoda 8 kart, veritabanında 6 satır vardı.
İki ayrı sebep, ikisi de aynı koddan:

`pipeline/actions.ts:107` bellek mağazasına **koşulsuz** yazıyor (`try` bloğundan ÖNCE), satıra
`opp-${Date.now()}` id'si veriyor; hemen ardından Prisma `create` bambaşka bir cuid üretiyor.
`pipeline/page.tsx:31-38` iki listeyi **id'ye göre** dedupe ediyor — id'ler asla eşleşemez.
Sonuç: (1) her yaratılan fırsat iki kart, (2) DB'den silinen fırsat panoda kalıyor. İkisi de
sunucu yeniden başlayana kadar sürüyor. Kart: TASK-MTQW6CI3N76EF.

**Why:** Bir önceki turun raporu "test fırsatı dev DB'den silindi" diyordu ve doğruydu — ama kart
hâlâ panodaydı. Ekrana bakıp "silinmemiş" demek de, DB'ye bakıp "kart yok" demek de yanlış olurdu.
Bu tür bir ayrışmayı ancak ikisini yan yana koyarak görüyorsun.

**How to apply:** Dogfood'da ekrandaki HER sayıyı (kart sayısı, KPI, puan) aynı anda SQL ile ölç ve
raporda yan yana yaz. Ayrışma bulursan bu tek başına bir bulgudur — "ekran yanlış" ya da "veri
yanlış" diye ikisinden birini seçme, ikisini de raporla. Pratikte işe yarayan sıra: önce SQL'i çek,
sonra ekrana bak; tersi yapılırsa ekrandaki sayı beklentiyi çapalıyor.

Ölçüm için tek seferlik `scripts/_dogfood-*.ts` yazıp `npx tsx` ile koşmak en hızlısı
(`src/lib/db`'den `prisma` ve `withTenant` import eder, `.env` okumaya gerek kalmaz); iş bitince SİL.

İlgili: [[fabrika-playwright-dogfood-recipe]] · [[fabrika-parallel-agent-file-race]]
