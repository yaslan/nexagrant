# TASK-MTU27KSLSJZ9I — Satır net tutarı kuralı tek kaynağa alındı + "birleştirildi" yorumları koda karşı doğrulandı

**Ajan:** geli-tirici (BE-EN) · **Sprint:** SPRINT-S12 · **Branch:** `dev` · **Tarih:** 2026-09-09

---

## 1. Ne yapıldı

### 1.1 Ölçüm — kaç kopya vardı?

Kuralın (`round(quantity × unitPriceMinor)`) **tam olarak 2 kopyası** vardı, ikisi de üretim kodunda. Testlerde kopyası **yoktu**.

| # | Dosya:satır (değişimden önce) | Kod | Ne besliyor |
|---|---|---|---|
| 1 | `src/lib/efatura.ts:241` | `const netMinor = Math.round(line.quantity * line.unitPriceMinor);` | GİB'e giden UBL-TR belgesinin her rakamı (`invoiceTotalsMinor`) |
| 2 | `src/lib/billing/invoice-list.ts:97` | `const lineMinor = Math.round(line.quantity * line.unitPriceMinor);` | Faturalama panelindeki tutarlar (`totalsForLines`) |

Ölçüm komutu ve çıktısı (değişimden önce):

```
$ grep -rn "Math.round(.*quantity" src tests --include='*.ts' --include='*.tsx'
src/lib/efatura.ts:241:    const netMinor = Math.round(line.quantity * line.unitPriceMinor);
src/lib/billing/invoice-list.ts:97:    const lineMinor = Math.round(line.quantity * line.unitPriceMinor);

$ grep -rn "lineNetMinor" src tests
(0 eşleşme)
```

**Kartın 1. maddesine dürüst cevap:** "tek kopyaydı" DEĞİL — **iki kopyaydı**, ikisi de üretimde, ikisi de aynı `Invoice.lines` satırını okuyor. Biri belgeyi, diğeri paneli üretiyordu; bugünkü tüm girdilerde aynı sonucu veriyorlardı ama **rastlantıyla**: hiçbir şey ikisini birbirine bağlamıyordu.

**Kopya OLMAYAN, ama yakın duran yerler** (kasten dokunulmadı — rounding adımı yok, `quantity` şema ile tamsayıya bağlı):
- `src/lib/billing/catalog.ts:319,344` — `totalMinor: amountMinor * quantity` (`quantity` `Number.isInteger` + `>= 1` ile doğrulanıyor, yuvarlama yok)
- `src/app/api/billing/quote/route.ts:80` ve `src/components/cart/CartDrawer.tsx:205` — `listAmountMinor * quantity` toplamı (katalog tamsayı miktarı, yuvarlama yok)

### 1.2 Kural tek kaynağa taşındı

`src/lib/money.ts`'e tek dışa açık fonksiyon eklendi (satır 182):

