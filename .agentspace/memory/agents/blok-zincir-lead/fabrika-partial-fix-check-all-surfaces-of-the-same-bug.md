---
name: fabrika-partial-fix-check-all-surfaces-of-the-same-bug
description: Bir bug "düzeltildi" diye kapanırken aynı hatanın diğer yüzeyleri açık kalıyor — kapatmadan önce grep ile tüm çağrı yerlerini say
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Fabrika'da iki kez üst üste aynı desen çıktı:
- Plan kartı metinleri: düzeltme `pricing` + `admin` bloklarını düzeltti, aynı vaadin üçüncü yüzeyi
  `billingPanels.settings.plans` atlandı ve 8 çelişki canlı kaldı (commit 54e7a6a).
- M8 `prisma.organization` (şemada olmayan model): konsorsiyum yüzeyi düzeltildi (4cb82a9), ama
  `partners/page.tsx` ve `partners/leaders/page.tsx` hâlâ aynı olmayan modeli çağırıyordu.

**Why:** Ajan kendisine gösterilen ekranı düzeltiyor; hatanın sınıfını değil örneğini kapatıyor.
Rapor "bitti" diyor ve kanıt da gerçek — ama yalnız bir yüzeyin kanıtı.

**How to apply:** Bir kartı `done` yapmadan önce hatanın ANAHTARINI grep'le ve kaç çağrı yeri
kaldığını say (`grep -rn "prisma.organization" src/`, `PLAN_GRANTS` sayıları vb.). Görev tarifine
"envanter çıkar: dosya+satır" maddesini ilk sıraya koy — düzeltmeden önce sayım istemek, tek yüzey
düzeltmesini baştan engelliyor. Kapanış kanıtı olarak "grep artık boş" çıktısını iste.

İlgili: [[fabrika-fabrication-audit-must-cover-api-export-routes]]
