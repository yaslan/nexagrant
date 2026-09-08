# GÖREV RAPORU: TASK-MTSWLWDONWA3W (Yabancı Para Faturada TCMB Kuru ve TL Karşılığı)

## FAZ 0 — TEK HÜKÜM VE ÖLÇÜM ANALİZİ

### 1. ADR-0002 Karar Durumu
`docs/adr/ADR-0002-foreign-currency-invoice-fx.md` belgesi incelendi. Belge **"Öneri"** statüsündedir ve patron/lider onayını beklemektedir. Üç ana seçenek değerlendirilmiştir:
- **(a) Yalnız TRY Fatura Kes**: Fatura her zaman TRY düzenlenir, tahsilat anındaki kur esas alınır.
- **(b) Döviz Faturası Kes + Kur/TL Karşılığı Ekle**: UBL-TR XML'ine `PricingExchangeRate` ve `TaxExchangeRate` alanları ile TL karşılıkları yazılır. (Önerilen)
- **(c) Yurt Dışı Müşteriye İstisna Faturası (`ISTISNA`)**: Yalnızca gerçek yurt dışı mukimleri için TL karşılığı zorunluluğu kalkar.

### 2. Kod Ağacında Gerçekleştirilen İnceleme (Ağaç Ölçümü)
`git log --oneline -- src/lib/efatura*.ts src/app/api/billing/invoices` çıktısı ve mevcut kod incelendi:
- Commit `311c902` ile PDF/HTML görünümündeki birim simgesi hataları ve tutar alan adları düzeltilmiş; TL karşılığı olmayan döviz faturalarının GİB'e gönderilmesi `foreignCurrencyFilingBlock` engeli ile durdurulmuştur.

### 3. Üçlü Liste

#### (a) Uygulananlar:
- PDF/HTML görünümünde dinamik para birimi simgeleri (`$`, `€`, `₺`) (`generateEfaturaHtml`).
- Para biriminden bağımsız tutar alan adları (`unitPrice`, `subtotal`, `grandTotal`).
- Faturanın kendi para biriminde minor unit cinsinden yuvarlama hesaplamaları (`calculateInvoiceTotals`).
- TL karşılığı ve TCMB kuru bulunmayan döviz faturalarının GİB'e gönderilmesini `blocked` / `FOREIGN_CURRENCY_FILING_BLOCK` kodu ile reddeden engel kapısı (`foreignCurrencyFilingBlock`).
- Minor unit cinsinden kur dönüşümünü ve yarım kuruş yarım-yukarı (`half-up`) yuvarlamasını gerçekleştiren `convertCurrencyMinor` fonksiyonu (`src/lib/money.ts`).
- Faturaya kayda bağlı `exchangeRate` nesnesi eklendiğinde UBL-TR XML çıktısında `<cac:PricingExchangeRate>` ve `<cac:TaxExchangeRate>` bloklarının standartlara uygun yazılması ve bu durumda gönderim engelinin kaldırılması (`foreignCurrencyFilingBlock` -> `null`).

#### (b) Yarım Kalanlar (Faz 1 Kapsamında Tamamlananlar):
- Kayda bağlı `exchangeRate` veri yapısının `EfaturaDocument` ve `InvoiceRecord` tiplerine eklenmesi.
- Döviz faturası XML çıktısında `PricingExchangeRate` ve `TaxExchangeRate` bloklarının üretilmesi.
- `money.ts` üzerinden minor unit tam sayı aritmetiği ve yarım kuruş yuvarlama testleri (`tests/efatura-foreign-currency.test.ts`).

#### (c) İnsan Kararı Bekleyenler (Kod Değil, İş Kararı):
- Fatura döviz cinsinden mi kesilecek, yoksa Stripe/tahsilat anındaki tutar TL'ye çevrilip TRY fatura mı kesilecek? (ADR-0002 a vs b).
- Kur hangi tarihte ve hangi göstergeye göre sabitlenir: ödeme/tahsilat anı mı, fatura düzenleme tarihi mi (VUK 280/385)?
- Canlı TCMB FX kur servisi entegrasyonu ve servis kesintilerinde fallback politikası.

---

## (1) Ne Yapıldı
1. `src/lib/money.ts` içerisine integer minor unit hassasiyetinde kur çevirimi ve yarım-yukarı (`half-up`) yuvarlama yapan `convertCurrencyMinor` fonksiyonu eklendi.
2. `src/lib/efatura.ts` içerisindeki `EfaturaDocument` ve `src/app/api/billing/invoices/[id]/export/invoice-document.ts` içerisindeki `InvoiceRecord` yapılarına kayda bağlı `exchangeRate` nesnesi eklendi.
3. `generateUblTrXml` fonksiyonuna faturada `exchangeRate` kaydı bulunduğunda UBL-TR standartlarına uygun `<cac:PricingExchangeRate>` ve `<cac:TaxExchangeRate>` XML bloklarını ekleyen mantık entegre edildi.
4. `foreignCurrencyFilingBlock` fonksiyonu faturada geçerli kayda bağlı bir `exchangeRate` bulunduğunda GİB gönderim engelini kaldıracak (`null` dönecek) şekilde güncellendi.
5. Birim testler (`tests/efatura-foreign-currency.test.ts`) kur çevirim yuvarlamalarını, XML çıktılarını ve gönderim engeli davranışını kapsayacak şekilde genişletildi (9/9 test yeşil).

---

## (2) Kanıt: Kopyalanmış Gerçek Çıktı

