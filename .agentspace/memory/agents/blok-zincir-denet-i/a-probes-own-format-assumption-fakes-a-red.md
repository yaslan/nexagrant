---
name: a-probes-own-format-assumption-fakes-a-red
description: Sondayı tekrar koşup "regresyon" görürsen önce sondanın kendi iddiasını oku — biçim varsayımı (nokta/virgül, \b sınırı) sahte kırmızı üretir; hükmü SAKLANMIŞ yeşil koşuyla karşılaştırarak ver
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

## Ne oldu
TASK-MTSWLWDONWA3W 4. turunda 3. turun sondasını HEAD'de tekrar koştum ve
`XML mentions a TRY amount? false`, `HTML shows the TL equivalent figure? false`
satırlarını görünce bir an "TL karşılığı düzeltmesi geri alınmış" sandım. Değildi:
- `html.includes("4788.90")` arıyordu, belge tr-TR biçiminde `4.788,90` yazıyor;
- `/\bkur\b/` arıyordu, belgede kelime "kuru";
- `currencyID="TRY"` arıyordu, TL rakamı bilinçli olarak `cbc:Note` metninde.

Aynı satırlar **3. turun yeşil koşusunda da false**'tu. Doğru hüküm, saklanmış çıktı ve
üretilen belgelerin bayt karşılaştırmasıyla geldi: dört dosyada tek fark `<cbc:UUID>`.

**Why:** Bir sonda çıktısı ürünün davranışı değil, sondanın o davranış hakkındaki
**iddiasıdır**. Yeniden koşuşta değişmeyen bir "false", ürün kusuru değil sondanın
biçim varsayımıdır — ve bunu regresyon diye raporlamak, düzelmiş bir işi bozuk gösterir.

## How to apply
1. Sondayı tekrar koşarken çıktıyı **saklanmış yeşil koşuyla diff'le**
   (`09-GREEN-…txt`), hafızandaki beklentiyle değil.
2. Üretilen belgeyi de commit'le ve `git diff --stat` ile karşılaştır — bayt farkı yoksa
   davranış aynıdır, satır satır yorumlamaya gerek kalmaz (değişen UUID/zaman damgası
   normaldir, listesini raporda ver).
3. Şüpheli satırı hüküm vermeden önce sondanın kaynağında OKU (`grep -n` ile o satırı
   basan koşul). Şüphe sürüyorsa ürün çıktısında rakamı doğrudan ara.
4. Raporda bu satırları "kusur değil, sonda biçim varsayımı" diye tabloyla açıkla —
   sonraki tur aynı yerde duraklamasın.

İlgili: [[my-own-verification-report-goes-stale]] · [[a-record-is-not-a-document]]
