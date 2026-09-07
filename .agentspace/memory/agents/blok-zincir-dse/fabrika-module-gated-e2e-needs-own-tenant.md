---
name: fabrika-module-gated-e2e-needs-own-tenant
description: Modül kapılı ekranın e2e'si demo-tenant'ı ödünç alamaz — M9 gibi modüller hem plana hem ModuleState'e bağlı ve demo-tenant'ın planı koşum sırasında değişiyor; kendi kiracını kur
metadata:
  type: project
  updatedAt: 2026-09-07
---

Bir modül ekranının (M9 Meeting Briefs, M10, M6…) e2e'si **iki** gerçeğe bağlı:
`getEntitlements(tenantId).allowedModules` (plan kataloğu) **ve** `ModuleState` satırı.
İkisinden biri eksikse sayfa değil modül-kilidi ekranı gelir ve bütün iddialar
"element not found" diye patlar — sebebi test ettiğin özellik değildir.

`demo-tenant` bunun için güvenilmez: 2026-09-07'de aboneliği koşum sırasında `ultra`'dan
`pro`'ya döndü (başka bir ajanın faturalama testi), ve `owner@demo.fabrika.test` artık
demo-tenant'ta değil — başka bir kiracıya bağlı. Bu yüzden `tests/e2e/m9-briefs-form.spec.ts`
kırmızıydı; kusur M9'da değildi.

Çözüm, `tests/e2e/fixtures/m9-tenant.ts`: spec kendi kiracısını (`m9-e2e-tenant` + workspace +
kullanıcı + membership + `ultra` Subscription + `ModuleState ON` + Opportunity + CreditLedger)
`beforeAll`'da kurar, `afterAll`'da siler. Aynı kalıbı başka modül-kapılı e2e'ye kopyala.

Yan bilgiler (ölçülmüş):
- URL'deki `[workspace]` segmenti dekoratif — `requireTenantPage` yalnız oturumdan kiracı
  çözüyor, slug'ı doğrulamıyor. Fikstürde istediğin slug'ı kullanabilirsin.
- Playwright `webServer.url` sağlık kontrolü 500'ü "hazır değil" sayar; `/tr` bu kurulumda
  `next/image` + `images.unsplash.com` yüzünden 500 veriyor, bu yüzden çalışan sunucu
  yeniden kullanılamayıp `EADDRINUSE` ile düşüyor. Geçici çözüm:
  `E2E_BASE_URL=http://localhost:3000/api/auth/csrf npx playwright test …`
  (baseURL yol içerse de mutlak yollar aynı origin'e çözülür).
- `notFound()` `[locale]/(app)` altında gövdeyi doğru 404 ekranıyla basıyor ama **HTTP 200**
  dönüyor (briefs, documents, pipeline/[id], partners/[pic] hepsinde ölçüldü; hiç eşleşmeyen
  rota 404 veriyor). Kendi spec'inde `expect` etme — `testInfo.annotations`'a yaz.

İlgili: [[fabrika-staged-work-gets-swallowed]]
