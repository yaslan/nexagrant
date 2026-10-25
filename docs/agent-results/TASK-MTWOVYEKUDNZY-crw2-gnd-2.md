---
görev: TASK-MTWOVYEKUDNZY
kod: FA-47
ajan: crw2-gnd
tip: yayın
hüküm: "Kısmen bitti: FA-47 Faz 2 (CHECK E1+E2) FA-50 kartında yapıldı — PR #121, merge yok; FA-49 diff'iyle 1 bulgu kalıyor (billing.ts:82), karar K-570156 açık."
platform: mac (Darwin 27.0.0); ayrıntı FA-50 raporunda.
tarih: 2026-10-19
---

# FA-47 → FA-50 işaretçisi (ikinci kayıt; ilk rapor değiştirilmedi)

Bu raporun ilk sürümündeki "Faz 2" maddesi (CHECK E1+E2) **FA-50 / TASK-MVFMLDMCD9Q3K** kartında yapıldı. Tam rapor: `docs/agent-results/TASK-MVFMLDMCD9Q3K-crw2-gnd.md`.

- PR **#121** (dal `task/task-mvfmldmcd9q3k`, dev'e, merge YOK, "FA-49 merge'ünden sonra").
- K-570148 = A uygulandı: `bindTransactionToTenant` sonrası erişimler muaf, kapı bilgi satırı basıyor (`auth.ts:459` → bound `:503`, 3 erişim). Baseline'a kayıt yok.
- origin/dev 80271979'da kural tam FA-49'un 3 yerini yakalıyor (admin/tenants:25, billing.ts:82, plan-repository:391), fazlası yok.
- FA-49'un (commit edilmemiş) diff'iyle **1** kalıyor: `src/lib/billing.ts:82` (`const db = client ?? prisma`). İlk rapordaki #11 satırının "getEntitlements'ın client parametresini zorunlu yap" seçeneği artık kapı tarafından ölçülüyor → karar **K-570156** (öneri: takip kartıyla client zorunlu).
- `subscription-sync.ts:959` (ilk raporun "ek E1 adayı") E1 tarafından görülmüyor: tarayıcı yardımcıya verilen `tx`'i izlemez (belgelenmiş limit 3). Ayrı kart gerekir.
