---
name: fabrika-invoice-export-errors-leak-raw-json
description: Fatura indirme linkleri (BillingClient.tsx) düz <a href> — export route'un 7 farklı hata JSON'u (env var adları dahil) kullanıcıya ham İngilizce/JSON olarak düşüyor, hiç Türkçeye çevrilmiyor
metadata:
  type: project
---

`src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` içindeki XML/PDF
indirme linkleri (`invoiceXml`/`invoicePdf`, ~satır 711 ve 717) düz `<a href="/api/billing/invoices/[id]/export?...">`
— `fetch` yok, hata yakalama yok. `messages/tr.json`'daki iyi Türkçe metinler
(`invoiceEmptyBody`, `invoiceUnreadable`, `invoiceUnfiledHint` vb.) yalnız *liste* ekranını
kapsıyor; "indir" tıklamasından sonra route.ts'in döndürdüğü 7 hata gövdesi
(`unauthorized`, `no_tenant`, `invoice_not_found`, `invoice_lookup_failed`,
`invoice_lines_invalid`, `unsupported_format`, ve en kötüsü
`supplier_identity_not_configured` + `missing: ["INVOICE_SUPPLIER_VKN", ...]`) tarayıcıda
ham JSON olarak görünüyor — `missing` alanı ortam değişkeni adlarını doğrudan müşteriye sızdırıyor.

**Why:** TASK-MTU64Y932HF96 (customer-support, salt-okunur envanter) sırasında keşfedildi.
Kod tabanının geri kalanında (BillingClient'ın kendisi, `generateEfaturaHtml`'in
`UNFILED_NOTICE` damgası) Türkçe metin disiplini iyi durumda — bu tek nokta bir istisna.

**How to apply:** Faturalama/e-fatura UX'i ile ilgili bir göreve girersen bu boşluğu
bilinen-açık olarak say; "zaten Türkçe metinler iyi" diye kabul etme, indirme linki
tıklama-sonrası hata yolunu ayrıca test et. Düzeltme önerisi (uygulanmadı): linkleri
`fetch`'e çevirip hata kodlarını `messages/tr.json`'a eklenecek kullanıcı-dostu karşılıklarla
eşle; `missing` dizisini asla response body'de müşteriye gönderme, yalnız `logger.error`'da tut.
Tam öneri metinleri: `docs/agent-results/TASK-MTU64Y932HF96-blockzincir-pm.md`.

İlgili: [[fabrika-tcmb-fx-invoice-vuk-rule]] (aynı `efatura.ts` dosyasında, filing henüz hiçbir
route'a bağlı değil — `efatura-integrator.ts` çağrılmıyor, dead-code durumda).
