---
name: fabrika-a-rate-table-needs-a-regime-not-just-a-number
description: Vergi/oran tablosunda oranı bilmek tahsil etmeye karar vermek DEĞİLDİR — satıra `regime` alanı koy, karar verilmemiş ülkeler `unknown` başlasın ve tabloda hiç yokmuş gibi reddedilsin
metadata:
  type: project
updatedAt: 2026-09-08
---

`src/lib/billing/vat-rates.ts` 27 AB üyesini de taşıyor ama **hiçbirine fatura
kesilmiyor**: her satırda `regime` (`standard` · `reverse_charge` · `exempt` ·
`unknown`) var ve yalnız `standard` fatura kestiriyor.

**Why:** Yalnız oran taşıyan bir tablo, "oran var → demek ki tahsil ediyoruz"
davetiyesidir. Türkiye mukimi bir satıcı normalde AB KDV'si tahsil etmez (B2B
tersine yükümlülük, B2C'de OSS). Oranı tabloya koymak veriyi kaydeder; rejimi
`unknown` bırakmak **kararın verilmediğini** kaydeder. İkisi ayrı bilgi ve
tabloda ayrı alan olmayı hak ediyor. Aynı sebeple iki ret ayrı raporlanıyor:
`country_not_in_table` (→ kaynaklı satır ekle) ve `regime_not_chargeable`
(→ mali müşavir hükmü). Zaten tabloda olan bir ülke için operatöre "ülkeyi ekle"
demek onu daire çizdirir.

**How to apply:**
- Oran/vergi/limit tablosu yazarken sor: "bu değeri **bilmek**, onu **uygulamaya**
  karar vermek mi?" Değilse ikinci bir alan aç, varsayılanı en kısıtlayıcı olan
  olsun (`unknown` = reddet).
- Ret sebeplerini birleştirme; çözümü farklı olan iki boşluk iki ayrı sebeptir.
- Oran alanını **tam sayı yapma**: Finlandiya %25,5. Tutar minor unit tam sayı
  kalır, ondalıklı olan orandır. Bkz. [[fabrika-prices-are-vat-exclusive-per-country]]
