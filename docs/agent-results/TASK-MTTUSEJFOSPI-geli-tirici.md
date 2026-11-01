# TASK-MTTUSEJFOSPI — E-Fatura XML tutarları minor-unit tamsayıya taşındı

**Ajan:** BE-EN (Backend Mühendisi) · **Sprint:** SPRINT-S12 · **Proje:** cekirdek
**Branch:** `dev` · **Commit:** `fix(billing): compute the e-invoice XML amounts in minor units`

---

## 1. Ne yapıldı

### Kök neden — ölçüldü, doğrulandı ve bir noktada düzeltildi

Liderin tespiti doğru: `src/lib/efatura.ts` içindeki UBL-TR satır bloğu, aynı belgenin
toplamları `money.ts`'in kuralından gelirken, kendi tutarlarını **major-unit float**
üzerinde hesaplayıp `toFixed(2)` ile yuvarlıyordu. Tek bir satışta iki yuvarlama kuralı.

**Ancak liderin verdiği örnek vaka (`quantity=3`, birim fiyat `19.99`, KDV %20) sapmıyor** —
bunu ölçtüm ve raporluyorum. %20'de sapma matematiksel olarak **imkânsız**: kesin çarpım
`net × 20 / 100 = net / 5` olduğundan ve `net × 2` daima çift olduğundan yarım kuruşluk bir
berabere (tie) hiç oluşmaz; float hatası da eşiği geçmiyor. 1 – 3.000.000 kuruş aralığında
%20 için **sıfır** sapma buldum.

Sapma, Türkiye'nin fiilen uyguladığı **diğer** oranlarda gerçek:

| Vaka | Kesin (money.ts) | Float yolu (HEAD) | Fark |
|---|---|---|---|
| ₺10.25 × 1 @ **%18** | `1025×18/100 = 184.5` → **185** = `1.85` | `1.84` | 1 kuruş |
| ₺10.05 × 1 @ **%10** | `1005×10/100 = 100.5` → **101** = `1.01` | `1.00` | 1 kuruş |
| ₺1.13 × **0.5 adet** @ %0 | `0.5×113 = 56.5` → **57** = `0.57` | `0.56` | 1 kuruş (satır **matrahı**) |
| ₺10.05 × **10** @ **%1** | `10050×1/100 = 100.5` → **101** = `1.01` | `1.00` | 1 kuruş |

Son satır, `invoiceLineSchema`'nın kesirli `quantity`'ye izin vermesinden doğuyor
(`z.number().positive()`); orada sapan şey verginin değil satırın **kendi net tutarı**.

### Bildirilmesi istenen tutarsızlık — `money.ts` yorumu

Görev metni "yorum `vatOnNetMinor`'ın üç yerdeki kuralı birleştirdiğini söylüyor ama
`efatura.ts` hâlâ kendi float hesabını yapıyor" diyor. **Ölçüm sonucu daha ince:**

- Birleştirme `efatura.ts`'e **ulaşmıştı** — `invoiceTotalsMinor` (satır ~203) `vatOnNetMinor`
  ve `withholdingOnVatMinor`'ı gerçekten çağırıyordu.
- Birleştirme **`generateUblTrXml`'in satır bloğunda durdu**. Yani yorum *yanlış* değil,
  **eksik**: aynı dosyada, aynı belgede, toplamlar birleşik kuralı; onları oluşturan satırlar
  ayrı bir float kuralı kullanıyordu. Yorum bunu hiç anmıyordu.
- `withholdingOnVatMinor` yorumundaki "iki kopya" ifadesi ise doğruydu: XML satırları hiçbir
  zaman tevkifat rakamı basmıyordu (hâlâ basmıyor — aşağıda açık soru).

Yorumu bu gerçeğe göre düzelttim (`src/lib/money.ts`), uydurmadan ve kuralı değiştirmeden.

### Yapılan değişiklik

1. **`InvoiceLineItem.unitPrice` (major-unit float) → `unitPriceMinor` (minor-unit int).**
   Ölçüm: bugün major-unit float'tı — `invoice-document.ts:226` satırındaki
   `Number(toDecimalString(line.unitPriceMinor, currency))` saklanan tamsayıyı float'a
   çeviriyordu, `tests/invoice-document.test.ts` de `unitPrice === 2500` (250000 kuruş için)
   diye pinliyordu. Artık saklanan satır (`unitPriceMinor`) hiç dönüştürülmeden geçiyor.
