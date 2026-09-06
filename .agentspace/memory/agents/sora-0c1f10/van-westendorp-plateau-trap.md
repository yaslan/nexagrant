---
name: van-westendorp-plateau-trap
description: Van Westendorp kesişimini "ilk sıfır farkı" diye aramak optimal fiyatı plato'nun sol ucuna düşürür — küçük örneklemde en sık yapılan hata, doğrusu plato'nun ortası
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Van Westendorp eğrilerinde (azalan eksi artan) fark her zaman pozitiften negatife geçer, **ama
tek bir noktada kesişmeyebilir**: kimsenin "çok ucuz" da "çok pahalı" da demediği bir fiyat
aralığında iki eğri de 0'dadır, yani fark **bir plato boyunca sıfır** kalır.

Naif tarama (`d0 === 0 → bu noktayı döndür`) bu durumda platonun **sol ucunu** optimal fiyat
diye raporlar. Fabrika'da bu, 9 yanıtlık örneklemde OPP'yi €129 gösterdi; gerçek okuma €214 idi
— %40 hata, ve tam da fiyat kararının dayanacağı sayıda.

Doğru algoritma (`src/lib/beta/pricing-analysis.ts:intersect`): ilk işaretten sonra ters işaretli
ilk noktayı bul; komşuysa doğrusal interpolasyon, arada sıfır platosu varsa **platonun orta noktası**.

Küçük örneklemde (n<20) plato neredeyse kural, istisna değil — 8–10 kişilik beta anketinde bu
kod yolu her zaman çalışır. Testte üç özdeş yanıtla elle doğrulanabilir: 1/2/3/4 → PMC 200,
OPP 250, IPP 250, PME 300 (cent).

Bkz. [[e11-4-pricing-instrument]]
