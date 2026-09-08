---
name: fabrika-parallel-e2e-must-use-own-port
description: Aynı anda e2e koşan iki ajan tek dev sunucuyu paylaşır (reuseExistingServer) — her worker'a kendi E2E_PORT'unu ver, yoksa başkasının build'ini ölçer
metadata:
  type: reference
updatedAt: 2026-09-08
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