2. **`invoiceTotalsMinor` satır kırılımını da döndürüyor** (`TaxTotalsMinor.lines`).
   XML üreticisi artık satır tutarlarını **yeniden hesaplamıyor**, bu tek hesabın sonucunu
   okuyor. Satır toplamı = alt toplam eşitliği böylece *inşa gereği* sağlanıyor, iki hesabın
   tesadüfen anlaşmasıyla değil.
3. **XML'e yazarken `toDecimalString(minor, currency)`** — `toFixed` ile para biçimlendirme
   `efatura.ts`'ten tamamen kalktı (dosyada kalan tek `toFixed` bir **yüzde** içindir, para değil).
4. **Belge `TaxTotal` bloğu artık orana göre gruplanıyor.** Eskiden tek bir `TaxSubtotal` ve
   içinde **sabit yazılmış `<cbc:Percent>20.00</cbc:Percent>` vardı** — %0'lık bir Kuveyt
   faturası kendisi hakkında "%20 KDV" beyan ediyordu (CLAUDE.md kural 7 ihlali). Artık her
   fiili oran için bir `TaxSubtotal`, kendi gerçek yüzdesiyle.
5. **Yazdırılabilir HTML de aynı minor-unit sonucu okuyor** (`invoiceTotalsMinor`), major-unit
   float görünümünü değil; "Hesaplanan KDV (%20)" etiketi de artık satırların gerçek
   oranlarından türetiliyor.
6. **`formatInvoiceAmount` minor-unit alıyor** ve `money.ts`'in `formatMoney`'sine devrediyor —
   ikinci bir `Intl` kopyası silindi (reuse > icat).

`money.ts`'teki yuvarlama kuralına **dokunulmadı**; ikinci bir kural yazılmadı. `any` /
`@ts-ignore` yok. Kullanıcıya görünen yeni sabit metin yok (KDV etiketi zaten var olan
metinden türetiliyor), dolayısıyla yeni i18n anahtarı gerekmedi.

---

## 2. Kanıt

### 2.1 KIRMIZI — mevcut float yolu elle hesaplanmış değeri tutturmuyor

Testler önce **HEAD'deki major-unit API'ye karşı** yazıldı ve koşuldu:

```
$ npx vitest run tests/efatura-xml-minor-units.test.ts

 ❯ tests/efatura-xml-minor-units.test.ts (4 tests | 3 failed) 6ms
     × ₺10.25 at 18% VAT — exact 1025*18/100 = 184.5 kuruş, half-up = 185 → "1.85" 4ms
     × ₺10.05 at 10% VAT — exact 1005*10/100 = 100.5 kuruş, half-up = 101 → "1.01" 0ms
     × half a unit of ₺1.13 — exact 0.5*113 = 56.5 kuruş, half-up = 57 → "0.57" 0ms

 FAIL  ... > ₺10.25 at 18% VAT ...
AssertionError: expected [ '1.84', '1.84' ] to deeply equal [ '1.85', '1.85' ]
- Expected
+ Received
  [
-   "1.85",
-   "1.85",
+   "1.84",
+   "1.84",
  ]

 FAIL  ... > ₺10.05 at 10% VAT ...
AssertionError: expected [ '1.00', '1.00' ] to deeply equal [ '1.01', '1.01' ]

 FAIL  ... > half a unit of ₺1.13 ...
AssertionError: expected [ '0.56' ] to deeply equal [ '0.57' ]

 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
```

Geçen tek test, liderin önerdiği %20 vakası — yani o vaka gerçekten sapmıyor.

Sapma taraması (brute force, `probe2.mjs` / `probe3.mjs`): `%20` → **0 sapma** (1..3.000.000);
`%1`, `%10`, `%18` → ilk sapmalar sırasıyla ₺10.05×10, ₺10.01×5, ₺10.05×5.

