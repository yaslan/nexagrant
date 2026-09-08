---
name: dual-approval-means-two-people
description: Fabrika'da "çift onay" kuralını uygulama kontrolüyle değil iki unique index'le kur — ve gönderimi sign-off saymayarak akışı iki kişilik tut
metadata:
  type: project
  updatedAt: 2026-09-08
---

M10 çift onayını kalıcı yaparken (TASK-MTSAIWF4ENUSL) işe yarayan tasarım, tekrar kullanılabilir:

**Dört-göz kuralı iki unique index'tir, iki `if` değil.**
- `@@unique([followupDocId, department])` → bir departman bir kez onaylar.
- `@@unique([followupDocId, actorUserId])` → bir kişi en fazla bir departmanı onaylar.

Uygulama tarafındaki kontrol (`refusalForDepartmentApproval()`) yalnız OKUNABİLİR GEREKÇE üretmek
için var; yarış durumunu index kesiyor. Testte hem saf fonksiyonu hem de ham `prisma.create` ile
index'i ayrı ayrı doğrula — "app kontrolü tek savunma hattı değil" iddiası ancak böyle kanıtlanır.

**Gönderimi (submit) departman adımlarıyla AYNI tabloya koyma.** Gönderimi dokümanın kendi satırına
(`FollowupDoc.approvalSubmitted*`), adımları alt tabloya yaz. Aksi halde `unique(doc, actor)`
gönderen kişiyi de kapsar ve akış üç kişi ister — kural bu değil, akışı açan kişi bir departmanı
hâlâ onaylayabilmeli.

**Ekrandaki aşamayı satırlardan TÜRET** (`deriveDualApprovalState()`), state'ten taşıma. Yanan bir
aşama = var olan bir satır. Bu, "banner sahte vitrin" sınıfı kusurun yapısal panzehiri.

**Server action'a durum nesnesi geçirme.** `departmentApproveAction(currentState, ...)` imzası bir
güvenlik açığıydı: server action argümanı istek gövdesidir, çağıran istediği akışı tarif edip
imzalatabilir. Yalnız `(docId, department)` al, durumu DB'den oku.

İlgili: [[fabrika-approvals-screen-is-a-stub]]
