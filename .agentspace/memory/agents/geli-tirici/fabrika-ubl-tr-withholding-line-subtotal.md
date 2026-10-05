---
name: fabrika-ubl-tr-withholding-line-subtotal
description: UBL-TR satır seviyesinde tevkifat TaxSubtotal — yapı, doğrulama, gotcha'lar
metadata:
  type: project
  updatedAt: 2026-09-09
---

**Karar:** Patron (2026-09-09) — Tevkifat UBL-TR belgesinde satır seviyesinde `TaxSubtotal` olarak basılacak (TASK-MTU27WLNS25BZ).

## Yapı (Kanıtlanmış XML)

Satır blok'ta her tevkifatlı satır için iki `cac:TaxSubtotal`:

1. **KDV:**
   ```xml
   <cac:TaxSubtotal>
     <cbc:TaxableAmount>1000.00</cbc:TaxableAmount>
     <cbc:TaxAmount>200.00</cbc:TaxAmount>
     <cbc:Percent>20.00</cbc:Percent>
     <cac:TaxCategory>
       <cac:TaxScheme>
         <cbc:Name>KDV</cbc:Name>
         <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
       </cac:TaxScheme>
     </cac:TaxCategory>
   </cac:TaxSubtotal>
   ```

2. **Tevkifat:**
   ```xml
   <cac:TaxSubtotal>
     <cbc:TaxableAmount>200.00</cbc:TaxableAmount>  <!-- KDV'nin üzerine -->
     <cbc:TaxAmount>180.00</cbc:TaxAmount>  <!-- withholdingMinor -->
     <cbc:Percent>90.00</cbc:Percent>  <!-- withholdingRate × 100 -->
     <cac:TaxCategory>
       <cac:TaxScheme>
         <cbc:Name>Tevkifat</cbc:Name>
         <cbc:TaxTypeCode>604</cbc:TaxTypeCode>  <!-- withholdingCode -->
       </cac:TaxScheme>
     </cac:TaxCategory>
   </cac:TaxSubtotal>
   ```

Satır **TaxTotal/TaxAmount** = brüt vergi (KDV + Tevkifat). Çünkü UBL: `TaxTotal/TaxAmount = sum(TaxSubtotal/TaxAmount)`.

Tevkifatsız satır → yalnız KDV TaxSubtotal, tevkifat yok.

## Doğrulama

Gerçek örnek (3 satır, 9/10 + tevkifatsız + 5/10):
- Satır 1 tevkifat: 18000 kuruş (₺180)
- Satır 2: 0 (tevkifatsız)
- Satır 3: 6000 kuruş (₺60)
- **Toplam: 24000 kuruş = belge `totalWithholdingMinor`** ✓

## Gotcha'lar

**1. Geçersiz Oranlar (Non-Tenths):**

Türk tevkifat oranları ondalık-onda-bir katı (0.1, 0.2, ..., 0.9, 1.0). 0.67 gibi oranlar geçersiz.

- `withholdingRateLabel(0.67)` → boş string (etiket yok)
- XML'de o satırda Tevkifat TaxSubtotal basılmaz (oran doğrulama yapılırken)
- Bu "sessiz yanlış" değil, **açık davranış** (kaydı yok, XML'de yok)

**2. Belge Toplamı vs. Satır Toplamı:**

Satır TaxTotal'leri toplarsan brüt vergiyi alırsın.
Belge TaxAmount = payable VAT (KDV − Tevkifat).
İkisi eşit değil — bu normaldir (satırlar brüt, belge payable).

**3. Belge-Seviyesi Tevkifat:**

Hâlâ belge `<cac:TaxTotal>`'de ayrı Tevkifat TaxSubtotal yok — yalnız KDV oranları.
Tevkifat `TaxAmount`'ta (payable VAT) düşmesinde temsil edilir.

## İlgili

- [[fabrika-withholding-prints-at-line-level-in-ubl-tr]] — Patron kararı notu
- [[fabrika-verify-a-memory-notes-data-before-shipping-it]] — Oranları kendin doğrula
- Code: `src/lib/efatura.ts:389-420` (satır blok), `:280-284` (oranLabel)
