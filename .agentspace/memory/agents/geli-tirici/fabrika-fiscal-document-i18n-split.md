---
name: fabrika-fiscal-document-i18n-split
description: Mali bir belgeyi i18n'lerken metni ikiye ayır — GİB/UBL-TR'nin bir şeye verdiği ad (VKN, ETTN, e-Fatura, KDV, Tevkifat, TICARIFATURA) her dilde Türkçe kalır, sayfayı anlatan etiket katalogdan okunur; XML üretici etiket tablosunu OKUMAMALI
metadata:
  type: project
  updatedAt: 2026-09-10
---

Fatura gibi mali bir belgede "kullanıcıya görünen sabit metin" tek bir küme değildir; iki
kümedir ve yalnız biri çevrilir (TASK-MTTUSZF4QSFGU, commit `c7dab14`).

**(A) Çevrilmeyen:** GİB / UBL-TR 1.2.1'in bir şeye verdiği ad. `VKN`, `TCKN`, `ETTN`,
`e-Fatura`, `e-Arşiv Fatura`, `KDV`, `Tevkifat` ve kod değerleri (`TICARIFATURA`,
`TEMELFATURA`, `EARSIVFATURA`, `SATIS`, `ISTISNA`, `TEVKIFAT`). Bunların İngilizcesi
mevzuatta **var olmayan** bir şeyi adlandırır; ayrıca sayfa ile dosyalanan XML aynı alanı
farklı adla anmamalı. `src/lib/efatura.ts` → `GIB_TURKISH_TERMS` altında gerekçeleriyle.

**(B) Çevrilen:** sayfayı anlatan etiketler — "Ara Toplam (Matrah)", sütun başlıkları,
"SAYIN (ALICI)", yazdır düğmesi. `messages/{tr,en}.json` → `invoice.*`.

Üç kural, biri yapısal:

1. **XML üretici etiket tablosunu okumaz.** `GIB_TURKISH_TERMS.kdvSchemeName` var ama
   `generateUblTrXml` kendi literal'ini koruyor. Böylece bu modülde bir etiket düzenleyerek
   GİB'e gidenin değiştirilmesi mümkün değil. Kanıt de bedava geliyor: 4 fikstür faturanın
   XML'i öncesi/sonrası **bayt bayt aynı** (`cmp -s`).
2. **XML ile paylaşılan cümleyi çevirme.** `UNFILED_NOTICE` XML'in `cbc:Note`'una gidiyor →
   Türkçe kaldı, sayfa kendi çevrilmiş banner'ını basıyor. Aynı sebeple
   `exchangeRateStatement()` (TCMB cümlesi) Türkçe bırakıldı — İngilizce sayfada bu tek
   satır Türkçe görünüyor, bilinçli.
3. **`tr` değerleri eski literal'lerin karakteri karakterine aynısı olsun.** O zaman
   "Türkçe sayfa değişmedi" bir iddia değil, tek satırlık bir diff olur.

**Sabit metnin altında gerçek hata çıkabilir:** `${l.quantity} Adet` satırı `unitCode`'u yok
sayıyordu, `invoice-writer.ts` ise her abonelik satırını `unitCode: 'MON'` yazıyor — sayfa
"1 Adet" derken XML `unitCode="MON"` diyordu. "Adet" adlı bir anahtar yalanı sabitlerdi;
birim satırın kendi kodundan türetildi, tanınmayan kod için kelime uydurulmuyor (ham kod
basılıyor — [[fabrika-withholding-label-pattern]] ve vat-rates'in kaynaksız ülkeye yaptığının
aynısı). **Bir string'i kataloğa taşımadan önce "bu string veriyle uyuşuyor mu" diye sor.**

İlgili: [[fabrika-withholding-label-pattern]], [[fabrika-ubl-tr-withholding-line-subtotal]],
[[fabrika-billing-ui-lives-in-two-namespaces]]
