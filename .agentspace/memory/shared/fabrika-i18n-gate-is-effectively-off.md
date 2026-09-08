---
name: fabrika-i18n-gate-is-effectively-off
description: ARTIK GEÇERSİZ (2026-09-08 d98da75 ile düzeltildi) — i18n kapısı eskiden her koşuda exit 1 dönüp next.config tarafından warning'e çevriliyordu; bugün gerçekten bloklar, güncel davranış fabrika-i18n-gate-now-blocks-three-ways'te
metadata:
  type: project
  updatedAt: 2026-09-08
---

> **BU NOT ARTIK GEÇERLİ DEĞİL.** Kusur TASK-MTSHU5LT4XAE / commit `d98da75` ile kapatıldı.
> Güncel davranış: [[fabrika-i18n-gate-now-blocks-three-ways]]. Aşağısı yalnız tarihsel kayıt —
> "kapı zaten kırmızı/kapalı, kendi değişikliğime yorma" diye KANIT olarak kullanma.

Eskiden `pnpm build` her koşuda şunu basıp geçiyordu:

```
⚠️  Could not run i18n check: Command failed: tsx scripts/i18n-check.ts
```

İki sebebi vardı, ikisi de düzeltildi:
1. `scripts/i18n-check.ts` şablon değişkenli `t(\`ns.${x}\`)` çağrılarını düz anahtar sanıp
   28 hayalet eksik üretiyor ve her koşuda exit 1 dönüyordu.
2. `next.config.ts` bu exit kodunu `try/catch` ile yutup `console.warn`'a çeviriyordu
   (`// Don't block build on check failure`).

Ayrıca `pnpm gate` i18n'i hiç çağırmıyordu ve CI'nin PR yorumu adımı, raporu
`execSync('pnpm i18n:check')` ile yeniden üretmeye çalıştığı için tam da hata anında
fırlayıp yorumu hiç atmıyordu. Üçü de kapatıldı.
