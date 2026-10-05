---
name: fabrika-approvals-screen-is-a-stub
description: Fabrika /approvals ekranı gerçek ApprovalRequest satırlarını listeliyor ama Onayla/Reddet düğmeleri hiçbir şey yazmayan stub'lara bağlı — ApprovalRequest'i "kullanımda" sanma
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08'de ölçüldü. `src/app/[locale]/(app)/[workspace]/approvals/page.tsx` gerçek
`prisma.approvalRequest.findMany()` yapıyor, ama `approvals/actions.ts`'in çağırdığı
`createApprovalRequest` / `approveApprovalRequest` / `rejectApprovalRequest` /
`cancelApprovalRequest` (`src/lib/dual-approval.ts` sonundaki "compatibility helpers")
**hiçbir satır yazmıyor** — yalnız uydurulmuş bir nesne döndürüyor. Kullanıcı onaylıyor, sayfa
yenileniyor, karar kayboluyor: M10'da düzelttiğimiz kusurun birebir ikizi.

Pratik sonuçlar:
- `ApprovalRequest` tablosunu "zaten bu iş için kullanılıyor" diye reuse etme gerekçesi olarak
  KULLANMA; tabloya bugün yalnız GDPR testi yazıyor.
- Yeni bir onay akışını o tabloya bağlarsan satırların o ekranda ÇALIŞMAYAN düğmelerin altında
  görünür. Bu, reuse'un maliyet tarafı.
- Ayrı kart hak ediyor; ürün olarak "4-Eyes Onay Merkezi" navigasyonda görünüyor.

İlgili: [[dual-approval-means-two-people]]
