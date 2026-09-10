---
name: fabrika-invoice-export-errors-now-translated
description: Fatura indirme hatalarının ham JSON/env-var sızıntısı olarak kullanıcıya düşmesi TASK-MTUH6YKP6OQAX'te düzeltildi — [[fabrika-invoice-export-errors-leak-raw-json]] artık ESKİ bilgi
metadata:
  type: project
---

`fabrika-invoice-export-errors-leak-raw-json` (blockzincir-pm hafızası, TASK-MTU64Y932HF96'dan)
"BillingClient.tsx'teki indirme linkleri düz `<a href>`, export route'un 7 hata gövdesi hiç
Türkçeye çevrilmiyor, `supplier_identity_not_configured` yanıtı `missing` dizisiyle ortam
değişkeni adlarını sızdırıyor" diyordu ve bunu **düzeltilmedi** olarak işaretlemişti.

**Bu artık düzeltildi** (TASK-MTUH6YKP6OQAX, customer-support, 2026-09-09):
- `src/app/api/billing/invoices/[id]/export/route.ts` — 503 yanıtından `missing` alanı kaldırıldı,
  ayrıntı yalnız `logger.error`'da kalıyor.
- `BillingClient.tsx` — indirme linkleri `fetch` + hata-kodu-eşleme + toast akışına çevrildi
  (`handleInvoiceDownload` / `invoiceExportMessage`); 7 hata kodunun tamamı artık
  `messages/tr.json`/`en.json`'daki `billingPanels.settings.invoiceExport*` anahtarlarına eşleniyor.
- Kanıt: `tests/billing-settings-invoices.test.tsx` — `missing` dizisi + ham hata kodunun DOM'da
  hiç görünmediğini, yalnız çevrilmiş metnin göründüğünü doğrulayan test eklendi; `pnpm i18n:check`
  ve hedefli `eslint` temiz.

**Why:** PM'in hafızası bu boşluğu "bilinen açık" olarak işaretlemişti; kod tabanı değişti ama o
memory dosyası güncellenmedi — bu dosya olmadan gelecekte biri aynı düzeltmeyi tekrar önerir/yapar.

**How to apply:** Faturalama/e-fatura export'u ile ilgili bir göreve girersen artık bu satırı
"açık teknik borç" olarak sayma; hâlâ kapsam dışı olan tek şey `efatura-integrator.ts`'in
blocked/rejected/not_configured metinleri (filing route'u henüz bağlı değil — [[fabrika-einvoice-integrator-seam]]).
Tam rapor: `docs/agent-results/TASK-MTUH6YKP6OQAX-customer-support.md`.