```ts
export function lineNetMinor(quantity: number, unitPriceMinor: number): number {
  if (!Number.isInteger(unitPriceMinor)) {
    throw new Error(`Minor-unit amounts must be integers, got ${unitPriceMinor}`);
  }
  if (unitPriceMinor < 0) {
    throw new Error(`A line's unit price is non-negative, got ${unitPriceMinor}`);
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`A line's quantity must be a non-negative finite number, got ${quantity}`);
  }
  const netMinor = Math.round(quantity * unitPriceMinor);
  if (!Number.isSafeInteger(netMinor)) {
    throw new Error(`Line net out of safe integer range: ${quantity} × ${unitPriceMinor}`);
  }
  return netMinor;
}
```

**`Math.round` bilerek korundu, `Math.floor(x + 0.5)`'e çevrilmedi.** Modülün vergi yardımcıları (`vatOnNetMinor`, `withholdingOnVatMinor`) `floor(x + 0.5)` yazımını kullanıyor ve ikisi negatif olmayan tam sayılarda özdeş — ama **her double'da değil**:

```
$ node -e "const x=0.49999999999999994; console.log('Math.round', Math.round(x), 'floor(x+0.5)', Math.floor(x+0.5));"
Math.round 0 floor(x+0.5) 1
```

`quantity` kesirli olabildiği için bu çarpıma keyfi double girebiliyor. Ev stili uğruna GİB'e giden bir belgenin aritmetiğini sessizce değiştirmemek için, **iki çağrı yerinin zaten koştuğu kural** (`Math.round`) aynen taşındı. Bu ayrım fonksiyonun docstring'inde ve bir birim testte yazılı.

Her iki çağrı yeri bağlandı, ikinci hesap yolu **kalmadı**:
- `src/lib/efatura.ts:241` → `lineNetMinor(line.quantity, line.unitPriceMinor)` (import satır 9)
- `src/lib/billing/invoice-list.ts:100` → `lineNetMinor(line.quantity, line.unitPriceMinor)` (import satır 5)
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — net **hesaplamıyor**, satırı olduğu gibi taşıyor; değişiklik gerekmedi.
- Yazdırılabilir HTML yolu (`generateEfaturaHtml`) ve XML satır bloğu zaten `invoiceTotalsMinor`'ın döndürdüğü `totals.lines[idx].netMinor`'ı okuyor — kendi hesabını yapmıyor, dokunulmadı.

### 1.3 Yorum denetimi (kartın ikinci yarısı)

Koda karşı doğrulanan iddialar:

| İddia (dosya:satır) | Doğrulama | Sonuç |
|---|---|---|
| `money.ts` `vatOnNetMinor`: "KDV kuralı önce üç yerdeydi — `invoice-writer.ts`, `efatura.ts`, `invoice-list.ts`" | `grep -rn "vatRate) / 100\|rate) / 100" src` → üretimde kopya yok; `invoice-writer.ts:9,195,200` `vatOnNetMinor` çağırıyor | **Doğru**, değiştirilmedi |
| `money.ts` `vatOnNetMinor`: **"Every amount on that document now comes out of this function."** | XML'in `LineExtensionAmount`, `TaxableAmount`, `PriceAmount`, `LegalMonetaryTotal` değerleri `vatOnNetMinor`'dan **çıkmıyor** — matrahlar `lineNetMinor`'dan geliyor | **YANLIŞ → düzeltildi.** Yeni metin: her *vergi* rakamı bu fonksiyondan; matrahlar `lineNetMinor`'dan, ki o da TASK-MTU27KSLSJZ9I'ye kadar ikinci bir kopyaydı |
| `money.ts` `withholdingOnVatMinor`: "iki `Math.round(vat * rate)` kopyası vardı" | `grep -rn "withholdingRate" src \| grep '\*'` → üretimde çarpım kopyası yok | **Doğru**, değiştirilmedi |
| `money.ts` `withholdingOnVatMinor`: "XML satırları tevkifat rakamı hiç basmadı — hâlâ basmıyor" | `grep -n "Withholding" src/lib/efatura.ts` → satır bloğunda tevkifat elemanı yok; yalnız HTML toplam satırı (700) basıyor | **Doğru**, değiştirilmedi |
| `efatura.ts:236-240`: "`totalsForLines`'ın yazdığı gibi yazıldı" | Bu **tam olarak** kartın kaldırmak istediği rastlantısal mutabakat | **Değiştirildi** — artık paylaşılan fonksiyona atıf yapıyor |
| `invoice-list.ts:77-82`: "**her iki** vergi adımı belgeyle aynı fonksiyonlar, kopya değil" | Doğruydu ama **eksikti**: net adımı hâlâ kendi `Math.round`'uydu | **Düzeltildi** — "all three steps ... (`lineNetMinor`, `vatOnNetMinor`, `withholdingOnVatMinor`)" |
| `invoice-list.ts:84-89`: "`invoiceLinesSchema` sınırladığı için `vatOnNetMinor` ve `withholdingOnVatMinor` guard'ları burada ateşlenemez" | Şema: `quantity: z.number().positive()`, `unitPriceMinor: z.number().int().nonnegative()` (`invoice-document.ts:24,27`) | **Güncellendi** — `lineNetMinor` ve `quantity` sınırı da listeye eklendi |

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 ÖNCE / SONRA XML — davranış birebir aynı

Aynı fatura girdisiyle (`0.5`, `0.333`, `3`, `2`, `1.5` miktarlı 5 satır; 20/18/10/20/20% KDV; bir satırda 9/10 tevkifat) `generateUblTrXml` koşuldu. Script: `scratchpad/xml-evidence.ts`.

**ÖNCE (değişimden önce, `Math.round` gömülüyken):**
```
LineExtensionAmount: ["0.57","298.04","59.97","0.00","67.52"]
TaxableAmount     : ["0.57","298.04","59.97","0.00","67.52"]
TaxAmount         : ["0.11","0.11","53.65","53.65","6.00","6.00","0.00","0.00","13.50","13.50"]
LegalMonetaryTotal: ["LineExtensionAmount=426.10","TaxExclusiveAmount=426.10","TaxInclusiveAmount=499.36","PayableAmount=487.21"]
panel totalsForLines: {"subtotalMinor":42610,"vatMinor":7326,"withholdingMinor":1215,"payableVatMinor":6111,"totalMinor":48721}
```

**SONRA (`lineNetMinor` çağrılırken):**
```
LineExtensionAmount: ["0.57","298.04","59.97","0.00","67.52"]
TaxableAmount     : ["0.57","298.04","59.97","0.00","67.52"]
TaxAmount         : ["0.11","0.11","53.65","53.65","6.00","6.00","0.00","0.00","13.50","13.50"]
LegalMonetaryTotal: ["LineExtensionAmount=426.10","TaxExclusiveAmount=426.10","TaxInclusiveAmount=499.36","PayableAmount=487.21"]
panel totalsForLines: {"subtotalMinor":42610,"vatMinor":7326,"withholdingMinor":1215,"payableVatMinor":6111,"totalMinor":48721}
```

```
$ diff before.txt after.txt && echo "IDENTICAL"
IDENTICAL
```

### 2.2 Kesirli quantity — ELDE hesap, testin tutturduğu değer

| Satır | Elde hesap | Beklenen | XML'de basılan |
|---|---|---|---|
| `0.5 × 113` | 56.5 → yarım-yukarı → **57** | `0.57` | `0.57` ✅ |
| `0.333 × 89500` | 29803.5 → **29804** | `298.04` | `298.04` ✅ |
| `1.5 × 4501` | 6751.5 → **6752** | `67.52` | `67.52` ✅ |
| `3 × 1999` | 5997 (kesir yok) | `59.97` | `59.97` ✅ |
| `2 × 0` | 0 | `0.00` | `0.00` ✅ |

Üçü de tam yarım-kuruş **berabere (tie)** vakası ve üçü de yukarı yuvarlanıyor — yani kural yarım-yukarı, banker's rounding değil. Panel yolunda da elde hesap doğrulandı: `0.5 × 113 = 56.5 → 57` net, `57 × 20 / 100 = 11.4 → 11` KDV, toplam `68` (`tests/billing-invoice-list.test.ts`).

### 2.3 Birim testler

```
$ node_modules/.bin/vitest run src/lib/money.test.ts
 Test Files  1 passed (1)
      Tests  25 passed (25)
   Duration  115ms