### 2.2 YEŞİL — düzeltmeden sonra, elle hesaplanmış beklentilerle

```
$ npx vitest run tests/efatura-xml-minor-units.test.ts

 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Kapsanan vakalar: %18 ve %10 sapma vakaları · kesirli miktar · liderin %20 vakası (pinlendi) ·
**KDV %0 (Kuveyt)** · **tevkifatlı** vaka (₺100.05 @ %20, 9/10) · **3 satırlı** belgede
satır toplamı = alt toplam ve satır KDV toplamı = belge KDV toplamı · USD faturası.

Her beklenen değer test adının içinde elle hesaplanmıştır. Belgenin kendi toplamını yine
belgeden üretilen toplamla karşılaştıran **tek** test açıkça "bu tek başına hiçbir şey
kanıtlamaz, satırın hiç basılmamasını yakalamak için" notuyla işaretlidir.

### 2.3 Üretilen XML — 3 satır, 3 farklı oran (elle doğrulama)

Elle hesap:

| # | Miktar × Birim | Oran | Net (kuruş) | KDV (kuruş) |
|---|---|---|---|---|
| 1 | 3 × ₺19.99 | %20 | 3×1999 = **5997** | 5997×20/100 = 1199.4 → **1199** |
| 2 | 1 × ₺10.25 | %18 | **1025** | 1025×18/100 = 184.5 → **185** |
| 3 | 7 × ₺10.05 | %10 | 7×1005 = **7035** | 7035×10/100 = 703.5 → **704** |
| | | | **14 057** | **2 088** |

KDV dahil = 14 057 + 2 088 = **16 145**. Tevkifat yok → ödenecek = **16 145**.

Gerçek çıktı:

```xml
  <!-- Vergi Toplamı -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">20.88</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">59.97</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">11.99</cbc:TaxAmount>
      <cbc:Percent>20.00</cbc:Percent>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">10.25</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">1.85</cbc:TaxAmount>
      <cbc:Percent>18.00</cbc:Percent>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">70.35</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">7.04</cbc:TaxAmount>
      <cbc:Percent>10.00</cbc:Percent>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">140.57</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">140.57</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">161.45</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="TRY">161.45</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Fatura Kalemleri -->
    <cac:InvoiceLine>
      <cbc:ID>1</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">3</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="TRY">59.97</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="TRY">11.99</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="TRY">59.97</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="TRY">11.99</cbc:TaxAmount>
          <cbc:Percent>20.00</cbc:Percent>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
        <cbc:Name>Abonelik</cbc:Name>
        <cbc:PriceAmount currencyID="TRY">19.99</cbc:PriceAmount>
    </cac:InvoiceLine>
    <cac:InvoiceLine>
      <cbc:ID>2</cbc:ID>
      <cbc:LineExtensionAmount currencyID="TRY">10.25</cbc:LineExtensionAmount>
        <cbc:TaxAmount currencyID="TRY">1.85</cbc:TaxAmount>
          <cbc:Percent>18.00</cbc:Percent>
        <cbc:PriceAmount currencyID="TRY">10.25</cbc:PriceAmount>
    </cac:InvoiceLine>
    <cac:InvoiceLine>
      <cbc:ID>3</cbc:ID>
      <cbc:LineExtensionAmount currencyID="TRY">70.35</cbc:LineExtensionAmount>
        <cbc:TaxAmount currencyID="TRY">7.04</cbc:TaxAmount>
          <cbc:Percent>10.00</cbc:Percent>
        <cbc:PriceAmount currencyID="TRY">10.05</cbc:PriceAmount>
    </cac:InvoiceLine>
