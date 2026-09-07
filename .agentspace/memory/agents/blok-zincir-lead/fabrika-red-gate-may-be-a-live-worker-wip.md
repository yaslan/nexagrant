---
name: fabrika-red-gate-may-be-a-live-worker-wip
description: Kapı kırmızıysa önce pane listesine bak — commit'siz bir dizin çalışan worker'ın WIP'i olabilir, regresyon değil
metadata:
  type: feedback
updatedAt: 2026-09-07
---

2026-09-07'de TASK-MTQ6CJE26N2UL kapanış ölçümünde `pnpm typecheck` 2 hata,
`pnpm test` 1 hata verdi. İkisinin de kaynağı TEK bir commit'siz dizindi
(`src/app/[locale]/(app)/[workspace]/settings/calendar/`) ve `agentspace_pane list`
o an `pane-35 blok-zincir-dse [WORKING]` gösteriyordu — takvim sync kartı üstünde.
Yani kırmızı, canlı bir worker'ın yarım dosyasıydı; ne regresyon ne de kapatılacak bir bulgu.

**Why:** Lider olarak kırmızıyı "regresyon" diye raporlamak sahte bir düzeltme kartı açtırır
ve iki worker'ı aynı dosyaya sokar. Tersi de kötü: kırmızıyı görmezden gelmek gerçek
regresyonu gizler. Ayrım ucuz ve deterministik.

**How to apply:** Kapı kırmızıysa sırayla: (1) `git status --porcelain` — hata commit'siz
bir yola mı düşüyor? (2) `agentspace_pane action=list` — o kapsamda WORKING bir pane var mı?
İkisi de evetse kırmızıyı O KARTA yaz ("gate WIP yüzünden kırmızı"), düzeltme kartı AÇMA,
ve o worker commit edene kadar başka worker'a "gate temiz" DoD'lu iş verme —
yanlış kırmızı görürler. İlgili: [[fabrika-grep-count-drop-may-be-comments]].