$ node_modules/.bin/vitest run tests/billing-invoice-list.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  130ms
```

### 2.4 Tam kapı

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ pnpm lint
$ eslint
/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars
/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars
✖ 2 problems (0 errors, 2 warnings)

$ pnpm test
 Test Files  133 passed | 2 skipped (135)
      Tests  1582 passed | 8 skipped (1590)
   Duration  6.12s
```

**0 hata.** İki lint uyarısı bu kartın DOKUNMADIĞI dosyalarda ve önceden vardı (`docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts`).

### 2.5 Tek-kaynak ve çağrılan-mı doğrulaması

```
$ grep -rn "Math.round(.*quantity" src tests --include='*.ts' --include='*.tsx'
src/lib/money.ts:158: * as two copies of `Math.round(line.quantity * line.unitPriceMinor)` —   ← yorum
src/lib/money.ts:192:  const netMinor = Math.round(quantity * unitPriceMinor);              ← tek kaynak

$ grep -rn "lineNetMinor" src --include='*.ts' | grep -v test | grep -v "^src/lib/money.ts"
src/lib/efatura.ts:9:  lineNetMinor,
src/lib/efatura.ts:241:    const netMinor = lineNetMinor(line.quantity, line.unitPriceMinor);
src/lib/billing/invoice-list.ts:5:import { lineNetMinor, vatOnNetMinor, withholdingOnVatMinor } from '@/lib/money';
src/lib/billing/invoice-list.ts:100:    const lineMinor = lineNetMinor(line.quantity, line.unitPriceMinor);
```

