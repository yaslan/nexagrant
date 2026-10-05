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

**Kapsam genişledi (patron, 2026-09-08):** tabloya **27 AB üyesi** de girecek. Oranlar iki
bağımsız kaynakta birebir aynı çıktı (Tax Foundation ← EC *Taxes in Europe Database v4*,
veri tarihi 2026-01; ve euvat.dev). İki teknik tuzak: **FI %25,5** — oran alanı tam sayı
OLAMAZ (tutar yine minor unit tam sayı kalır, ondalıklı olan orandır); ve tabloyu doldurmak
"bu oranları tahsil edeceğiz" DEMEK DEĞİLDİR — bu yüzden ülke başına `regime` alanı
(`standard` · `reverse_charge` · `exempt` · `unknown`) kondu, AB üyeleri `unknown` başlıyor
ve `unknown` rejimli ülkeye fatura kesilmiyor (bilinmeyen ülkeyle aynı davranış).

**Kapsam dışı bırakılan hukuki soru:** "müşterinin ülkesinin oranı" bir sadeleştirmedir;
hizmet ihracatı istisnası, AB'de B2B **tersine yükümlülük (reverse charge)** ve B2C dijital
hizmette OSS/Birlik-dışı şema kaydı bu kuralı değiştirebilir — Türkiye mukimi bir satıcı
normalde AB KDV'si tahsil etmez. Kod patronun kuralına göre yazılıyor, veri yapısı bu ayrımları
sonradan taşıyabilecek şekilde kuruluyor, sorular mali müşavire bırakılıyor.
