---
name: fabrika-withholding-label-pattern
description: Derive tax/withholding rate labels from line items, not hardcoded; single-source conversion function
metadata:
  type: feedback
---

## Patern: Vergi oranı etiketlerini satırlardan türet, hardcoded yazma

**Kural:** Kullanıcıya gösterilen vergi oranı etiketi (KDV, tevkifat) hesaplanmış veri olmalı, sabit yazılı olamaz. Şablon `generateEfaturaHtml` ve `generateUblTrXml` aynı satırları okur → etiket ve gerçek tutar uyumlu olmalı.

**Alınan karar (TASK-MTU2Y588AL1XQ):** Tevkifat etiketi sabit "(9/10)" yazılıydı. VAT oranı deseni (satırlardan toplanan unique oranlar) izlenerek düzeltildi.

**Nasıl uygulan:**

1. **Single-source conversion:** Decimali kesir string'ine çeviren fonksiyon TEK YERde:
   ```typescript
   export function withholdingRateLabel(rate: number): string {
     const numerator = Math.round(rate * 10);
     return `${numerator}/10`;
   }
   ```
   - Kopya çıkarma; diğer dosyalara inline aritmetik yazmama.

2. **Gerçek oranları topla:** Satırlardan fiili oranları deduplicate et:
   ```typescript
   const withholdingRates = [
     ...new Set(
       invoice.lines
         .filter(l => l.withholdingRate && l.withholdingRate > 0)
         .map(l => l.withholdingRate!)
     ),
   ]
     .sort((a, b) => b - a)
     .map(rate => withholdingRateLabel(rate))
     .join(' + ');
   ```

3. **Etiket hiç basılmıyorsa:** Oranlar yoksa etiket satırı atlanmalı:
   ```typescript
   ${totals.totalWithholdingMinor > 0 ? `<tr>... (${withholdingRates}):</tr>` : ''}
   ```

4. **Testler:** Her oran kombinasyonu (0.9, 0.5, karışık, hiçbiri) birim test:
   - Çıktı HTML'den etiket satırı regex'le çıkart ve doğrula.

**Uzatmayan tasarım:** Karışık oranlar (0.9 + 0.5) "9/10 + 5/10" gibi gösterilir. VAT başlığı zaten bunu yapıyor — tutarlılık. (Satır başına ayrı total XML'ye yazılması başka bir kart olacak; bu etiket genel toplamı gösteriyor.)

**Kaynaklar:** CLAUDE.md kural 7 (belgede hesaplanmamış rakam yok), kural 9 (tek-kaynak para kuralı).
