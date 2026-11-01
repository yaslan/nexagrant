---
name: brand-proof-needs-a-substitution-not-a-matching-string
description: "Altbilgi doğru adı yazıyor" tek kaynaktan okunduğunu KANITLAMAZ — tek kaynağı saçma bir değerle değiştir ve çıktının takip ettiğini göster; ayrıca {brand} yer tutucusu render anında patlar, tsc de i18n-check de göremez
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTSWM36QWC36Z'de kartın kanıt talebi "üretilen dokümanın altbilgisi yeni adı taşısın"dı.
Belgeyi ürettim, altbilgi "Fabrika" yazıyordu — ve bu HİÇBİR ŞEY kanıtlamıyordu: tesadüfen
eşleşen bir literal ile `brand.ts`'ten okunan bir değer aynı çıktıyı verir.

`PRODUCT_NAME = 'ZZTESTBRAND'` yaptım, belgeyi yeniden ürettim: altbilgi + köken bildirimi +
DOCX gövdesi üçü birden takip etti. Kanıt bu; "Fabrika yazıyor" değil.

İkinci tuzak: katalogda `{brand}` yer tutucusu varsa ve çağıran `brand` geçirmeyi unutursa
**next-intl render anında patlar**. `tsc` göremez (string), `i18n-check` göremez (anahtar
parite + çözünürlük bakıyor, render değil). Bu yüzden `PublicFooter`'ı gerçek kataloglara
karşı jsdom'da render eden bir test şart oldu. Yan bulgu: ICU `{year}` sayı olarak geçilirse
"2.026" diye gruplar — `String(...)` geçir.

**Why:** Yeşil bir gözlem, mekanizmayı değil sonucu ölçer. Mekanizmayı ölçmek için negatif
kontrol gerekir.

**How to apply:** Bir "tek kaynaktan okusun" işini kapatmadan önce kaynağı BOZ ve çıktının
bozulduğunu göster; sonra geri al. Statik kapılar yeşilken render kapısı yoksa yüzeyi gerçekten
mount et.

İlgili: [[type-gate-proof-needs-a-rejection-not-zero-errors]] · [[rename-card-fix-the-value-not-the-52-copies]]
