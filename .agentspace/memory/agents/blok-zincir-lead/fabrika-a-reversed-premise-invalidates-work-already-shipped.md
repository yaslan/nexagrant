---
name: fabrika-a-reversed-premise-invalidates-work-already-shipped
description: Patron bir öncülü tersine çevirdiğinde (marka geri döndü) yeni kararı ileriye uygulamak YETMEZ — eski öncüle göre az önce sevk edilmiş işi geri tara, özellikle gerekçesi YORUMA yazılmış olanları
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
Aynı oturumda iki karar arka arkaya geldi:
1. customer-support, halka açık demo butonundaki `mehmet@fonbridge.app`'i RFC 2606 gereği
   `mehmet@example.com`'a çekti — **gerekçesi o an doğruydu**: `fonbridge.app` şirketin artık
   sahip olmadığı bir alan adıydı, sahte görünümlü kurumsal adres basmak yanlıştı.
2. Saatler sonra patron ürün adını FonBridge'e geri aldı ve demo adresini
   `demo@usfinbridge.com` yaptı — **şirketin kendi alan adı**.

Yani 1'in gerekçesi 2 ile çürüdü. Yeni adresi uygulamak tek başına yeterli olsaydı, kodda şu
kalırdı: `auth.ts:36`'da "RFC 2606 example.com'u tam da bunun için ayırır" diyen bir yorum,
üç satır altında `demo@usfinbridge.com`. Kod ile yorum çelişirdi — ve **çelişen yorum, yanlış
yorumdan kötüdür**: sonraki kişi hangisine güveneceğini bilemez.

## Neden yakalandı
Çünkü worker gerekçesini **yoruma yazmıştı**. Yazmasaydı çelişki görünmez olurdu; adres
değişir, ölü gerekçe sessizce kalırdı. Bu, "kararın niçin'ini koda yaz" disiplininin somut
getirisi — gerekçe yazılıysa öncül değiştiğinde `grep`lenebilir hale gelir.

## Kural
Patron bir öncülü tersine çevirdiğinde (marka, alan adı, fiyat çapası, hukuki varsayım):
1. Yeni kararı uygula — ama orada durma.
2. **O öncüle dayanarak yakın zamanda sevk edilmiş işi geri tara.** En hızlı yol: ilgili
   raporlardaki "gerekçe" cümlelerini ve dokunulan dosyalardaki yorumları oku.
3. Gerekçesi çürüyen her yerde yorumu da güncelle; eski gerekçenin ASIL uyarısı hâlâ geçerliyse
   (burada: "halka açık demo butonunda üçüncü-taraf adresi basma") onu KORU, yalnız dayanağını
   değiştir.
4. Worker'a bunu açıkça söyle — kendi kararını geri aldığını bilsin ve neden değiştiğini anlasın;
   yoksa aynı düzeltmeyi bir sonraki turda geri getirir.

İlgili: [[fabrika-a-one-line-copy-request-can-be-a-52-surface-decision]] · [[fabrika-preapproval-covers-the-goal-not-the-sequence]]