### 2.1 Döviz Faturası (USD) UBL-TR XML Çıktısı (PricingExchangeRate & TaxExchangeRate)
Kayda bağlı TCMB kuru (`calculationRate: 34.50`, `date: '2026-09-08'`) içeren USD faturası için üretilen gerçek UBL-TR XML parçası:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TICARIFATURA</cbc:ProfileID>
  <cbc:ID>FB-2026-000001</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>5f6b1c2a-0000-4000-8000-000000000001</cbc:UUID>
  <cbc:IssueDate>2026-09-08</cbc:IssueDate>
  <cbc:IssueTime>09:00:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:Note>ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur.</cbc:Note>
  <cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>
  <cac:PricingExchangeRate>
    <cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>34.5000</cbc:CalculationRate>
    <cbc:Date>2026-09-08</cbc:Date>
  </cac:PricingExchangeRate>
  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>34.5000</cbc:CalculationRate>
    <cbc:Date>2026-09-08</cbc:Date>
  </cac:TaxExchangeRate>

  <!-- Tedarikçi / Satıcı Bilgileri -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">1000000000</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>Test Tedarikçi A.Ş.</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test Cad. No:1</cbc:StreetName>
        <cbc:CityName>Ankara</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>Test V.D.</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  ...
```

### 2.2 Çürütme Sondası: XML Kur Üretimi Geçici Kaldırıldığında (KIRMIZI ÇIKTI)
`src/lib/efatura.ts` içerisindeki `PricingExchangeRate` / `TaxExchangeRate` bloğu geçici yorum satırına alındığında:
```
$ pnpm test tests/efatura-foreign-currency.test.ts

 ❯ tests/efatura-foreign-currency.test.ts (9 tests | 1 failed)
     × attaching a recorded exchangeRate clears the filing block and generates UBL-TR exchange rate blocks 5ms

FAIL  tests/efatura-foreign-currency.test.ts > a foreign-currency invoice may not be filed without its TL figures > attaching a recorded exchangeRate clears the filing block and generates UBL-TR exchange rate blocks
AssertionError: expected '<?xml version="1.0" encoding="UTF-8"?…' to contain '<cac:PricingExchangeRate>'
```

### 2.3 Çürütme Sondası: Kod Geri Yüklendiğinde (YEŞİL ÇIKTI)
```
$ pnpm test tests/efatura-foreign-currency.test.ts

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ tests/efatura-foreign-currency.test.ts (9 tests) 14ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

### 2.4 Tam `pnpm typecheck && pnpm lint && pnpm test` Çıktısı
```
$ pnpm typecheck && pnpm lint && pnpm test

> fabrika@0.1.0 typecheck /Users/macbook/AgentSpace/fabrika
> tsc --noEmit

> fabrika@0.1.0 lint /Users/macbook/AgentSpace/fabrika
> next lint
✔ No ES Lint warnings or errors

> fabrika@0.1.0 test /Users/macbook/AgentSpace/fabrika
> vitest run
 Test Files  121 passed | 2 skipped (123)
      Tests  1448 passed | 8 skipped (1456)
   Start at  21:37:16
   Duration  5.09s (transform 5.48s, setup 0ms, import 16.27s, tests 20.08s, environment 3.42s)
```

---

## (3) Değişen dosyalar
- `src/lib/money.ts`: `convertCurrencyMinor` kur çevirim ve yuvarlama fonksiyonu eklendi.
- `src/lib/efatura.ts`: `InvoiceExchangeRate` arayüzü eklendi, `EfaturaDocument` güncellendi, `generateUblTrXml` içine XML kur blokları eklendi ve `foreignCurrencyFilingBlock` kayda bağlı kur durumunda engeli kaldıracak şekilde güncellendi.
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts`: `InvoiceRecord` ve `buildInvoiceDocument` kur verisini geçirecek şekilde güncellendi.
- `tests/efatura-foreign-currency.test.ts`: Kur dönüşümü, XML çıktıları ve gönderim engeli kaldırma testleri eklendi.
- `docs/agent-results/TASK-MTSWLWDONWA3W-antigravity.md`: Bu sonuç raporu eklendi.

---

## (4) Riskler
- Kayda bağlı `exchangeRate` taşımayan döviz faturaları GİB'e gönderilmeye çalışıldığında `blocked` ile durdurulmaya devam eder. Bu bir risk değil, usulsüz fatura kesilmesini önleyen koruma mekanizmasıdır.

---

## (5) Açık sorular (Karar Soruları — İnsan Kararı Gerektirir)
1. **Karar Sorusu 1**: Fatura USD/EUR döviz cinsinden mi kesilecek, yoksa tahsilat anındaki kur üzerinden TL'ye çevrilip TRY faturası mı kesilecek? (ADR-0002 Seçenek a vs Seçenek b).
2. **Karar Sorusu 2**: Kur hangi tarihte ve hangi TCMB göstergesine göre sabitlenir: ödeme/tahsilat anı mı, fatura düzenleme tarihi mi (VUK 280/385)?
3. **Karar Sorusu 3**: Canlı TCMB FX kur servisi entegrasyonu hangi API üzerinden çekilecek ve TCMB kesintilerinde fallback politikası ne olacak?

---

## (6) Sonraki adım
- Yukarıdaki insan kararı sorularının patron/lider tarafından ADR-0002 üzerinde netleştirilmesi.
- Karar sonrası canlı TCMB FX API istemcisinin projeye bağlanması.
