---
name: fabrika-jsdom-has-no-localstorage
description: Fabrika'nın vitest/jsdom ortamında localStorage HİÇ YOK (typeof undefined, window'da da globalThis'te de) — tarayıcı-depolaması kullanan bileşen testi kendi Storage'ını kurmalı
metadata:
  type: reference
  updatedAt: 2026-09-08
---

`// @vitest-environment jsdom` bu depoda `window` veriyor ama **Storage vermiyor**. Ölçüm
(2026-09-08, vitest 4.1.11):

```
A bare-localStorage:      undefined
B window-localStorage:    undefined
C globalThis-localStorage: undefined
location: http://localhost:3000/          ← origin sorunu değil, uygulama hiç yok
```

`vitest.config.mts` bir `environmentOptions`/setup dosyası tanımlamıyor, o yüzden polyfill de yok.

## Sonuç

`localStorage` okuyan bir bileşeni test ederken hook'u mock'lama — **gerçek bir Storage kur**,
bileşen tarayıcıdaki kod yolundan geçsin:

```ts
function installLocalStorage(): void {
  const entries = new Map<string, string>();
  const storage: Storage = { /* length, clear, getItem, key, removeItem, setItem */ };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}
beforeEach(installLocalStorage);
```

Çalışan örnek: `tests/notifications-read-store.test.tsx`.

## Yan etki: sessiz geçen testler

Üretim kodu `localStorage`'a `try/catch` içinde dokunuyorsa (doğrusu budur —
[[fabrika-lint-gate-green-narrow-exceptions]]'daki `use-read-notifications` öyle yapıyor),
Storage yokluğunda test **patlamaz**, sessizce "depo boş" dalına düşer ve yeşil görünür. Yani
depolama davranışını doğruladığını sanırken hiçbir şey doğrulamamış olabilirsin. Storage'ı
kurduğundan emin ol; kurulu olduğunu bir assertion ile kanıtla.
