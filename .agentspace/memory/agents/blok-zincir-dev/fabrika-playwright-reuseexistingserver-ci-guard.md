---
name: fabrika-playwright-reuseexistingserver-ci-guard
description: playwright.config.ts'te reuseExistingServer'ı CI'da kapalı etmek bayat sunucu tuzağını engeller
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

## Kural

`playwright.config.ts` webServer konfigürasyonunda `reuseExistingServer` ŞART:
- **Dev:** true (lokal geliştirmede :3000'de devam eden sunucu varsa yeniden başlatma — hızlı)
- **CI:** false (`process.env.CI` ayarlandığında — yeni sunucu başlat, bayat config yok)

```typescript
reuseExistingServer: !process.env.CI,
```

## Why

E2e test suite yapılandırmasını CI github actions workflow'unda `CI=true` ortam değişkeniyle geçmeliyiz. Değilse, CI'da 3000'de eski bir next dev sunucusu varsa, Playwright onu reuse eder ve test env vars (INVOICE_SUPPLIER_*, vs.) HIÇBIR ZAMAN uygulanmaz — bayat build'e karşı test koşar, yalancı yeşil/yalancı kırmızı üretir.

## How to apply

- Lokal çalışırken: `reuseExistingServer: true` — güzel, dev sunucusunu yeniden başlatma
- CI'da: `reuseExistingServer: false` + CI=true env; sunucu özel test config ile başlar
- Deployment: Sunucuya erişilmezse test hazır değil, bekleme (timeout) — ilgisi yok, ayarlama sorunu değil

## Related

[[fabrika-playwright-webserver-probe-blocks-e2e]] — CI workflow'ta `playwright install --with-deps` ekle (browser binary gerekli)
