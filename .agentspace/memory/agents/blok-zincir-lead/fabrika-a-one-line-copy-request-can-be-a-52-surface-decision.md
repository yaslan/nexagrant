---
name: fabrika-a-one-line-copy-request-can-be-a-52-surface-decision
description: Patron "şu başlığı değiştir" dediğinde önce o metnin tek-kaynaklı bir sabitten gelip gelmediğine bak — Fabrika'da giriş başlığı PRODUCT_NAME'den geliyordu, istek 52 yüzeyi kapsayan marka kararıydı
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
Patron: *"'Fabrika Platformuna Giriş' yerine 'FonBridge Platformuna Giriş' olarak değiştir."*
Tek satırlık bir kopya düzenlemesi gibi duruyor. Kodda öyle değildi:

```
messages/tr.json:322   "signInTitle": "{brand} Platformuna Giriş"
AuthCard.tsx:153       tAuthCard('signInTitle', { brand: PRODUCT_NAME })
src/lib/brand.ts:17    export const PRODUCT_NAME = 'Fabrika';
```

O ekranda düzenlenecek bir dizgi **yok**. İstek ancak iki şeyden biri olabilirdi: ürün adını
her yerde geri almak (52 yüzey), ya da `brand.ts`'in var olma sebebi olan kusuru (bölünmüş
kimlik) bilerek yeniden üretmek. İkisi de "sessizce yap" denecek iş değildi.

## Nasıl sordum — soruyu SOYUT değil MEKANİK sordum
Üç satır kodu gösterdim, sonra üç seçeneği **sonuç tablosuyla** sundum: her seçenekte giriş
ekranı / logo / üst çubuk / e-posta gönderen / belge alt bilgisi ne yazacak. Patron
"her yerde FonBridge"i saniyeler içinde seçti. Soyut "markayı geri mi alalım?" sorusu aynı
cevabı bu kadar hızlı getirmezdi ve yanlış anlaşılabilirdi.

Yan kazanç: karar, açık iki eskalasyonumu da kapattı — logo görseli zaten FonBridge
wordmark'ıydı, yani **yeni tasarım varlığı gerekmedi**; giriş ekranındaki bölünmüş kimlik
kendiliğinden kapandı.

## Kural
Kullanıcıya görünen bir metin değişikliği istendiğinde, kapsamı beyan etmeden önce
`grep` ile o metnin **tek-kaynaklı bir sabitten mi** geldiğine bak (`brand.ts`, `money.ts`,
`vat-rates.ts` gibi tek-doğruluk dosyaları bu depoda çok). Geliyorsa istek bir kopya düzenlemesi
değil, bir üründür kararıdır; mekanizmayı göster ve seçtir.

İlgili: [[fabrika-prove-a-single-source-constant-with-a-sentinel]] · [[fabrika-preapproval-covers-the-goal-not-the-sequence]]
