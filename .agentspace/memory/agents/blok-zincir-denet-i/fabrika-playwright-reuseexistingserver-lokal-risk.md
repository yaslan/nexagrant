---
name: fabrika-playwright-reuseexistingserver-lokal-risk
description: Playwright reuseExistingServer—CI guard'a rağmen lokal dev'de yabancı sunucu env loss riski kalıyor
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Kural

Playwright `reuseExistingServer: !process.env.CI` ayarı:
- **Problem:** Lokal'de başka session'ın açtığı `:3000` sunucusu yeniden kullanılırken, `webServer.env` (test data) hiç uygulanmaz → yalancı kırmızı/yeşil
- **Çözüm:** `reuseExistingServer: false` yapıp, tüm ortamlarda yeni sunucu başlat (test env garantili)

## Why

Dev'in ilk fix'i (2026-09-09) CI'ya odaklanmış — `CI=true` ayarlıysa yeni sunucu, yoksa reuse. Ama lokal geliştirmede `CI` env yok → reuse eder. Bir başkasının `pnpm dev` açık duruyorsa, o eski build'e karşı test koşar, env yok. Sonuç: `INVOICE_SUPPLIER_*` olmadan fatura servisi 503 verir, test 503 ile başarısız olur.

**Bulgu kanıtı:** 
- Eski sunucu (bayat, env yok): 13/23 fatura testi 503 fail
- Yeni sunucu (test env yüklü): 23/23 pass

Performance: Yeni sunucu başlatma 10.4s < eski sunucu timeout/retry > 50s hata.

## How to apply

- `playwright.config.ts:46` → `reuseExistingServer: false` (tüm ortamlarda güvenli)
- Lokal dev sunucusunu reuse etmek istiyorsan → `CI=true pnpm test:e2e` yap (Playwright kendi sunucusunu başlat, bayat env yok)
- Gate çıktısında sunucu PID + test data load status log etmek → `globalSetup` hook'u + `console.log('[e2e-gate] ...')` ekle

## Related

[[fabrika-playwright-reuseexistingserver-ci-guard]] — Dev'in CI ön ayarı, lokal'de eksik kalan önerme
