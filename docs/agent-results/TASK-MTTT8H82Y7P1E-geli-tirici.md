# TASK-MTTT8H82Y7P1E — Stopaj yuvarlaması iki kopyaydı + fatura toplamları major-unit float

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Sprint:** SPRINT-S12
**Ölçülen ağaç:** HEAD `3558018` + bu kartın değişikliği. Kart `984ba39`'da açılmıştı; iş sürerken
başka bir ajan `3558018`'i (bir hafıza dokümanı) commit'ledi, yani **kapı kartın açıldığı ağaçta
değil, teslim anındaki ağaçta** ölçüldü. Yeni commit dokunduğum dosyaların hiçbirine değmiyor
(`git log 984ba39..HEAD --name-only -- <4 dosyam>` → boş).

---

## 1. Ne yapıldı

### A. Stopaj (tevkifat) yuvarlaması tek kurala indi

`src/lib/money.ts:232` — `withholdingOnVatMinor(vatMinor, rate)` eklendi, guard'ları
`vatOnNetMinor` kalıbında: tam sayı, negatif-değil, oran 0–1 aralığında (yüzde değil kesir),
`Math.floor(x + 0.5)` ile açık half-up.

İki çağrı yeri çevrildi:

| Dosya | Önce | Sonra |
|---|---|---|
| `src/lib/efatura.ts:212` (belge) | `Math.round(vatMinor * line.withholdingRate)` | `withholdingOnVatMinor(vatMinor, line.withholdingRate)` |
| `src/lib/billing/invoice-list.ts:102` (panel) | `Math.round(lineVatMinor * line.withholdingRate)` | `withholdingOnVatMinor(lineVatMinor, line.withholdingRate)` |

`src` altında stopaj üzerinde artık hiç yerel `Math.round` yok (§2.4).

**Davranış değişmedi ve değişmemeliydi:** negatif olmayan değerler için `Math.round(x)` ile
`Math.floor(x + 0.5)` aynı sonucu verir. Kusur yanlış rakam değil, kaymaya açık olmasıydı.

### B. Guard'ların çağrı yerlerinde ateşleyemeyeceğinin şemadan kanıtı (kod yazılmadan ÖNCE)

Kart bunu önkoşul olarak istiyordu; zincir şu:

1. **Oran (0–1):** `invoiceLineSchema` (`src/app/api/billing/invoices/[id]/export/invoice-document.ts:31`)
   `withholdingRate: z.number().min(0).max(1).optional()`.
2. **Panel yolu:** `totalsForLines`'ın tek üretim çağrısı `invoice-list.ts:124`
   → `parsed.success ? totalsForLines(parsed.data) : null`, yani girdi `invoiceLinesSchema`'dan geçmiş.
   Okunamayan payload `amounts: null` olur, exception değil.
3. **Belge yolu:** `EfaturaDocument`'in tek üretim üreticisi `buildInvoiceDocument`
   (`invoice-document.ts:203`); `:209`'da aynı şemayla parse eder, `:229`'da
   `...(line.withholdingRate ? { withholdingRate: line.withholdingRate } : {})` ile kopyalar —
   yani helper'a ulaşan oran her zaman **(0, 1]** aralığında. Tek tüketici `route.ts:136`.
4. **`vatMinor` tam sayı ve negatif değil:** her iki yerde de `vatOnNetMinor`'ın dönüşü;
   o fonksiyon güvenli negatif-olmayan tam sayı değilse zaten fırlatıyor.

Bu yüzden helper'a **taşma (safe-integer) guard'ı bilerek konmadı**: oran ≤ 1 olduğu için sonuç
`vatMinor`'ı aşamaz ve çağıran onu zaten güvenli tam sayı olarak tutuyor. Gerekçe docstring'de yazılı.

### C. Regresyon testi — `tests/withholding-rounding.test.ts` (yeni, 8 test)

Test **iki taraftan** kilitliyor, çünkü tek başına her biri atlatılabilir:

* **Eşitlik testleri kopyayı reddeder** — biri yerel bir yuvarlama adımını geri getirirse belge ile
  panel kesirli çarpımda ayrışır.
* **Oracle testleri kuralın kendisini reddeder** — paylaşılan helper half-up'tan çıkarsa iki taraf
  *birlikte* kayar, eşitlik hâlâ tutar ama her rakam yanlış olur. Oracle test dosyasında bağımsız
  yazıldı (`Math.round(vatMinor * rate)`), implementasyondan import edilmedi.