Gömülü kopya kalmadı; fonksiyonun iki gerçek üretim çağırıcısı var (çağıranı olmayan bir fonksiyon teslim edilmiş sayılmaz).

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/money.ts` | `lineNetMinor` eklendi (+ gerekçeli docstring); `vatOnNetMinor` docstring'indeki yanlış kapsam iddiası düzeltildi |
| `src/lib/efatura.ts` | `lineNetMinor` import edildi; `invoiceTotalsMinor` gömülü `Math.round` yerine onu çağırıyor; yorum güncellendi |
| `src/lib/billing/invoice-list.ts` | `lineNetMinor` import edildi; `totalsForLines` onu çağırıyor; iki docstring iddiası koda göre düzeltildi |
| `src/lib/money.test.ts` | `lineNetMinor` için 12 yeni birim test (kesirli, tie, 0 fiyat, sınır, `Math.round` vs `floor(x+0.5)` ayrımı) |
| `tests/billing-invoice-list.test.ts` | Panel yolunda kesirli quantity yuvarlaması için 1 yeni test |

`tests/e2e/**` ve `playwright.config.ts` dosyalarına **dokunulmadı** (başka worker'ın kapsamı).

---

## 4. Riskler

1. **Kaynak dosyalarım başka bir worker'ın commit'ine karıştı.** Paylaşılan çalışma ağacında, ben test yazarken `blok-zincir-dev` `cfe54af test(billing): fail the invoice export gate when the document is not rendered` commit'ini attı ve o commit benim o an unstaged olan üç kaynak dosyamı da içine aldı (`src/lib/money.ts +50`, `src/lib/efatura.ts +12`, `src/lib/billing/invoice-list.ts +23`). **İçerik doğru ve `dev`'de**, ama commit mesajı yaptığı işi anlatmıyor. Ortak dal olduğu ve o commit başkasının işini de taşıdığı için yeniden yazmadım; bu kartın commit'i (`refactor(billing): single-source the invoice line net rule`) testleri ve bu raporu taşıyor ve mesajında bu durumu not ediyor.
2. **Yeni guard'lar = geçersiz girdide artık istisna.** `lineNetMinor` negatif/kesirli `unitPriceMinor`, negatif veya sonsuz `quantity` için fırlatıyor; eskiden gömülü `Math.round` sessizce bir sayı üretirdi. Her iki çağrı yeri de `invoiceLinesSchema`'dan geçtiği için (`quantity: z.number().positive()`, `unitPriceMinor: z.number().int().nonnegative()`) bu guard'lar üretim yolunda ateşlenemez ve 1582 testin tamamı yeşil — yani **geçerli girdide davranış değişmedi**, geçersiz girdi artık sessiz yerine sesli.
3. `invoiceTotalsMinor` runtime doğrulaması olmayan `InvoiceLineItem[]` alıyor; şemayı atlayan yeni bir çağıran gelirse guard fırlatabilir. Bu istenen davranış (sessizce yanlış rakam basmaktansa), ama yeni çağıranın şemadan geçmesi gerektiği not edilsin.

---

## 5. Açık sorular (bu kartın KAPSAMI DIŞINDA — düzeltilmedi, bildiriliyor)

1. **`src/lib/efatura.ts:700` — yazdırılabilir HTML'de tevkifat oranı sabit yazılmış.**
   ```html
   <td class="label" style="color: #b91c1c;">Tevkifat Tutarı (9/10):</td>
   ```
   Etiket, satırların gerçek `withholdingRate`'i ne olursa olsun **her zaman "(9/10)"** diyor. `withholdingRate` 0.5 (5/10, kod 601) ya da 0.7 olan bir fatura, alıcının aldığı sayfada kendi tevkifat oranını yanlış beyan eder. Bu, hemen üstündeki `vatRateLabel`'in (satır 694) zaten çözdüğü problemin tevkifat tarafı — KDV etiketi sabit "%20"den kurtarılmış, tevkifat etiketi kurtarılmamış. CLAUDE.md kural 7 (belgede hesaplanmamış rakam olmaz) ihlali gibi görünüyor. **Ayrı kart önerilir.**
2. **`src/lib/money.ts:7-8` — modül başlığı "These two functions are the only place that conversion is allowed to happen" diyor.** Yanlış değil (kastedilen `toMinorUnits`/`toDecimalString`), ama artık 11 fonksiyonlu bir modülün başlığında duruyor ve okuyucu "hangi iki?" diye soruyor. Kozmetik; dokunulmadı.
3. `src/lib/billing/catalog.ts:319,344` yuvarlamasız `amountMinor * quantity` yapıyor ve `quantity`'yi tamsayıya zorluyor; fatura yolu ise kesirli `quantity`'ye izin veriyor. İki yol arasındaki bu kasıtlı fark bir yerde belgelenmiş değil — katalog kesirli miktar satmaya başlarsa sessizce tutarsızlaşır.

---

## 6. Sonraki adım

- Açık soru #1 için ayrı kart (tevkifat etiketi oranı satırlardan türetilsin, `vatRateLabel` deseniyle).
- Bu kart kapsamında yapılacak iş kalmadı: kural tek kaynakta, iki çağıran ona bağlı, ÖNCE/SONRA çıktısı birebir aynı, kapı temiz.
