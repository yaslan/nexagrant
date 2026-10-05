---
name: fabrika-withholding-rate-validation-logic-duplicate
description: Withholding rate validation happens in two places separately (withholdingRateLabel + generateUblTrXml guard) — consolidate into single helper to prevent consistency drift
metadata:
  type: project
---

## Kod Duplise Mantık: Tevkifat Oranı Geçerliliği

**Sorun:** Tevkifat oranı geçerliliğini kontrol eden mantık iki yerde bağımsız olarak yazıldı:

1. **`src/lib/efatura.ts:285-291`** — `withholdingRateLabel(rate: number): string`
   - Oran 0 < rate ≤ 1 ve exact tenth (0.1, 0.2, ..., 1.0) mı kontrol ediyor
   - Döndürüyor: Geçerli → "9/10", Geçersiz → ""

2. **`src/lib/efatura.ts:413-430`** — `generateUblTrXml()` inside Tevkifat TaxSubtotal üretimi
   - TASK-MTU27WLNS25BZ sonrası guard eklendi: `withholdingRateLabel(line.withholdingRate) !== ''`
   - Ama mantık burada da yazılabilirdi → iki kontrol noktası

**Sorun:** 
- Mantık değişirse (ör. yeni oran tipi kabul etmek istesek), iki yerde değişmesi lazım
- Consistency riski: bir yerde "exact tenth" başarısız olsa, diğeri hâlâ geçebilir (code review'de yakalanır, ama çalışma sırasında hata yapılabilir)

**İy Çözüm (future refactor):**
```typescript
// Helper function — tek doğruluk kaynağı
function isValidWithholdingRate(rate: number): boolean {
  if (rate <= 0 || rate > 1) return false;
  const numerator = rate * 10;
  return Number.isInteger(numerator);
}

// withholdingRateLabel'de kullan
export function withholdingRateLabel(rate: number): string {
  if (!isValidWithholdingRate(rate)) return '';
  return `${rate * 10}/10`;
}

// generateUblTrXml'de kullan
const withholding = line.withholdingRate && isValidWithholdingRate(line.withholdingRate)
  ? `...TaxSubtotal...` : '';
```

**Kapsamı:** Bu refactor bu görevde tutuldu (scope disiplini), ama future backlog'da tutulabilir.

**Kaynak:** TASK-MTU27WLNS25BZ, test yazımı sırasında ortaya çıktı.