Kapsam: net 1–3000 × KDV {20, 25.5} × stopaj {0.2, 0.3, 0.4, 0.5, 0.7, 0.9} = 36.000 karşılaştırma,
artı yarım-kuruşluk sınır vakası (10005 kr @ %20 → KDV 2001 → 9/10 = 1800.9 → **1801**),
artı guard testleri (0 oranı gerçek cevap; 10/10 tam stopaj; kesirli/negatif KDV reddi;
**yüzde yerine kesir** hatası — `0.9` yerine `90` geçilirse fırlatır).

### D. İkinci konu — `calculateInvoiceTotals` major-unit float

**Kısmen çevrildi, kalanı aşağıda ADIYLA raporlanıyor.**

* `invoiceTotalsMinor(lines, currency): TaxTotalsMinor` (`src/lib/efatura.ts:193`) artık **tek**
  hesap: bütün toplamlar tam sayı minor unit.
* `calculateInvoiceTotals` (`:243`) ikinci bir hesap değil, onun üzerine **ince bir görünüm** —
  her alan `minor / majorUnit`. Yani iki şekil var ama tek aritmetik ve tek yuvarlama yolu var.
* **UBL-TR XML üreticisi tam sayıya geçirildi** (`generateUblTrXml`): `TaxAmount`, `TaxableAmount`,
  `LineExtensionAmount`, `TaxExclusiveAmount`, `TaxInclusiveAmount`, `PayableAmount` artık
  `toDecimalString(minor, currency)` ile basılıyor. Asıl kural-9 ihlali buradaydı: mali belgede
  `(totals.subtotal + totals.totalVat).toFixed(2)` **float toplama** yapıyordu ve `.toFixed(2)`
  para biriminin üssünü değil sabit 2'yi varsayıyordu. Çıktı bugünkü üç para birimi (TRY/EUR/USD,
  hepsi üs 2) için birebir aynı; testler bunu doğruluyor (§2.3).

**Neden float alanlar tamamen kaldırılamadı — çağrı yeri adıyla:**

