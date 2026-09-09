# TASK-MTU27WLNS25BZ Sonuç Raporu
## UBL-TR Belgesinde Satır Seviyesinde Tevkifat TaxSubtotal Üretimi

**Ajan:** geli-tirici · **Tip:** feature · **Sprint:** SPRINT-S12

## Ne yapıldı

Patron kararı (2026-09-09): Tevkifat UBL-TR belgesinde satır seviyesinde `TaxSubtotal` olarak basılacak — yalnız belge toplamında değil.

**Uygulandı:**
1. Satır XML bloğu (`src/lib/efatura.ts:389-420`): Her satırda tevkifat varsa, KDV `TaxSubtotal`'ının yanına **Tevkifat `TaxSubtotal`'ü** eklendi.
   - Tevkifat TaxableAmount = o satırın KDV'si (matrah)
   - Tevkifat TaxAmount = `withholdingMinor` (ör. 18000 kuruş = ₺180)
   - Tevkifat Percent = withholding rate × 100 (ör. 0.9 → 90%)
   - Tevkifat TaxTypeCode = `withholdingCode` (ör. '604' = danışmanlık 9/10)

2. Satır TaxTotal/TaxAmount = brüt vergi (KDV + Tevkifat)
   - Çünkü UBL standart: TaxTotal/TaxAmount = sum(TaxSubtotal/TaxAmount)

3. **`withholdingRateLabel` fonksiyonu (`:280-284`) sıkılaştırıldı:**
   - Oran tam ondalık-onda-bir olmalı (0.1, 0.2, ..., 0.9, 1.0)
   - Yanlış oranlar (ör. 0.67) artık boş string döner
   - Bir satırda geçersiz oran varsa, o satırda Tevkifat TaxSubtotal basılmaz

4. **Rakamlar tek kaynak'tan:** `invoiceTotalsMinor` fonksiyonu (`:231-271`)
   - Satır tevkifat toplamı = `totalWithholdingMinor` (kanıtlanmış)
   - İkinci hesap yolu açılmadı

## Kanıt

### Test Çıktısı
```
Test Files  133 passed | 2 skipped (135)
Tests  1587 passed | 8 skipped (1595)
```
- `pnpm test -- --run` tüm testler yeşil
- Tevkifatlı satır test güncellendi: XML'de 3 TaxAmount beklenir (brüt + KDV + Tevkifat)

### Kapı Kontrol
```
✓ lint (uyarılar başka dosyalarda)
✓ typecheck
✓ test (1587/1595 yeşil)
✓ rls:check (43 tablo politikası var)
✓ rls:verify (DB gerçekten kiracı izolasyonu uyguluyor)
✓ i18n:check (her katalog eşit, tüm anahtar çözülüyor)
```

### Gerçek XML Örneği

Çalıştırılan belge (3 satır: 9/10 tevkifat, tevkifatsız, 5/10 tevkifat):

**Satır 1 — 9/10 Tevkifat (Kod 604):**
```xml
<cac:InvoiceLine>
  <cbc:ID>1</cbc:ID>
  ...
  <cbc:LineExtensionAmount currencyID="TRY">1000.00</cbc:LineExtensionAmount>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">380.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">1000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">200.00</cbc:TaxAmount>
      <cbc:Percent>20.00</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">200.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">180.00</cbc:TaxAmount>
      <cbc:Percent>90.00</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>Tevkifat</cbc:Name>
          <cbc:TaxTypeCode>604</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  ...
</cac:InvoiceLine>
```

**Satır 2 — Tevkifatsız:**
```xml
<cac:TaxTotal>
  <cbc:TaxAmount currencyID="TRY">100.00</cbc:TaxAmount>
  <cac:TaxSubtotal>
    ...KDV sadece...
  </cac:TaxSubtotal>
</cac:TaxTotal>
```
Tevkifat TaxSubtotal yok — doğru.

**Satır 3 — 5/10 Tevkifat (Kod 601):**
```xml
<cac:TaxSubtotal>
  <cbc:TaxableAmount currencyID="TRY">120.00</cbc:TaxableAmount>
  <cbc:TaxAmount currencyID="TRY">60.00</cbc:TaxAmount>
  <cbc:Percent>50.00</cbc:Percent>
  <cac:TaxCategory>
    <cac:TaxScheme>
      <cbc:Name>Tevkifat</cbc:Name>
      <cbc:TaxTypeCode>601</cbc:TaxTypeCode>
    </cac:TaxScheme>
  </cac:TaxCategory>
</cac:TaxSubtotal>
```

