# e-Fatura Hazırlık, Test & Preflight Sistemi Raporu

**Ajan:** blockzincir-pm  
**Tip:** feature/P1  
**Sprint:** SPRINT-S12  
**Kart:** `TASK-MTRJSOWFH6B45`  
**Tarih:** 8 Eylül 2026  

---

## 1. Yönetici Özeti (Executive Summary)

12–13 Eylül hafta sonu entegratör canlı verileri ve ortam değişkenleri gelmeden önce, e-Fatura alt yapısındaki 3 kritik boşluk kapatılmıştır:

1. **`src/lib/efatura.ts` Birim Testleri:** `validateVKN`, `validateTCKN`, `calculateInvoiceTotals` (minor unit / `money.ts` kuruş hassasiyeti) ve `generateUblTrXml` (UBL-TR 1.2.1 standart etiketi ve "ÖRNEK BELGE" damga denetimi) için kapsamlı birim test kümesi yazıldı.
2. **Sandbox Adaptörü:** `ADAPTERS` kayıt defterine `sandbox` anahtarıyla kaydedildi. Gönderim yolunu uçtan uca koşturur fakat `isFiledWithGib()` `false` kalır ve belge üzerindeki `"ÖRNEK BELGE — mali değeri yoktur"` damgası muhafaza edilir. Canlı modda (`testMode: false`) seçildiğinde açıkça hata verir.
3. **Preflight Komutu (`pnpm efatura:preflight`):** Ortam değişkenlerini `src/lib/env.ts` üzerinden okur, Satıcı Kimliği ve Entegratör bloklarını ayrı değerlendiren iki bloklu tablo basar ve tek cümlelik net sonuç hükmü verir.
4. **Go-live Günü Kontrol Listesi:** `docs/EFATURA_SETUP.md` sonuna adım adım sırayla hangi komutun koşulacağı ve hangi durumlarda durulacağı yazıldı.

---

## 2. Birim Test Sonuçları (`pnpm test`)

`tests/efatura.test.ts`, `tests/efatura-integrator.test.ts` ve `tests/efatura-unit.test.ts` test paketlerinin tamamı yeşil olarak geçmiştir.

```text
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ tests/efatura.test.ts (8 tests) 12ms
 ✓ tests/efatura-integrator.test.ts (9 tests) 27ms
 ✓ tests/efatura-unit.test.ts (16 tests) 14ms

 Test Files  3 passed (3)
      Tests  33 passed (33)
   Duration  146ms
```

### Test Edilen Fonksiyonlar & Kapsam

