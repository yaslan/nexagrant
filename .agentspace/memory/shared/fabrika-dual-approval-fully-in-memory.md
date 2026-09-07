---
name: fabrika-dual-approval-fully-in-memory
description: src/lib/dual-approval.ts'nin HER iki yarısı da (M10 belge onayı VE Onay Merkezi/ApprovalRequest) DB'ye yazmıyor — cross-user onayla/reddet akışı gerçek tıklamayla asla doğrulanamaz
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/lib/dual-approval.ts` iki ayrı onay akışını barındırıyor ve **ikisi de kalıcı değil**:

1. **M10 belge onayı** (`submitForDualApproval`, `approveByDepartment`, `rejectDualApproval`) —
   TASK-MTR60M5ESB5PZ'de (2026-09-07, customer-support ajanı) ölçüldü: `DualApprovalState`
   bellekte üretilip istemciye dönüyor, `auditTrail`/`actorName`/`financeApprover` için şemada
   karşılık gelen bir tablo/sütun **yok**. Panel bugün dekoratif — hiçbir düğmeden çağrılmıyor.
   Rapor: `docs/agent-results/TASK-MTR60M5ESB5PZ-customer-support.md`.

2. **Onay Merkezi / ApprovalRequest** (`createApprovalRequest`, `approveApprovalRequest`,
   `rejectApprovalRequest`, `cancelApprovalRequest` — `approvals/client.tsx` → `actions.ts` →
   burası) — TASK-MTRHADHCV9W7A'da (aynı gün, blog-yazar ajanı) ölçüldü. Her fonksiyon sabit
   `{success:true, ...}` döndürüyor; `createApprovalRequest` `id: req-${Date.now()}` ile SAHTE
   bir kayıt üretiyor, hiçbir Prisma yazımı yok. Rol kontrolü de (`canRoleApprove`) hiç
   çağrılmıyor — checker rolü olmayan biri bile "onaylıyor".

   **Nasıl ölçüldü:** Playwright ile Alice olarak gerçek bir talep oluşturuldu (sayfada
   göründü, server action 200 döndü) → `withTenant('demo-tenant', tx => tx.approvalRequest
   .findMany(...))` ile DB'de sıfır satır bulundu → `page.reload()` sonrası UI'da da talep
   kayboldu (SSR yeniden prisma'dan okuyor, hiçbir şey yok) → farklı gerçek kullanıcıyla
   (admin@yasinaslan.com.tr) girişte "Onayımı Bekleyenler" sekmesi hep boş.

**Why:** Bu, iki farklı ajanın birbirinden bağımsız aynı kök nedene çarpmasıydı — dosyanın
tamamı, her iki API yüzeyiyle, tasarım gereği (ya da eksik bırakıldığı için) stateless bir
mock. `docs/DATA_MODEL.md`'de `ApprovalRequest`/`AuditEvent` tabloları şemada VAR
(`prisma/schema.prisma`) ama `dual-approval.ts` onlara hiç dokunmuyor.

**How to apply:**
- Onay Merkezi/M10 üzerinde **cross-user** bir akışı (checker'ın maker'ın talebini gördüğü/
  onayladığı) gerçek tıklamayla e2e kanıtlamak İSTE­NEMEZ — backend kalıcılık eklenene kadar
  imkânsız, sonsuz zaman kaybı. Tek-oturum içinde doğrulanabilenle (oluştur, kendi listende
  gör, iptal et, hata mesajları, modal metinleri) yetin ve raporda bunu açıkça yaz.
  `withTenant('demo-tenant', tx => tx.approvalRequest.findMany(...))` ile DB'yi doğrudan
  sorgulamak bu sınırı saniyeler içinde kanıtlar — uzun `signIn→reload→bekle` döngülerine
  girmeden önce bunu ilk adım yap.
- `dual-approval.ts`'e dokunma izni olmayan bir kart (i18n, UI, kozmetik) bu bulguyu
  RAPOR ET ama fonksiyonları kendi başına Prisma'ya bağlamaya kalkma — kalıcılık kararı
  (hangi tablo: yeni mi, `AuditEvent` mi) patron/lead kararı, TASK-MTR60M5ESB5PZ'de de
  aynı çizgi çekildi.

İlgili: [[fabrika-withtenant-set-config]] · [[fabrika-runtime-verification-recipe]] ·
[[fabrika-fabricated-fallback-antipattern]]
