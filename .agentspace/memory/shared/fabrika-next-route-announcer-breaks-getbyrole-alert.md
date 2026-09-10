---
name: fabrika-next-route-announcer-breaks-getbyrole-alert
description: Playwright'ta `getByRole('alert')` bu uygulamada HER ZAMAN çift eşleşir — Next.js'in `#__next-route-announcer__` div'i de role="alert"; modül kapısı ekranını `section[role="alert"]` ile seç
metadata:
  type: reference
  updatedAt: 2026-09-10
---

## Belirti

`tests/e2e/module-gate.spec.ts`'te modül kapısı (🔒) ekranını `page.getByRole('alert')` ile
seçmek strict-mode ihlaliyle patlıyor:

```
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
    1) <section role="alert" aria-live="polite" class="max-w-2xl mx-auto px-4 py-16 text-center">…
    2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
```

## Neden

İkincisi bizim değil: Next.js App Router her sayfaya rota değişikliklerini ekran okuyuculara
duyuran boş bir `#__next-route-announcer__` div'i basıyor ve o da `role="alert"`. Yani bu
uygulamada **`getByRole('alert')` tek başına asla benzersiz değildir** — sayfanın kendi
uyarısı olsun olmasın.

## Nasıl uygulanır

Rolü elementle birlikte daralt:

```ts
// moduleGate() bir <section role="alert"> render ediyor (src/lib/modules/guard.tsx)
const gate = page.locator('section[role="alert"]');
```

Aynı tuzak `role="status"`/`aria-live` bekleyen iddialar için de geçerli olabilir; bir rol
seçicisi beklenmedik şekilde çift eşleşiyorsa önce framework'ün kendi gizli landmark'ını ara.

İlgili: [[fabrika-e2e-own-fixture-hides-route-bugs]] · [[fabrika-workspace-url-segment-is-decorative]]