> `tests/vat-by-country.test.ts:234` (HEAD'de `:244`) —
> `expect(Math.round(document.totalVat * 100), …).toBe(expected)`
> `calculateInvoiceTotals(...).totalVat`'ı **major unit** olarak okuyor. Minor unit'e çevirmek bu
> satırı 100 kat yanlış hale getirirdi ve **bu dosya bu kartın DOKUNMA listesinde**.

Aynı şekli okuyan, DOKUNMA listesinde olmayan ama bu kartın kapsamına girmeyen diğer okuyucular:
`tests/efatura.test.ts:51-55, 73-77`, `tests/efatura-unit.test.ts:69-73, 91-95`,
`tests/efatura-foreign-currency.test.ts:102-104`, ve üretimde `generateEfaturaHtml`
(`src/lib/efatura.ts:612-628`) — sonuncusu yalnızca **ekrana basım**, ki `money.ts:118`'in kendi
docstring'i bunu açıkça meşru sayıyor ("the single allowed float in the money path… display-only").

Float alanların hâlâ orada olmasının gerekçesi kodun içine, `calculateInvoiceTotals`
docstring'ine, o test dosyası adıyla yazıldı — sessizce bırakılmadı.

---

## 2. Kanıt

### 2.1 Mutasyon A — bir tarafı yerel kopyaya geri çevir (`efatura.ts`, `Math.floor`) → KIRMIZI

Ateşlenen iddia **`:75` — eşitlik** (`panel vs document`), yani kopyayı yakalayan satır:

```
### MUTATION A — reintroduce a LOCAL copy at one call site (efatura.ts): Math.floor
 ❯ tests/withholding-rounding.test.ts (8 tests | 2 failed) 8ms
 FAIL  tests/withholding-rounding.test.ts > the document and the panel withhold the same amount > every net from 1 to 3000, at each VAT rate and each withholding rate
AssertionError: panel vs document, net 13 @ 20% VAT, 0.2 withholding: expected 1 to be +0 // Object.is equality
 ❯ tests/withholding-rounding.test.ts:75:73
 FAIL  tests/withholding-rounding.test.ts > the document and the panel withhold the same amount > a product ending in exactly half a kuruş rounds up on both sides
AssertionError: expected 1800 to be 1801 // Object.is equality
 ❯ tests/withholding-rounding.test.ts:109:44
 Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
--- reverted A ---
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

### 2.2 Mutasyon B — PAYLAŞILAN kuralı half-up'tan çıkar (`money.ts`, `Math.floor`) → KIRMIZI

Bu mutasyonda iki taraf **birlikte** kayar, dolayısıyla `:75` eşitlik iddiası **geçer**;
ateşlenen `:84` — bağımsız **oracle** iddiası. Eşitlik testinin tek başına yakalayamayacağı
mutasyon budur ve bu yüzden iki iddia birden var:

```
### MUTATION B — move the SHARED rule off half-up (money.ts): Math.floor
 ❯ tests/withholding-rounding.test.ts (8 tests | 2 failed) 9ms
 FAIL  tests/withholding-rounding.test.ts > the document and the panel withhold the same amount > every net from 1 to 3000, at each VAT rate and each withholding rate
AssertionError: document, net 13 @ 20% VAT, 0.2 withholding: expected +0 to be 1 // Object.is equality
 ❯ tests/withholding-rounding.test.ts:84:72
 FAIL  tests/withholding-rounding.test.ts > the document and the panel withhold the same amount > a product ending in exactly half a kuruş rounds up on both sides
AssertionError: expected 1800 to be 1801 // Object.is equality
 ❯ tests/withholding-rounding.test.ts:109:44
 Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
--- reverted B ---
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

**Not — ilk denemede iki mutasyon da oracle satırında ateşlemişti**, yani eşitlik iddiasının
canlı olduğu KANITLANMAMIŞTI (oracle önce geliyordu ve her yanlış değeri o yakalıyordu).
Testteki iddia sırası bu yüzden değiştirildi: önce eşitlik, sonra oracle. Şimdi her mutasyon
**farklı** bir iddiayı ateşliyor ve ikisinin de canlı olduğu ölçülmüş oluyor
(bkz. hafıza: `fabrika-mutation-red-may-fire-on-another-assertion`).

**Mutasyon pencereleri (paylaşılan ağaç uyarısı).** Her iki mutasyon da `src/` altında
saniyeler sürdü ve bayt-kopyadan (`cp`) geri alındı; o saniyelerde başka bir ajan koşarsa
sahte kırmızı görebilirdi. Geri alındığı kanıtı:
`git diff --stat src/lib/efatura.ts src/lib/money.ts` → boş çıktı (worktree == stage),
`grep -n "return Math.floor(vatMinor" src/lib/money.ts` → `242:  return Math.floor(vatMinor * rate + 0.5);`

### 2.3 `pnpm gate` — exit 0

```
$ pnpm gate ; echo "GATE_EXIT=$?"      # HEAD 3558018 + bu kartın değişikliği
GATE_EXIT=0

 Test Files  132 passed | 2 skipped (134)
      Tests  1559 passed | 8 skipped (1567)

$ eslint
/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars
/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars
✖ 2 problems (0 errors, 2 warnings)

✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

Bu kapı, testteki iddia sırası düzeltildikten **sonra** koşuldu (§2.2 notu); daha erken bir yeşil
kapı bu ağacı ölçmemiş olurdu.

Lint uyarısı sayısı **2** — ikisi de kartta adı geçen `TASK-MTSYH8LDGV5YU-evidence/*.mts` kalıntısı,
benim değil, **artmadı**.

### 2.4 Stopaj üzerinde artık yerel yuvarlama yok

```
$ grep -rn "Math.round(.*[Ww]ithholding\|[Ww]ithholding.*Math.round\|Math.round(vat" src --include="*.ts"
src/lib/money.ts:209: * stood as two `Math.round(vat * rate)` copies — `efatura.ts`, which computes
```
Tek eşleşme docstring metni; kod yok.

### 2.5 Docstring'deki iddia doğrulandı (iddia ≠ gerçek)

`calculateInvoiceTotals` docstring'i `tests/vat-by-country.test.ts`'in float şekli okuduğunu iddia
ediyor. İddia hem HEAD'de hem şu anki ağaçta grep'le doğrulandı:

```
$ grep -n "document.totalVat" tests/vat-by-country.test.ts
234:        expect(Math.round(document.totalVat * 100), `document @ ${rate}% on ${net}`).toBe(
$ git show HEAD:tests/vat-by-country.test.ts | grep -n "document.totalVat"
244:        expect(Math.round(document.totalVat * 100), `document @ ${rate}% on ${net}`).toBe(
```

### 2.6 Ölçülen ağacın dürüst tarifi

`pnpm gate` **paylaşılan** çalışma ağacında koştu; ağaçta bu kartın dışında diğer iki ajanın
uçuş-halindeki değişiklikleri de var (`scripts/efatura-preflight.ts`, `src/lib/env.ts`,
`src/lib/billing/vat-rate.ts`, `tests/vat-by-country.test.ts`, `users-scheduled-deletion*`).
Değişikliğimi HEAD üzerinde ayrı bir worktree'de izole ölçmeyi denedim; komut izin katmanında
reddedildi, o yüzden bu ölçümü **iddia etmiyorum**. Bunun yerine:
* dokunduğum 3 kaynak dosyanın diff'i satır satır kontrol edildi, tamamı bu karta ait (§3),
* kapı bütün ağaçta yeşil, yani hiçbir yerde kırmızı yok,
* kendi test dosyam izole olarak da yeşil (8/8, §2.1–2.2).

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/money.ts` | +40 — `withholdingOnVatMinor` (tek stopaj yuvarlama kuralı) |
| `src/lib/efatura.ts` | `invoiceTotalsMinor` (tam sayı çekirdek) + `TaxTotalsMinor`; `calculateInvoiceTotals` artık onun major-unit görünümü; UBL-TR XML toplamları `toDecimalString` ile tam sayıdan basılıyor |
| `src/lib/billing/invoice-list.ts` | `withholdingOnVatMinor` çağrısı + docstring'deki guard-erişilemezlik gerekçesi `withholdingRate 0-1` sınırını da kapsıyor |
| `tests/withholding-rounding.test.ts` | **yeni** — 8 test, 36.000 karşılaştırma |

DOKUNMA listesine uyuldu: `src/lib/env.ts`, `scripts/efatura-preflight.ts`,
`tests/vat-by-country.test.ts`, `src/lib/billing/vat-rates.ts` **değiştirilmedi**.

---

## 4. Riskler (yol üstünde görülen, KAYITSIZ, DÜZELTİLMEYEN kusurlar — kart açılmalı)

1. **`src/lib/efatura.ts:335` — satır bazlı `LineExtensionAmount` hâlâ float ve farklı bir kuralla
   yuvarlanıyor.** `${(line.quantity * line.unitPrice).toFixed(2)}`. Toplandığı `TaxExclusiveAmount`
   ise `toMinorUnits` (ondalık-metin üzerinden half-up) ile hesaplanıyor. İki farklı yuvarlama
   kuralı: yarım kuruşa denk gelen bir satırda **satır tutarları alt toplamı tutmayabilir** ve bu
   GİB'e giden XML'de olur. Ayrıca `.toFixed(2)` para biriminin üssünü değil sabit 2'yi varsayıyor.
   *Bu kartın kapsamı belge/panel stopajıydı; satır bazlı tutar dokunulmadı.*
2. **`src/lib/efatura.ts:615, 621` — HTML faturada oran etiketleri sabit yazılmış.**
   `Hesaplanan KDV (%20)` ve `Tevkifat Tutarı (9/10)` satırın gerçek `vatRate`/`withholdingRate`'inden
   bağımsız basılıyor: %25.5 KDV'li bir faturada belge "%20" diyor. CLAUDE.md kural 7 (koda sabit
   rakam yazma) ve kural 8 (i18n: kullanıcıya görünen sabit metin) ile çelişiyor.
3. **`src/lib/efatura.ts:222 formatInvoiceAmount` yalnızca `minimumFractionDigits` veriyor**,
   `maximumFractionDigits` yok. Bugün erişilemez (üç para birimi de üs 2), ama `InvoiceCurrency`'ye
   üssü 0 olan bir birim (JPY) eklendiği gün belge ondalık basar. `money.ts:formatMoney` ikisini de
   veriyor; `formatInvoiceAmount` onun kopyası gibi duruyor.
4. **`calculateInvoiceTotals` float alanları hâlâ duruyor** (§1.D). Kaldırma yolu açık ama
   `tests/vat-by-country.test.ts:234` bu kartın DOKUNMA listesinde. Ayrı bir kart, dört test
   dosyasını birlikte çevirmeli.

---

## 5. Açık sorular

1. Risk #1 (satır tutarı vs alt toplam yuvarlama farkı) mali belgede tutarsızlık üretebilir —
   bu SPRINT-S12'de mi ele alınmalı, yoksa GİB entegratörü kartıyla (TASK-MTRJSOWFH6B45) birlikte mi?
2. Risk #4'ü kapatan kart açıldığında `tests/vat-by-country.test.ts` üzerindeki DOKUNMA kısıtı
   kalkacak mı? Aksi hâlde float alanlar kalıcı olur.

---

## 6. Sonraki adım

* Bu kart: `review` → lider onayı.
* Risk #1–#4 için kart açılması (kapsam dışı olduğu için dokunulmadı).
