---
name: fabrika-systemalert-is-outside-tenant-cleanup
description: SystemAlert'in tenantId kolonu YOK — e2e afterAll'ların "where tenantId" temizlik deseni ona ulaşamaz, her koşu alarm enkazı bırakır
metadata:
  type: project
  updatedAt: 2026-09-10
---

`SystemAlert` tasarım gereği tenant-agnostiktir (`src/lib/observability/system-alert.ts` başlığı: RLS yok, `tenantId` kolonu yok, tenant içeriği yazılmaz).

Bunun görünmeyen bedeli: Fabrika'daki e2e temizlik deseni **"benim tenant'ıma ait her şeyi sil"**dir —
`tests/e2e/invoice-write-path.spec.ts` ve `tests/stripe-webhook-idempotency.live.test.ts` `afterAll`'ları
`invoice / tenantBillingIdentity / tenant`'ı `where: { tenantId }` ile siler. **`SystemAlert` bu desenin
ulaşamadığı tek tablodur.** Sonuç: her e2e koşusu alarmlarını arkada bırakır, tenant'ı siler, alarm öksüz kalır.

Ölçüm (2026-09-10): 262 açık alarmın 229'u `invoice_buyer_identity_missing`; meta'daki 229 tenantId'nin
**228'i artık var olmayan tenant**, 1'i canlı. Yani yığının %87'si test enkazı, gerçek üretim hatası değil.

**Nasıl uygulanır:** bir alarm yığınının "kök nedenini" bir ürün kartına bağlamadan önce, meta'daki
tenantId'leri `Tenant` tablosuna karşı sorgula. Ölü tenant oranı yüksekse kök neden ürün kusuru DEĞİL,
test temizliğidir — ve o ürün kartı kapansa bile yığın büyümeye devam eder.

**Temizlik eklerken tuzak:** `where: { tenantId }` ile hedefleyemezsin (kolon yok). Kaba `deleteMany`
paralel koşan komşunun alarmını siler — zaman penceresi + meta eşleşmesi gerekir. Bkz.
[[fabrika-parallel-agent-file-race]].

İlgili: [[fabrika-recordalert-has-two-writer-paths]], [[fabrika-alert-console-has-a-silent-300-row-cap]]
