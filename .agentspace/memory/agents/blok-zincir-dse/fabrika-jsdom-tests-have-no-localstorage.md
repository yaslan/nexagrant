---
name: fabrika-jsdom-tests-have-no-localstorage
description: Fabrika'nın vitest/jsdom ortamında localStorage TANIMSIZ ve @testing-library/user-event kurulu değil — bileşen testinde Storage'ı elle kur, tıklama için fireEvent kullan
metadata:
  type: reference
updatedAt: 2026-09-09
---

`// @vitest-environment jsdom` ile koşan Fabrika testlerinde:
- `typeof localStorage === 'undefined'`. `localStorage` kullanan bir bileşeni test ederken bellek-içi bir
  `Storage` kur (`Object.defineProperty(globalThis, 'localStorage', {value, configurable:true, writable:true})`).
  Hazır örnek: `tests/notifications-read-store.test.tsx` içindeki `installLocalStorage()` — kopyala, hook'u
  mock'lama (bileşen tarayıcıdaki kod yolundan geçsin).
- **`@testing-library/user-event` KURULU DEĞİL** (import edersen "Failed to resolve import" ile suite hiç
  koşmaz). `fireEvent` kullan (`@testing-library/react`).
- Vitest config: `vitest.config.mts`, kurulum dosyası yok, `@` alias'ı `./src`.

İlgili: [[fabrika-401-is-a-flow-step-not-an-error-state]]