```

Doğrulama: `59.97 + 10.25 + 70.35 = 140.57` = `LegalMonetaryTotal/LineExtensionAmount` ✓ ·
`11.99 + 1.85 + 7.04 = 20.88` = belge `TaxTotal/TaxAmount` ✓ · `140.57 + 20.88 = 161.45`
= `TaxInclusiveAmount` = `PayableAmount` ✓ (elle hesaplanan 14 057 / 2 088 / 16 145 ile birebir).

### 2.4 Gerçek veritabanı satırından, `withTenant` içinden

Sentetik nesne değil: satır Postgres'e yazıldı, **RLS'in geçerli olduğu `withTenant`
işlemi içinden** okundu, gerçek Zod şemasından geçirildi, `buildInvoiceDocument` →
`generateUblTrXml` ile render edildi.

```
=== stored lines (straight from Postgres) ===
[{"name":"Abonelik","vatRate":20,"quantity":3,"unitCode":"C62","unitPriceMinor":1999},
 {"name":"Danışmanlık","vatRate":18,"quantity":1,"unitCode":"C62","unitPriceMinor":1025},
 {"name":"Konaklama","vatRate":10,"quantity":7,"unitCode":"C62","unitPriceMinor":1005}]
=== rendered amounts ===
<cbc:TaxAmount currencyID="TRY">20.88</cbc:TaxAmount>
<cbc:TaxableAmount currencyID="TRY">59.97</cbc:TaxableAmount>  <cbc:Percent>20.00</cbc:Percent>
<cbc:TaxableAmount currencyID="TRY">10.25</cbc:TaxableAmount>  <cbc:Percent>18.00</cbc:Percent>
<cbc:TaxableAmount currencyID="TRY">70.35</cbc:TaxableAmount>  <cbc:Percent>10.00</cbc:Percent>
<cbc:LineExtensionAmount currencyID="TRY">140.57</cbc:LineExtensionAmount>
<cbc:PayableAmount currencyID="TRY">161.45</cbc:PayableAmount>
```

Sonda oluşturulan kiracı ve fatura silindi; artık satır kalmadığı doğrulandı
(`remaining probe tenants: 0 | remaining probe invoices: 0`).

### 2.5 Kapı (`pnpm gate`) — temiz

```
 Test Files  133 passed | 2 skipped (135)
      Tests  1570 passed | 8 skipped (1578)
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
GATE EXIT: 0
```

Lint'teki 2 uyarı **bu işten değil** — ikisi de başka bir görevin kanıt klasöründe
(`docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts`), HEAD'de de vardı, 0 hata.

### 2.6 Fatura e2e'leri

```
$ npx playwright test tests/e2e/invoice-export-real-record.spec.ts \
    tests/e2e/invoice-foreign-currency-export.spec.ts \
    tests/e2e/invoice-write-path.spec.ts tests/e2e/billing-invoice-history.spec.ts

  4 skipped
  13 passed (5.3s)
```

**Dürüstlük notu:** bu makinede `INVOICE_SUPPLIER_*` ortam değişkenleri **tanımsız**
(ölçtüm), bu yüzden export rotası 503 dönüyor ve bu spec'ler "satıcı kimliği yok" dalını
alıyor — yani **HTTP üzerinden XML render'ı bu koşuda çalışmadı**. Bu boşluğu §2.4'teki
gerçek-veritabanı probu kapatıyor (auth + HTTP dışındaki tüm zincir, ki bu değişiklik
onlara dokunmuyor). Yapılandırılmış ikinci bir dev sunucusu denendi; Next.js zaten :3000'de
çalışan bir örnek varken ikincisini başlatmayı reddediyor ve :3000'i durdurmak yasaktı.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/efatura.ts` | `unitPrice` → `unitPriceMinor`; `invoiceTotalsMinor` satır kırılımı döndürüyor ve currency parametresi kalktı; XML satır bloğu + belge vergi bloğu tek hesaptan okuyor, oranlara göre gruplanıyor; HTML minor-unit'e geçti; `formatInvoiceAmount` → `formatMoney` |
| `src/lib/money.ts` | **Yalnız yorum**: `vatOnNetMinor` / `withholdingOnVatMinor` birleştirme anlatısı gerçeğe uyduruldu. Kural, imza, davranış değişmedi. |
| `src/app/api/billing/invoices/[id]/export/invoice-document.ts` | Saklanan `unitPriceMinor` doğrudan geçiyor; float'a çeviren `toDecimalString` çağrısı ve import'u kalktı |
| `tests/efatura-xml-minor-units.test.ts` | **YENİ** — 11 test, elle hesaplanmış oracle'lar |
| `tests/efatura.test.ts`, `tests/efatura-unit.test.ts`, `tests/efatura-integrator.test.ts`, `tests/efatura-foreign-currency.test.ts`, `tests/invoice-document.test.ts`, `tests/vat-by-country.test.ts`, `tests/withholding-rounding.test.ts` | Fixture'lar minor-unit'e taşındı (`unitPrice: 100` → `unitPriceMinor: 10_000` vb.); `net / 100` dönüşümleri kalktı |