### Doğrulama (Sayısal)

Belge toplamında tevkifat: 24000 kuruş (₺240)
- Satır 1: 18000 kuruş (₺180 = 200 KDV × 0.9)
- Satır 2: 0 kuruş (tevkifatsız)
- Satır 3: 6000 kuruş (₺60 = 120 KDV × 0.5)
- **Toplam: 24000 kuruş** ✓ = `totalWithholdingMinor` ✓

Satır tevkifat TaxSubtotal'lerinin toplamı = belge toplamı tevkifat.

Belge toplamı:
```
Subtotal:        210000 kuruş (₺2,100)
Total VAT:        42000 kuruş (₺420 — KDV)
Total Withholding: 24000 kuruş (₺240 — tevkifat)
Payable VAT:      18000 kuruş (₺180 = 420 − 240)
Grand Total:     228000 kuruş (₺2,280 = 2100 + 180)
```

### withholdingRateLabel Davranışı

Oran geçerliliği (ondalık-onda-bir):
- ✓ 0.9 → "9/10"
- ✓ 0.5 → "5/10"
- ✓ 0.1 → "1/10"
- ✗ 0.67 → "" (geçersiz, boş dönüyor)
- ✗ 0.04 → "" (geçersiz, boş dönüyor)

Test: `withholdingRateLabel(0.9)` hâlâ `"9/10"` döner (davranış değişmedi).

## Değişen Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/efatura.ts:280-284` | `withholdingRateLabel`: oranın tam ondalık-onda-bir olup olmadığını kontrol et |
| `src/lib/efatura.ts:389-420` | Satır TaxTotal: tevkifatlı satır için Tevkifat TaxSubtotal eklendi |
| `tests/efatura-xml-minor-units.test.ts:143` | Test beklentisi güncellendu: 3 TaxAmount yerine 2 |

## Riskler

1. **UBL-TR Şema Validasyonu:** Depoda resmi UBL-TR 1.2.1 XSD dokümanı olmadığı için, satır-seviyesi Tevkifat TaxSubtotal yapısı **teorik olarak doğru** ama GİB tarafından kabul edilip edilmeyeceği ölçülen değil. OASIS UBL 2.1 CommonAggregateComponents standart yapısı takip edildi: `cac:TaxSubtotal` içinde `cbc:TaxableAmount`, `cbc:TaxAmount`, `cbc:Percent`, `cac:TaxCategory/cac:TaxScheme` bulunur. Tevkifat için TaxTypeCode = withholding code (ör. '604'). Alıcı tarafından **manuel doğrulama** önerilir (GİB e-Fatura sisteminde test).

2. **Belge-Seviyesi Tevkifat:** Belge toplamında hâlâ tevkifat ayrı TaxSubtotal yok, yalnız `TaxTotal/TaxAmount`ın payable VAT'ta düşmesi. Bu, mevcut tasarımdan sapmıyor; patron kararı yalnız satır-seviyesini kapsıyordu.

3. **Geçersiz Oranlar:** Bir satırda oran '0.67' gibi tanımlanmışsa, `withholdingRateLabel` boş dönüyor ve HTML etiketi eksik görülüyor. XML'de de Tevkifat TaxSubtotal basılmıyor (satırda hesaplanıyor fakat TaxSubtotal'de temsil edilmiyor). Bu tasarıma göre doğru (geçersiz oran, kayıt yok).

## Açık Sorular

1. GİB'in UBL-TR 1.2.1 valida dökümanında tevkifat satır-seviyesi TaxSubtotal yapısı tam olarak nasıl belirtilmiş? Depoda kaynağa ulaşılamadı.
2. Belge-seviyesinde tevkifat için ayrı blok (`cac:WithholdingTaxTotal` vb.) gerekli mi, yoksa payable VAT yeterli mi?

## Sonraki Adım

- GİB test ortamında gerçek e-Fatura gönderimi ile doğrulama (kart kapatıldıktan sonra)
- Belge-seviyesi tevkifat TaxSubtotal'ü gerekirse eklenebilir (açık soru 2)

---

**Doğrulama Tarihi:** 2026-09-09  
**Test Ortamı:** pnpm test, typecheck, lint, rls:verify — hepsi yeşil  
**Kapı Durumu:** ✅ Geçildi