| Fonksiyon | Test Durumu | Açıklama |
|---|---|---|
| `validateVKN` | ✅ Passed | GİB modulo 9/10 algoritmasıyla geçerli sentetik VKN'ler (`1000000000`, `1000000105`, `1000000201`, `1000000306`) doğrulandı; 9 haneli, 11 haneli ve hatalı checksum VKN'ler reddedildi. Gerçek firma VKN'si kullanılmadı. |
| `validateTCKN` | ✅ Passed | 11 haneli TCKN algoritmasıyla geçerli sentetik TCKN'ler (`10000000146`) doğrulandı; 0 ile başlayan veya checksum hatalı TCKN'ler reddedildi. |
| `calculateInvoiceTotals` | ✅ Passed | Tutarlar `src/lib/money.ts` `toMinorUnits` üzerinden Int minor unit (kuruş) bazında hesaplandı (CLAUDE.md #9). Standart %20 KDV ve Kod 604 9/10 tevkifat tutarları doğrulandı. |
| `generateUblTrXml` | ✅ Passed | `UBLVersionID` (2.1), `CustomizationID` (TR1.2), `ProfileID`, `UUID`, `IssueDate`, `IssueTime`, `InvoiceTypeCode`, `AccountingSupplierParty`, `AccountingCustomerParty`, `TaxTotal`, `LegalMonetaryTotal` etiketlerini içeren iyi biçimli UBL-TR 1.2.1 XML üretimi teyit edildi. |

---

## 3. Sandbox Adaptör Kanıtı

Sandbox adaptörü `src/lib/efatura-integrator.ts` içerisindeki `ADAPTERS` kayıt defterine eklenmiştir.

### Kanıt 1: "ÖRNEK BELGE" Damgasının Durması & `isFiledWithGib() === false`
Sandbox adaptörü üzerinden faturanın gönderim yolu çalıştırıldığında:
- Outcome sonucu: `{ status: 'rejected', code: 'SANDBOX_SAMPLE', message: 'ÖRNEK BELGE — GİB\'e gönderilmemiştir...' }`
- `isFiled(outcome)` → `false`
- `isFiledWithGib(document)` → `false`
- Belge XML ve HTML çıktılarında `<cbc:Note>ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur.</cbc:Note>` damgası muhafaza edilmektedir.

### Kanıt 2: Canlı Modda (`EFATURA_INTEGRATOR_TEST_MODE=false`) Reddedilme
- Canlı modda `provider: 'sandbox'` seçildiğinde adaptör başlatıcısı hata fırlatır:
  `Sandbox integrator adapter can ONLY be used when EFATURA_INTEGRATOR_TEST_MODE is enabled (test mode)`
- `fileInvoice` sonucu: `{ status: 'unreachable', detail: '...EFATURA_INTEGRATOR_TEST_MODE...' }`

---

## 4. Preflight Üç Senaryo Koşu Çıktıları (`pnpm efatura:preflight`)

### Senaryo (a): Hiçbir Ortam Değişkeni Yokken (Boş `.env`)

```text
========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬─────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum   │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼─────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ EKSİK   │ (EKSİK)              │
└──────────────────────────────┴─────────────────┴───────────┴─────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ❌ EKSİK (INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY)
2. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

--- SONUÇ HÜKMÜ ---
📌 Fatura belgesi üretilmez. GİB'e gönderilmez, sebep: INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY, EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD eksik.
```

### Senaryo (b): Yalnız Satıcı Kimliği Doluyken

```text
========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬─────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum   │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼─────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ dolu    │ Fabrika Yazılım A.Ş. │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ dolu    │ 381***81             │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ dolu    │ Doğanbey V.D.        │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ dolu    │ Kızılırmak Mah. No:3 │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ dolu    │ Ankara               │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ EKSİK   │ (EKSİK)              │
└──────────────────────────────┴─────────────────┴───────────┴─────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ✅ TANIMLI (Fatura belgesi üretilebilir)
2. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

--- SONUÇ HÜKMÜ ---
📌 Fatura belgesi üretilir. GİB'e gönderilmez, sebep: EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD eksik.
```

### Senaryo (c): Tüm Değişkenler Doluyken (Sentetik Test Değerleriyle)

```text
========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬─────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum   │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼─────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ dolu    │ Fabrika Yazılım A.Ş. │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ dolu    │ 381***81             │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ dolu    │ Doğanbey V.D.        │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ dolu    │ Kızılırmak Mah. No:3 │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ dolu    │ Ankara               │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ dolu    │ sandbox              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ dolu    │ https://efatura-test.│
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ dolu    │ fabrika_api          │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ dolu    │ ••••••••             │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ dolu    │ true                 │
└──────────────────────────────┴─────────────────┴───────────┴─────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ✅ TANIMLI (Fatura belgesi üretilebilir)
2. Entegratör Bloğu     : ✅ TANIMLI (Entegratör bağlantısı kurulabilir)

--- SONUÇ HÜKMÜ ---
📌 Fatura belgesi üretilir. GİB'e gönderilir.
```

---

## 5. İlgisiz / Önceden Varolan Hatalar Raporu

Kural uyarınca bu görev kapsamında ilgisiz kodlara dokunulmamış, tespit edilen önceden varolan TypeScript uyarı/hataları adıyla raporlanmıştır:

- `src/lib/cordis-sync.ts`: Prisma input json type mismatch (`rawJson` property type)
- `src/modules/m2/server/actions.ts`: `ConceptTemplateSection[]` type casting assertion warning
- `src/modules/marketplace/server/actions.ts`: `MarketplaceListingRow.price` nullable type contract warning
- `tests/e2e/plan-entitlement.spec.ts`: `ModuleStatus` string parameter assignment mismatch

---

## 6. Definition of Done Checklist

- [x] `efatura.ts`'in 4 fonksiyonu için birim test yeşil (33 test passed)
- [x] Sandbox adaptörü kayıtlı, canlı modda reddediliyor, testi yeşil
- [x] Sandbox belgesinde "ÖRNEK BELGE" damgası + `isFiledWithGib()` false (kanıt raporda)
- [x] Preflight 3 senaryoda koştu, üç çıktı da raporda
- [x] `docs/EFATURA_SETUP.md` "Go-live günü" bölümü yazıldı
- [x] Hiçbir gerçek sır/VKN repoda yok
- [x] e-Fatura test paketi temiz
