---
name: fabrika-tcmb-fx-invoice-vuk-rule
description: Fabrika'da yabancı para faturası için VUK kuralı ne istiyor (TL karşılığı, hangi kur, hangi tarih) ve karar ADR-0002'de bekliyor
metadata:
  type: project
  updatedAt: 2026-09-08
---

TASK-MTSWLWDONWA3W'de (FAZ 1 — ölçüm+ADR) araştırılan, kod yazılmadan
[`docs/adr/ADR-0002-foreign-currency-invoice-fx.md`](../../../../docs/adr/ADR-0002-foreign-currency-invoice-fx.md)
içinde önerilen karar. Faz 2 (kod) [[fabrika-no-prod-db-from-this-env]] ile
birlikte, TASK-MTSWL8ADKZKDM (Invoice yazma yolu) bittikten SONRA açılabilir
— ikisi de aynı `Invoice` modeline dokunuyor.

**Kural (web araştırmasıyla doğrulandı, GİB'in birincil UBL-TR PDF'i DEĞİL —
ikincil kaynak):**
- VUK madde 215 — döviz cinsinden fatura TL karşılığı şartıyla düzenlenebilir.
- 385 Sıra No.lu VUK Genel Tebliği — **yurt içi** işlemde TL karşılığı
  zorunlu (ihracatta değil).
- VUK madde 280 — kur, **fatura tarihindeki TCMB döviz ALIŞ kuru** (ödeme
  tarihindeki değil, satış/efektif kur değil).
- KDV, TL karşılığı üzerinden hesaplanır.
- Eksikse VUK 352 md. II-7 → ikinci derece usulsüzlük cezası.

**Fabrika'daki durum (2026-09-08):** `Invoice.currency` USD/EUR/TRY kabul
ediyor ama kur/TL-karşılığı alanı YOK; `src/lib/efatura.ts`'in
`InvoiceLineItem.unitPriceTRY` alanı adı yanıltıcı — TL'ye çevrilmeden
`currency` ne ise onu taşıyor. Hiç `Invoice` satırı henüz yazılmadı (yazma
yolu geliştiriliyor) — yani bu geçmiş bir hata değil, **ilk faturadan önce
kapatılması gereken tasarım eksiği.**

**ADR-0002 önerisi:** (b) döviz faturası + kur/TL-karşılığı alanları, (c)
gerçek yurt dışı müşteriye `ISTISNA` ile paralel — tek başına (c) yetmez
çünkü ölçülen (dev DB, PROD DEĞİL) kiracıların çoğu TR. Nihai karar patron/
lidere bırakıldı, henüz verilmedi.

**Faz 2'ye başlayacak kişi için açık uçlar:** TCMB kur tipi/tarihi/hafta
sonu kuralı netleşmedi (muhasebe kararı, ADR'de sorular listeli); UBL-TR
`PricingExchangeRate`/`TaxExchangeRate` alan adları GİB'in birincil
kılavuzundan teyit edilmedi.

**Zamanlama (2026-09-08'de eklendi):** `TASK-MTRJSOWFH6B45` (GO-LIVE
BLOKLAYICI, blok-zincir-lead) patronun GİB env'lerini **2026-09-12/13**
getireceğini not ediyor. ADR-0002 kararı o tarihten önce gelmezse ilk canlı
fatura (muhtemelen USD, ölçülen dağılıma göre) TL karşılığı olmadan
kesilebilir. Kart ikinci kez aynı bulguyla önüme geldiğinde (aynı gün) kod
YAZMADAN yeniden ölçtüm — değişen bir şey yoktu, tekrar ADR yazmak yerine
bu zamanlama riskini raporladım (`TASK-MTSWLWDONWA3W-blockzincir-pm-2.md`).
