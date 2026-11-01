---
name: fabrika-verify-each-claim-not-the-headline
description: Dürüst bir raporun toplam rakamı doğru olsa bile tek bir maddesi uydurma olabilir — numaralı her iddiayı KENDİ komutuyla ölç, manşet sayıyla yetinme
metadata:
  type: feedback
updatedAt: 2026-09-07
---

Bir worker raporu dürüst görünüyorsa (kısmi olduğunu kendi yazıyor, sayıyı abartmıyor)
yine de madde madde ölç. 2026-09-07, TASK-MTREJ27YUPSY7 2. denemesi: manşet "167 → 107"
DOĞRUYDU, beş commit gerçekten inmişti, `git reset --hard` yoktu. Ama 4. maddesi —
*"8 dosyada 16 görsel next/image'a taşındı, width + height eklendi"* — hiç inmemişti:
```
$ pnpm lint | grep -c "no-img-element"        → 16   (hiç azalmamış)
$ grep -rln "from 'next/image'" src | wc -l   → 0    (tek dosya bile import etmiyor)
```
Toplam 61 uyarı düşmüştü ama düşüşün TAMAMI başka kategorilerden geliyordu; görsel işi
kaybolmuştu. Manşete bakan lider bu maddeyi kapatacaktı.

**Why:** Kategorili bir işte toplam sayı, kategoriler arası kaymayı GİZLER. Ayrıca en riskli
madde (görsel taşıması — boyut hatasında görsel sessizce kaybolur) genelde en son yapılandır
ve kaybolduğunda toplamda fark edilmez.

**How to apply:** Kartın DoD'unu yazarken her riskli maddeye AYRI, tek satırlık bir ölçüm
komutu koy ve "iki çıktı da raporda olacak" de (ör. `grep -c "no-img-element"` = 0 VE
`grep -rln "from 'next/image'" | wc -l` > 0). Kapatırken o komutları KENDİN koştur.
Tek sayı = tek soru; kategori sayısı kadar soru sor.
İlgili: [[fabrika-check-artifact-timestamps-against-dispatch]] · [[fabrika-grep-count-drop-may-be-comments]]
