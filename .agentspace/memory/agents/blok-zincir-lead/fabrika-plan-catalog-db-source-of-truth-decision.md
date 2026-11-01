---
name: fabrika-plan-catalog-db-source-of-truth-decision
description: Patron kararı — paket/fiyat yönetimi DB'ye taşınacak (Yol B, sürümlü PlanVersion), önce metin düzeltmesi ve temizlik
metadata:
  type: project
  updatedAt: 2026-09-07
---

2026-09-07, patron onayı — Admin "paket oluşturma ve fiyatlandırma" modülü için **Yol B**:
`PLAN_GRANTS` (kod) yerine **DB tek doğruluk kaynağı**, kod yalnız ilk tohum.

Tasarımın kritik noktası: paket düzenlenebilir olunca **satılmış sözleşme sessizce değişir**.
Bu yüzden `PlanVersion` (yayınlanan sürüm dondurulur, düzenleme yeni sürüm yaratır) ve
`Subscription.planVersion` (hangi sürüm satıldı) zorunlu. Fiyat kilidi zaten var
(`Subscription.lockedAmountMinor`); eksik olan **hak/grant** tarafının kilidi.
Kart maddeleri `PlanFeature` satırı olur; `kind=modül` satırı ancak o sürümün `modules[]`
listesindeki bir modülü gösterebilir → "M6 satılıyor ama verilmiyor" sınıfı DB'de imkânsızlaşır.

Şemanın ~%70'i hazırdı: `Plan`, `AddOnCatalog` (grantsModule/Seats/Credits/Workspaces),
`AddOn`, `CreditLedger` (bakiye sütunu yok, hep ledger toplamı), `ModuleCatalog`,
`isPlatformAdminSession` + `/admin/*` iskeleti.

Onaylanan sıra: (1) 10 maddelik plan kartı metin düzeltmesi, (2) ölü panelerin yarım kodunun
doğrulanıp indirilmesi, (3) Yol B Faz 1.
Görünürlük kararı (aynı gün): paketler genel olarak **herkese açık** satılacak, **ama "bu müşteriye
özel paket" de olacak** → Faz 1 kapsamında. Bu, `Plan.visibility(public|private|archived)` +
`PlanAssignment(planId, tenantId)` demek. Güvenlik kritiği: bir plan ancak public ise VEYA istekte
bulunan kiracıya atanmışsa checkout edilebilir — sunucu tarafında doğrulanır; yoksa id tahmin ederek
özel fiyat satın alınır (TASK-MTR6Q2IODYQRC'deki "Ultra 50 sente" hatasının aynı sınıfı).
`/pricing` özel paketi listelememeli ve bunun testi zorunlu.
Kart: TASK-MTRJ32BZBY2AI (Faz 1).

İlgili: [[fabrika-einvoice-real-record-or-404]], [[fabrika-dead-pane-work-measure-before-discarding]]
