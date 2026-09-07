---
name: fabrika-einvoice-integrator-seam
description: e-Fatura durumu — satıcı env'leri hazır, GİB entegratör arayüzü var ama ADAPTERS bilerek BOŞ; doldurulacak 12 değişkenin tek tablosu docs/EFATURA_SETUP.md
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTRJSOWFH6B45 sonrası e-Fatura'nın gerçek durumu (2026-09-07):

- **Satıcı kimliği hazır:** `INVOICE_SUPPLIER_NAME/_VKN/_TAX_OFFICE/_ADDRESS/_CITY`
  (+ opsiyonel `_COUNTRY`, `_EMAIL`) `src/lib/env.ts`'te, hepsi opsiyonel. Eksikse
  export rotası `503 supplier_identity_not_configured` + eksik değişken adları.
  Bu kısım TASK-MTRD9QBJ2G32E'de bitmişti; kart "yapılacak" diyordu, bayattı.
- **Entegratör seam'i yeni:** `src/lib/efatura-integrator.ts` —
  `EFATURA_INTEGRATOR_PROVIDER/_BASE_URL/_USERNAME/_PASSWORD/_TEST_MODE`.
  `readIntegratorConfig()` asla fırlatmaz, eksikleri adıyla sayar; `fileInvoice()`
  sonucu **değer** olarak döndürür (`not_configured` / `provider_unsupported` /
  `rejected` / `unreachable` / `filed`).
- **`ADAPTERS` sözlüğü bilerek boş.** Bir stub'ın `filed` dönmesi
  `isFiledWithGib()`'in belgeden "mali değeri yoktur" damgasını kaldırmasına yol
  açar — hiç gönderilmemiş kâğıt kendini mühürlü sanar. Kalan iş: sözleşme yapılan
  satıcının API'sine tek adaptör + zarf numarasını `Invoice.gibEnvelopeId`'ye yazan yol.
- **Patronun dolduracağı tek tablo:** `docs/EFATURA_SETUP.md` (12 değişken × nereden
  alınır / örnek biçim / zorunlu mu). `docs/DATA_MODEL.md` ve `docs/BILLING.md` işaret ediyor.
- Gönderim durumunun **tek ölçütü** `Invoice.gibEnvelopeId`; hem basılan belge hem
  Ayarlar → Faturalandırma paneli aynı alana bakar.

Bkz. [[fabrika-einvoice-real-record-or-404]] (patron kararı: belge gerçek kayıttan
üretilir, kayıt yoksa 404).
