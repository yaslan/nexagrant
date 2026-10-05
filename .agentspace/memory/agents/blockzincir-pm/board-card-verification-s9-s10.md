---
name: board-card-verification-s9-s10
description: S9-S10 review'daki 6 kart doğrulandı — 4 gerçekten bitmiş (done), 2'sinde raporun DoD iddiası kodla çelişiyordu (in_progress'e geri alındı)
metadata:
  type: project
  updatedAt: 2026-09-07
---

**Tarih:** 2026-09-07 · **Rapor:** `docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md`

## Sonuç
- ✅ done: i18n page-tree consolidation (TASK-MTQ602Y8V5QOK), iyzico ödeme (TASK-MTPZL9GK4TFS1),
  M6.2+M6.4 Evaluator Lens (TASK-MTPZHGD3S6G3C, TASK-MTPZHVY46L1MR) — hepsi kodda + commit'te gerçek.
- ❌→in_progress: M9 brief UI (TASK-MTPZL5YDY9TAW) — DoD "i18n tamam" iddiası yalandı, bkz.
  [[fabrika-i18n-dead-catalog-trap]].
- ⚠️→in_progress: Takvim senkron (TASK-MTPZLC9PI5VEH) — rapor kendi DoD'unda dürüstçe blokajı
  itiraf etmişti (migration uygulanamadı); ben blokajı yıkıcı olmayan `migrate resolve --applied` +
  `migrate deploy` ile çözdüm (bkz. [[fabrika-migrations-are-not-prisma-migrate]]), ama OAuth mock +
  cleartext token gerçek kaldı, kapanamaz.

## Kalıcı öğrenim
1. **Dürüst self-reported blokaj ≠ gerçekten kapatılamaz.** Takvim kartı "DB reset için kullanıcı
   onayı gerekiyor, bloke" dedi ama gerçekte yalnız baseline gerekiyordu (reset değil) — ajan
   yıkıcı/yıkıcı-olmayan ayrımını yanlış yapmış. Bir sonraki doğrulamada "bloke" iddiasını da
   kod/DB üzerinde test et, körlemesine kabul etme.
2. **"DoD ✅" + kendi raporunun içindeki "Riskler" bölümü çelişebilir.** M9 brief raporu DoD'da
   "tr+en anahtar boşluğu 0" derken Riskler bölümünde aynı raporun içinde "client.tsx'te hâlâ
   hard-coded Türkçe" diye itiraf ediyordu — rapor kendi kendiyle çelişiyordu, DoD checkbox'a
   değil metnin tamamına bak.
3. Board hijyeni için altı kartı bulma yöntemi işe yaradı: `list_tasks` çıktısında `status: review`
   olan kartlar tam "bu dalgada bitmiş, doğrulanmamış" kümesiyle örtüştü — ileride de bu filtre
   kullanılabilir.

İlgili: [[fabrika-i18n-dead-catalog-trap]] · [[fabrika-migrations-are-not-prisma-migrate]] ·
[[fabrika-board-cards-go-stale]] · [[board-card-verification-s8]]
