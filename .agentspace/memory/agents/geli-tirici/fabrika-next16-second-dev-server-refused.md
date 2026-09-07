---
name: fabrika-next16-second-dev-server-refused
description: Fabrika'da ikinci bir `next dev` başlatılamaz (Next 16 "Another next dev server is already running" der) — ayrı portta gerçek HTTP e2e için `next build` + `next start -p <port>` kullan
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Başka bir ajanın dev sunucusu :3000'de koşarken kendi env değişkenlerinle ikinci bir sunucu
açmak istersen `npx next dev -p 3011` **çalışmaz**: Next 16 aynı dizin için ikinciyi reddeder
("Another next dev server is already running… PID: …"). Çalışan sunucuyu ÖLDÜRME — başkasının
oturumu olabilir.

Çalışan yol:
```bash
npx next build                       # ~1 dk, exit 0
IYZICO_API_KEY=… IYZICO_BASE_URL=…  npx next start -p 3011
```
`next start` bu kilidi uygulamıyor. `output: standalone` uyarısı veriyor ama sunucu ayağa
kalkıyor ve rotalar 200 dönüyor.

Dış servis çağıran bir rotayı gerçek HTTP ile doğrulaman gerektiğinde: sağlayıcıyı 30 satırlık
bir `node:http` mock sunucusuyla değiştir ve `<SERVICE>_BASE_URL`'i ona çevir — böylece kendi
kodunun tamamı (rota, imza, Prisma yazımları) GERÇEK koşar, yalnız karşı taraf sahte olur.
Sahte anahtar + mock host, "anahtar yok, test edemedim" demekten çok daha iyi kanıt üretir.

**Why:** Bu duvara S10'da çarptım ve çözümü bulmak zaman aldı; her dış-servis görevinde tekrar
gerekecek.

İlgili: [[fabrika-dev-postgres-is-up]], [[fabrika-tsx-script-must-live-in-repo-root]],
[[fabrika-iyzico-billing-flow]]
