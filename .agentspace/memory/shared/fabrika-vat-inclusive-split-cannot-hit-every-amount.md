---
name: fabrika-vat-inclusive-split-cannot-hit-every-amount
description: KDV dahil tutarı net+KDV'ye ayırırken birebir eşleşme DAYATMA — net+round(net×oran) her tam sayıya denk gelmez, %20'de ödemelerin 1/6'sı faturasız kalır; artığı 0 KDV'li yuvarlama kalemi yap
metadata:
  type: project
updatedAt: 2026-09-08
---

Fabrika faturasında saklanan `unitPriceMinor` **net** (KDV hariç) fiyattır;
`calculateInvoiceTotals` (`src/lib/efatura.ts`) KDV'yi onun **üstüne** ekler. Tahsil edilen
tutar ise **brüt**. Yani ödemeden fatura üretirken brütü ayrıştırmak zorundasın.

**Tuzak:** `net + round(net × oran/100)` her tam sayıya **denk gelmez** — bu fonksiyonun
görüntü kümesi deliklidir. Birebir eşleşme dayatan bir ayrıştırma, denk gelmeyen tutarlarda
`null` döner ve o satış **faturasız kalır**.

Ölçüldü (1..200 000 minor unit, 2026-09-08):

| oran | ulaşılamayan tutar |
|---|---|
| %20 | **%16,67** (her 6 tutardan 1'i) |
| %18 | %15,25 |
| %10 | %9,09 |
| %8  | %7,41 |
| %1  | %0,99 |
| %0  | %0 |

En küçük örnek: brüt 3 kuruş, %20 → net 2 ⇒ toplam 2; net 3 ⇒ toplam 4. Üçe ulaşan net yok.

## Doğru yaklaşım

Taşmayan **en büyük** neti ikili aramayla bul, kalan artığı **kendi 0 KDV'li kalemi**
olarak yaz (`ROUNDING_LINE_NAME = 'Yuvarlama farkı'`,
`src/lib/billing/invoice-writer.ts` → `decomposeGrossAmount`).

Ölçüldü: artık **her oran ve tutarda en fazla 1 minor unit** ve `net + KDV + yuvarlama`
her zaman tahsilata **birebir** eşit. Değişmez şudur ve pazarlık konusu değildir:
**faturanın genel toplamı tahsil edilen parayla aynı olmak zorunda.**

## İki uyarı

- Bu bir **mali** karardır, sadece aritmetik değil: yuvarlama kaleminin kabul edilebilirliği
  mali müşavir onayı ister. Açık soru olarak raporlandı (TASK-MTSWL8ADKZKDM).
- Depoda ilan edilen fiyatların KDV **dahil mi hariç mi** olduğunu söyleyen kayıt **yok**.
  Oran uydurulmaz: `INVOICE_VAT_RATE` varsayılansızdır, boşken fatura kesilmez. `0` geçerli
  bir orandır ve "kimse ayarlamamış" ile aynı şey değildir —
  bkz. [[fabrika-fabrication-audit-must-cover-defaults]].
