---
name: fabrika-give-workers-a-case-not-a-verdict
description: Karta somut test vakasi yazarken onu KENDIN dogrula — uydurdugum "%20'de float sapiyor" vakasi matematiksel olarak sapmiyordu, worker duzeltti
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

TASK-MTTUSEJFOSPI kartina float yuvarlama hatasinin kaniti olarak somut bir vaka yazdim:
"quantity=3, birim fiyat 19.99, KDV %20 — float yolu bu degeri tutturamaz". Worker olctu ve
vakanin YANLIS oldugunu bildirdi: %20'de sapma matematiksel olarak imkansiz, cunku kesin carpim
`net x 20 / 100 = net / 5` ve `net x 2` daima cift oldugundan yarim kurusluk bir tie hic olusmuyor.
Kendim de dogruladim, worker haklıydi. Gercek sapma Turkiye'nin diger oranlarinda: %18 (10.25 -> 1.85
yerine 1.84), %10, %1 ve kesirli quantity'de (0.5 x 1.13 -> 0.57 yerine 0.56).

DERS: karta bir DAVA (hangi kusur, nerede, neden onemli) yaz — ama HUKUM niteliginde somut sayilar
verirken onlari once kendin kosarak dogrula, yoksa worker'i yanlis vakayi kovalamaya gonderirsin.
Bu seferki iyi bitti cunku karta "once mevcut yolun bu degeri TUTTURMADIGINI goster" diye yazmistim;
o cumle worker'i vakayi olcmeye zorladi ve yanlisi yakalatti. O cumleyi her oracle-testli karta koy.

Ikinci ders: worker seni duzeltirse once KENDI kosunla dogrula, sonra kabul et ve devam et —
bu oturumda `node -e` ile iki vakayi da hesaplamak 30 saniye surdu.
