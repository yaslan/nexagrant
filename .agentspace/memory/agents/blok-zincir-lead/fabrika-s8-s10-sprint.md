---
name: fabrika-s8-s10-sprint
description: Fabrika S8-S10 bekleyen tüm kartları tek sprint kuyruğuna (sprint-1788728327788) bağlandı — 12 görev, bağımlılık zinciriyle otomatik ilerliyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

2026-09-06'da Fabrika'nın bekleyen tüm cekirdek kartları TEK sprint'e bağlandı:
`sprint-1788728327788` (agentspace_sprint, maxConcurrent=4). Sprint planı DİSKTE —
app/lider yeniden başlasa da devam eder; durumu `agentspace_sprint_status` ile sorgula,
hafızadan cevaplama.

Worker kuyrukları (per-worker serialization, boşta bekleme yok):
- geli-tirici: T1 tenant izolasyonu (TASK-MTQ5Y8EPT7FDA) → T7 M6 gerçek veri (TASK-MTQ5ZF5ZRU5SM)
  → T9 iyzico (TASK-MTPZL9GK4TFS1) → T12 lint kapısı (TASK-MTQ60SGW45T0X, en son)
- blok-zincir-dse: T2 G0 kanon (TASK-MTQ63RR8Z0G8E) → T8 M9.2 brief UI (TASK-MTPZL5YDY9TAW)
  → T10 takvim sync (TASK-MTPZLC9PI5VEH)
- blockzincir-pm: T3 E11.4+E11.3 review doğrulama → T6 docker/seed + E10.2 kart doğrulama
- ex-en: T5 sayfa ağacı tekilleştirme (TASK-MTQ602Y8V5QOK), T1'e bağımlı
- customer-support: T4 E11.2 feedback/triage e2e doğrulama
- blog-yazar: T11 marketing i18n/SEO regresyon, T5'e bağımlı

Çakışma önleme kuralı (bu planın omurgası): aynı dosyaya iki worker dokunmaz.
iyzico.ts ve marketing ağacı T1'e, takvim T8'e, lint HERKESE bağımlı yapıldı.
Ayrıntı: [[fabrika-parallel-agent-file-race]], [[fabrika-worker-panes-die-uncommitted]].

2026-09-06 ölçümü (baz çizgi): `pnpm lint` → 750 sorun / 537 hata, çıkış 1.
'demo-tenant' fallback ürün kodunda 11 yerde / 5 dosyada.
