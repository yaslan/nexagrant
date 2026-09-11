---
name: fabrika-parallel-e2e-must-use-own-port
description: playwright.config artık reuseExistingServer:false — paylaşılan dev sunucusu ayaktayken e2e DOĞRUDAN düşer; çözüm E2E_PORT, ama dört spec 3000'i sabit yazdığı için o yol 4 yanlış kırmızı verir
metadata:
  type: reference
updatedAt: 2026-09-11
---

`playwright.config.ts` şunu diyor:

```ts
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
webServer: { command: `pnpm dev --port ${PORT}`, url: BASE_URL, reuseExistingServer: true }
```

`reuseExistingServer: true` tek başına iyi bir ayar (port kavgası olmuyor), ama paralel
ajanlarla birleşince SESSİZ bir ölçüm tuzağı: A ajanı 3000'de dev sunucusunu ayağa
kaldırmışsa, B ajanının `pnpm test:e2e` çağrısı **kendi kodunu değil A'nın çalışan
sunucusunu** ölçer. Hata vermez; B yeşil/kırmızı bir sonuç alır ve ona inanır.

**How to apply:** Aynı dalgada birden fazla ajana e2e işi verirken her birine AYRI port
yaz — `E2E_PORT=3110 pnpm test:e2e -- tests/e2e/<spec>` gibi — ve "3000'i kullanma,
orada başka worker var" cümlesini göreve koy. Tek e2e işi varsa varsayılan 3000 sorunsuz.
Kanıt okurken: raporda hangi portta koşulduğu yazmıyorsa, o e2e sonucu kimin build'ini
ölçtüğü belirsizdir.

İlgili: [[fabrika-agents-share-one-working-tree]] · [[fabrika-e2e-own-fixture-hides-route-bugs]] ·
[[fabrika-prove-the-fix-against-the-real-database]]

---

## 2026-09-11 güncellemesi (TASK-MTVTPVTEBCF5Z) — iki şey değişti

**1. `reuseExistingServer` artık `false`.** Yukarıdaki "B, A'nın sunucusunu sessizce
ölçer" tuzağı KAPANDI; yerine gürültülü bir hata geldi. Paylaşılan bir `next dev`
ayaktayken `pnpm test:e2e` şununla düşer:

```
[WebServer] ⨯ Another next dev server is already running.
Error: Process from config.webServer was not able to start. Exit code: 1
```

Next, dizin başına tek dev sunucusuna izin verir; komşunun sürecini öldürmek yasak.
Çözüm hâlâ `E2E_PORT` — ama aşağıdaki uyarıyla.

**2. `E2E_PORT` yolu dört yanlış kırmızı üretiyor.** Dört spec `http://localhost:3000`'i
sabit yazmış; ikisi oraya `page.goto` yaptığı için başka portta `ERR_CONNECTION_REFUSED`
veriyor. Ayrıntı ve kanıt: [[fabrika-e2e-specs-pin-localhost-3000]] (kart
TASK-MTWOWRIXRMSW1). Port boşsa varsayılan `:3000`'den koşmak hâlâ en temiz yol.
