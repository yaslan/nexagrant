---
name: a-long-lived-dev-server-holds-a-stale-prisma-client
description: Bir e2e "Argument X must not be null" gibi şema hatası veriyorsa önce dev sunucusunun YAŞINA bak — uzun ömürlü next dev belleğinde eski üretilmiş Prisma istemcisini tutar ve taze süreçte geçen yazma tarayıcıda düşer
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'da bir Playwright testi ürün hatası gibi görünen bir şey verdi:

```
Invalid `prisma.relationship.updateMany()` invocation:
  data: { ..., + ownerUserId: String }
  Argument `ownerUserId` must not be null.
```

Ama aynı yazmayı yapan canlı vitest paketi (`*.live.test.ts`, taze tsx süreci) **geçiyordu**.

**Kök neden:** `next dev` süreci Prisma istemcisini **başlangıçta** belleğe alır. Sunucu
8 Eyl 22:20'de başlamıştı; `node_modules/.prisma/client` o an 19:55 üretimiydi ve kolon
hâlâ `String` (nullable değil) tipliydi. `pnpm gate`'in ilk adımı `pnpm db:generate` olduğu
için istemci bugün 11:26'da yeniden üretildi — ama **çalışan sunucu eskisini tutmaya devam
etti**. Hot reload uygulama kodunu tazeler, `node_modules`'ü değil.

**Nasıl ayırt edilir (30 saniye):**
```
ps -eo pid,lstart,command | grep "next dev"          # sunucu ne zaman başladı
ls -la node_modules/@prisma/client                    # hangi .pnpm dizinine çözülüyor
ls -la <o dizin>/node_modules/.prisma/client/index.d.ts   # üretim zamanı
```
Üretim zamanı sunucunun başlangıcından **sonraysa** suç sunucudadır. Kanıt: sunucuyu yeniden
başlat ve **testi değiştirmeden** tekrar koş.

**Yapma:** testi gevşetme, `ownerUserId`'yi opsiyonel yapma, şemayı "düzeltme". Ölçüm bozuk,
kod değil. Bu, [[fabrika-dev-server-500s-after-deleting-a-route-file]] ile aynı sınıf:
uzun ömürlü dev sunucusu bayat durum tutar ve bunu regresyon sanarsın.

Paylaşılan ağaçta başka ajanlar varken 3000'i öldürmeden önce `lsof -nP -iTCP -sTCP:LISTEN`
ile kimin dinlediğine bak; Playwright `reuseExistingServer` ile yenisini kendi başlatır.

İlgili: [[a-probes-own-format-assumption-fakes-a-red]] · [[live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs]]
