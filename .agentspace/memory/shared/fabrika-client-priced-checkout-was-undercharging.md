---
name: fabrika-client-priced-checkout-was-undercharging
description: Fabrika checkout istemciden fiyat alıyordu — saldırı kadar önemlisi meşru mutlu yolun 12 kat eksik fatura kesmesiydi; istemci fiyatı yasaklandığında ekranlar da aynı sürümde düzelmeli
metadata:
  type: project
  updatedAt: 2026-09-07
---

`POST /api/billing/checkout` Stripe tutarını istemcinin gönderdiği `price`/`originalPrice`/
`discountPercent`'ten hesaplıyordu (TASK-MTR6Q2IODYQRC, düzeltildi).

## Asıl bulgu saldırı değildi

Kart "biri Ultra'yı 50 sente alabilir" diye açılmıştı ve bu doğruydu. Ama gerçek tarayıcıyla
mutlu yolu koşunca daha pahalı bir hata çıktı: pricing sayfası sepete **aylık-eşdeğeri**
(`price: 18.675`) koyuyor, checkout bunu `recurring: { interval: 'year' }` ile gönderiyordu —
yani Pro yıllık için bir yıl boyunca $18.68 tahsil edilecekti, $224.10 yerine. **12 kat eksik
fatura, hiç kimse saldırmadan.**

Ders: "istemci fiyat gönderiyor" bulgusunu yalnız güvenlik açığı olarak test etme; meşru akışı
gerçek tarayıcıdan koş ve tutarı katalogla karşılaştır — sessiz gelir kaybı orada duruyor olabilir.

## Sunucu düzeldiğinde ekranlar geride kalır

Katalog indi ama sepet çekmecesi ve demo modalı hâlâ kendi çarpımını basıyor ($18.67), sunucu
$224.10 fiyatlıyor. Sunucu-tarafı fiyat kartı ile onu tüketen UI kartı **aynı sürümde** çıkmalı;
yoksa kullanıcıya görünen rakam ile tahsil edilen rakam farklı olur. API'yi tasarlarken demo/hata
yanıtına da `totalMinor` + `lines[]` koy ki UI kartının basacak bir gerçeği olsun.

Bkz. [[fabrika-runtime-verification-recipe]]