Şema/migration değişikliği **yok** — saklanan satır zaten `unitPriceMinor` tutuyordu; değişen
yalnızca bellek içi belge tipi. Bu yüzden `docs/DATA_MODEL.md` güncellemesi gerekmedi.

---

## 4. Riskler

- **Kırıcı tip değişikliği (dahili):** `InvoiceLineItem.unitPrice` → `unitPriceMinor`. Depodaki
  tüm çağıranlar güncellendi ve `pnpm typecheck` temiz; ama depo dışında bir tüketici varsa
  (yok, bu tip export edilmiş bir paket değil) kırılır. `invoiceTotalsMinor` de artık ikinci
  parametre almıyor.
- **Kapsam dışına çıkan bilinçli iki dokunuş** — ikisi de görevin "belge içi tutarlılık
  zorunlu" maddesinden doğdu, ayrıca işaretliyorum ki lider isterse geri alsın:
  1. Belge `TaxTotal`'ünde sabit `<cbc:Percent>20.00</cbc:Percent>` kaldırıldı, oranlara göre
     `TaxSubtotal` gruplandı. Bu **XML yapısını değiştirir** (tek oranlı belgede yine tek
     subtotal çıkar, karma oranlı belgede birden fazla). Entegratör tarafında birden fazla
     `TaxSubtotal` kabul edilmiyorsa burası gözden geçirilmeli — UBL-TR 1.2.1 buna izin verir,
     ama gerçek bir entegratörle **test edilmedi**.
  2. HTML'deki "Hesaplanan KDV (%20)" etiketi de sabitti; artık satırların gerçek oranlarından
     türetiliyor (karma oranda "%20 + %18" gibi görünür).
- **Davranış kayması:** %10 / %18 / %1 oranlı bir satırın XML'deki KDV'si artık bir kuruş
  farklı basılabilir. Bu düzeltmenin ta kendisi; ama daha önce **dışarı gitmiş** belgeler varsa
  yeniden üretildiklerinde eski kopyadan bir kuruş farklı olabilirler.

---

## 5. Açık sorular

1. **XML satırları hâlâ tevkifat basmıyor.** Belge seviyesinde tevkifat doğru (payable VAT
   düşülüyor, §2.2'de test edilmiş), ama `cac:InvoiceLine` içinde tevkifat için bir
   `TaxSubtotal` (`TaxTypeCode 0021`) yok. Bu bu kartın kapsamı değildi ve HEAD'de de yoktu —
   ayrı bir kart mı?
2. **`Math.round(quantity × unitPriceMinor)` iki yerde duruyor:** `invoiceTotalsMinor` ve
   `src/lib/billing/invoice-list.ts` içindeki `totalsForLines`. İkisi de aynı ifade ve aynı
   sonucu veriyor; ama "iki kopya tesadüfen anlaşıyor" deseninin ta kendisi. `invoice-list.ts`
   kapsam dışıydı, bu yüzden birleştirmedim — `money.ts`'e `lineNetMinor(quantity, priceMinor)`
   eklenmeli mi?
3. **Export rotasının HTTP render dalı bu makinede hiç koşmuyor** (`INVOICE_SUPPLIER_*`
   tanımsız). CI'da tanımlı mı? Değilse fatura e2e'lerinin yarısı kalıcı olarak 503 dalında
   sessizce yeşil kalıyor.

---

## 6. Sonraki adım

- Lider onayıyla: (5.1) satır seviyesi tevkifat `TaxSubtotal`'ü ve (5.2) `lineNetMinor`
  birleştirmesi için birer kart.
- `INVOICE_SUPPLIER_*` değerlerinin CI/e2e ortamına konması — aksi hâlde belgenin gerçekten
  render edildiğini kapıda hiçbir şey kanıtlamıyor.
