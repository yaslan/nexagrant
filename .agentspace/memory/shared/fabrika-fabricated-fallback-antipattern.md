---
name: fabrika-fabricated-fallback-antipattern
description: Fabrika kod tabanında yaygın anti-desen — DB/LLM hatasında uydurma rakam render edip DB'ye yazan "demo fallback"lar; CLAUDE.md kural 7 ihlali, gördüğün yerde temizle
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da tekrar eden ve **kural 7'yi (gösterilen her rakam bir kayda bağlı) doğrudan
ihlal eden** bir desen var: bir sayfa/action, veri gelmediğinde sabit kodlanmış "demo"
değerler üretip gerçekmiş gibi render ediyor — bazen veritabanına da yazıyor.

M6'da bulunan üç örnek (TASK-MTQ5ZF5ZRU5SM'de temizlendi):
- `generateAiEvaluation`: LLM çağrısı ya da JSON parse patlarsa sabit
  `{excellence: 4.2, impact: 4.0, implementation: 3.8}` + hazır güçlü/zayıf yön listesi
  **Evaluation tablosuna yazılıyordu** ve kullanıcıya kendi teklifinin değerlendirmesi
  olarak gösteriliyordu.
- `evaluations/page.tsx`: DB miss'te uydurma puanlı sahte bir Opportunity render ediyordu.
- `calibrateESR`: başka kiracının kaydında `{ calibration: 0 }` dönüyordu — gerçek,
  mükemmel kalibre bir sonuçtan ayırt edilemez.

Aynı deseni hâlâ taşıyan yerler (temizlenmedi, kapsam dışıydı):
`pipeline/[id]/consortium/page.tsx` → `DEMO_OPPORTUNITIES` sabiti.

Kural: veri yoksa **boş durum ya da hata** göster; asla uydurma rakam. Sessizce yutulan
`console.warn` + normal return da aynı sınıfta — form olmayan bir kaydı "başarılı" gösterir.
Fabrika'da bir modüle dokunurken bu deseni ara ve raporunda belirt.

Aynı ailenin bilinen bir örneği: [[fabrika-dashboard-hardcoded-kpi-fallback]] (KPI panosu
gerçek '0' geldiğinde sabit demo oranlarına düşüyor). Bu not onu iptal etmiyor, genelliyor.
