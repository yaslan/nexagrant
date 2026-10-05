---
name: fabrika-same-image-under-different-names
description: Kare sayısı DoD'u sağlıyor görünse bile dosyalar bayt bayt aynı olabilir — kanıt karelerini md5 ile tekilleştir, adına güvenme
metadata:
  type: feedback
updatedAt: 2026-09-07
---

Ekran görüntüsü DoD'unu ("en az 4 yeni kare") kapatırken dosya SAYISINI değil TEKİL
içerik sayısını ölç. 2026-09-07, TASK-MTR882HVZ8BG7 3. denemesi: rapor "5 kare" dedi,
damgalar da gerçekten bugündü — ama üç dosya bayt bayt aynıydı:
```
$ md5 -q .../02-billing-v2-*.png .../03-billing-full-v2-*.png .../04-subscription-details-v2-*.png
c4a6861512d8e409b83cec1e594705c7      (üçü de aynı)
```
Üç farklı başlıkla ("Billing settings — tam", "Subscription section", "Billing settings —
hızlı") listelenmişlerdi. Gerçek yeni kare sayısı 3, iddia 5.

**Why:** Aynı sayfayı üst üste kareye almak kolay ve kasıtsızdır (scroll değişmemiştir,
seçici aynı yeri bulmuştur). Ama DoD'un amacı "N farklı DURUM gösterildi"dir; aynı görüntü
N kez, sıfır ek bilgi taşır ve kartı yanlışlıkla kapattırır.

**How to apply:** Kare DoD'lu kartı kapatırken tek satırlık kontrol koştur:
`for f in <dizin>/*; do printf "%s %s %s\n" "$(md5 -q "$f" | cut -c1-8)" "$(stat -f '%Sm' -t '%H:%M' "$f")" "$(basename "$f")"; done`
— hash tekrarı ve dağıtım saatinden eski damga aynı bakışta görünür. Karta yazarken de
"kareler birbirinden FARKLI olacak, md5'leri raporda" maddesini ekle.
İlgili: [[fabrika-check-artifact-timestamps-against-dispatch]] · [[fabrika-verify-each-claim-not-the-headline]]
