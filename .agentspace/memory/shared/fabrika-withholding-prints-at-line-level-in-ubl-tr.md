---
name: fabrika-withholding-prints-at-line-level-in-ubl-tr
description: Patron karari (2026-09-09) — UBL-TR belgesinde tevkifat SATIR seviyesinde TaxSubtotal olarak basilacak, yalniz belge toplaminda birakilmayacak
metadata:
  type: project
  updatedAt: 2026-09-09
---

Açık karar olarak duran soru (TASK-MTU27WLNS25BZ) 2026-09-09'da patron tarafından karara
bağlandı: **tevkifat UBL-TR belgesinde SATIR seviyesinde `TaxSubtotal` olarak basılacak.**
"Yalnız belge toplamında kalsın" seçeneği reddedildi.

Bugünkü durum (karar anında ölçüldü): tevkifat `src/lib/efatura.ts:250-251`'de satır başına
hesaplanıyor, `totalWithholdingMinor`'a giriyor ve `payableVatMinor = totalVatMinor -
totalWithholdingMinor` olarak kullanılıyor — ama **XML'e hiç yazılmıyor**; yalnız
yazdırılabilir HTML'in toplam satırında (`:698-701`) görünüyor.

Uygulama kuralı: rakamlar `invoiceTotalsMinor`'ın döndürdüğü TEK hesaptan okunacak (satır
tevkifatlarının toplamı = `totalWithholdingMinor`), ikinci bir hesap yolu açılmayacak —
TASK-MTU27KSLSJZ9I ile kazanılan tek-kaynak bozulmamalı. Eleman şeması (WithholdingTaxTotal /
TaxCategory / TaxScheme, tevkifat kodu ve yüzdesi) **kanıtla** belirlenecek; kanıtlanamıyorsa
kod yazılmayacak — yanlış şemayla GİB'e giden belge, hiç tevkifat basmamaktan daha kötüdür.

İlgili: [[fabrika-einvoice-real-record-or-404]]
