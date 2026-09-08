---
name: fabrika-prices-are-vat-exclusive-per-country
description: Patron kararı — ilan edilen fiyatlar KDV HARİÇ; KDV faturada müşterinin ülkesine göre eklenir (TR %20, KW %0), bilinmeyen ülkede fatura kesilmez
metadata:
  type: project
  updatedAt: 2026-09-08
---

**Karar (patron, 2026-09-08):** "Fiyatlara KDV hariç, ülkelerin KDV oranlarına göre
ekle. Örnek Türkiye %20 Kuveyt %0."

İki şeyi birden değiştiriyor:
1. **İlan edilen fiyat KDV HARİÇ'tir** ve her yerde böyle etiketlenir (i18n, iki dil).
   Öncesinde fiyatların dahil mi hariç mi olduğunu söyleyen hiçbir kayıt yoktu.
2. **KDV faturalama anında müşterinin ülkesine göre eklenir.** Öncesinde tek global
   env değişkeni vardı: `INVOICE_VAT_RATE`.

Bağlayıcı uygulama kuralları (kart TASK-MTT1WUUS7MN7R):
- Ülke→oran **veri** olarak tutulur: oran + `source` + `effectiveFrom`. Koda serpiştirilmiş
  sabit yüzde YOK (CLAUDE.md kural 7).
- **Bilinmeyen ülke → fatura KESİLMEZ + `SystemAlert`.** TCMB kesinti kararıyla aynı
  felsefe: "herhalde %20'dir" demek mali belgeye uydurma rakam yazmaktır.
  Bkz. [[fabrika-credit-formula-decision-option-c]]
- **Vergi ülkesi `TenantBillingIdentity`'den okunur, `tenant.country`'den DEĞİL** —
  o alan kiracının kendi beyanı ve vergi kararına dayanak yapılamaz.
- KDV hesabı minor unit tam sayı, `src/lib/money.ts` üzerinden.

**Kapsam dışı bırakılan hukuki soru:** "müşterinin ülkesinin oranı" bir sadeleştirmedir;
hizmet ihracatı istisnası, AB B2B tersine yükümlülük ve yurt dışı KDV mükellefiyeti bu
kuralı değiştirebilir. Kod patronun kuralına göre yazılıyor, veri yapısı bu ayrımları
sonradan taşıyabilecek şekilde kuruluyor, sorular mali müşavire bırakılıyor.
