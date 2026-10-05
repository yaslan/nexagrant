---
name: fabrika-lifetime-sale-is-never-persisted
description: Ömür boyu lisans satışı hiçbir yere yazılmıyor — Stripe webhook'u yalnız abonelikli oturumu işliyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

`src/app/api/webhooks/stripe/route.ts` içindeki `checkout.session.completed`
dalı işini YALNIZCA `session.subscription` doluysa yapıyor. `lifetime-ultra`
tek seferlik ödeme olduğu için (mode: payment, subscription yok) bu daldan
sessizce düşüyor ve hiçbir tabloya yazılmıyor. Şemada zaten ömür boyu lisansı
kaydeden bir model yok — `Subscription` aboneliğe özel (`tenantId @id`,
yani kiracı başına tek satır).

Sonuç: fiyat sayfasındaki "5 lisans sahibi / sıradaki #6" sayaçları
sayılamıyordu; i18n'de düz metindi (CLAUDE.md kural 7 ihlali). Bu boşluk
`TASK-MTR962OV5YGVX` ile kapatılıyor.

Ders: bir sayaç "uydurma" göründüğünde önce ARKASINDAKİ OLAYIN kaydedilip
kaydedilmediğine bak — çoğu zaman sorun metinde değil, fulfilment'ta.
Faturalama kartlarında `priceLine` doğru olsa bile satışın kaydı ayrı bir
sorudur. [[fabrika-runtime-verification-recipe]]
