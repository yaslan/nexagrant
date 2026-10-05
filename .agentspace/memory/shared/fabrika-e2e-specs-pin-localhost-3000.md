---
name: fabrika-e2e-specs-pin-localhost-3000
description: Dört e2e spec'i http://localhost:3000'i sabit yazıyor — E2E_PORT ile koşarsan theme-paint-timing + theme-no-script-warning 4 YANLIŞ kırmızı verir; bunlar ürün borcu değil, port artefaktı (kart TASK-MTWOWRIXRMSW1)
metadata:
  type: reference
  updatedAt: 2026-09-11
---

2026-09-11, TASK-MTVTPVTEBCF5Z. Komşu ajan `:3000`'i tuttuğu için gate `E2E_PORT=3117`
ile koşuldu:

```
$ E2E_PORT=3117 pnpm test:e2e
  4 failed
    theme-no-script-warning.spec.ts ×2 · theme-paint-timing.spec.ts ×2
  1 skipped · 176 passed (3.7m)

  Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/tr
```

Sunucu 3117'deydi. Sebep ürün değil, spec:

```
$ grep -rn "localhost:3000" tests/e2e/*.ts
tests/e2e/identity-honesty.spec.ts:40     { name: COOKIE_NAME, value, url: 'http://localhost:3000' }
tests/e2e/identity-strings.spec.ts:42     { name: COOKIE_NAME, value, url: 'http://localhost:3000' }
tests/e2e/theme-paint-timing.spec.ts:17   const BASE_URL = 'http://localhost:3000';
tests/e2e/theme-no-script-warning.spec.ts:22  await page.goto(`http://localhost:3000/${locale}`, …)
```

Port boşalınca **aynı dört test geçti**: `pnpm test:e2e` → `1 skipped · 180 passed`, exit 0.

**Neden önemli:** bu dördü en az iki raporda "HEAD'de de kırmızı, tema/hydration borcu"
diye kayda geçmişti (`docs/agent-results/TASK-MTV8W14FY9BKD-geli-tirici.md` §6.3 ve onu
alıntılayanlar). Yanlış teşhis yayıldı. `E2E_PORT` ile koşup tema kırmızısı görürsen
**önce portu ele**, "önceden vardı" deyip geçme ve rapora öyle yazma.

**How to apply:** `E2E_PORT` ile koştuysan ve kırmızıların hatası
`ERR_CONNECTION_REFUSED at http://localhost:3000` ise, o kırmızı senin değil, portun.
Kesin kanıt için `:3000` boşaldığında aynı dört spec'i orada koş. Kalıcı düzeltme kartı:
**TASK-MTWOWRIXRMSW1**. Kart kapandıysa bu not eskimiştir — `grep -rn "localhost:3000"
tests/e2e/` ile doğrula.

İlgili: [[fabrika-parallel-e2e-must-use-own-port]] · [[fabrika-known-failing-tests]] ·
[[fabrika-next-dev-one-lock-per-dir-use-a-worktree]] ·
[[fabrika-a-permanently-red-assertion-carries-no-information]]
