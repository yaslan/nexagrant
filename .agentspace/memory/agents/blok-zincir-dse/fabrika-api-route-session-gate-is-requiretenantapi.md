---
name: fabrika-api-route-session-gate-is-requiretenantapi
description: Fabrika'da bir API rotasına oturum kapısı koyarken tek doğru desen requireTenantApi() (src/lib/tenant.ts) ve kapı gövde okunmadan/fiyatlama yapılmadan ÖNCE gelir — reddin maliyeti sıfır olmalı
metadata:
  type: project
updatedAt: 2026-09-09
---

Fabrika'da bir route handler'a kiracı kapısı gerekiyorsa yeni desen icat etme: `requireTenantApi()`
(`src/lib/tenant.ts`) `{ok:true, scope}` ya da `{ok:false, response}` döner; kullanım
`const scope = await requireTenantApi(); if (!scope.ok) return scope.response;`. 401 gövdesi
`{error:'Unauthorized', message:<TR>, code:'TENANT_SCOPE_REQUIRED'}`. Sayfa karşılığı `requireTenantPage`,
server action karşılığı `requireTenantAction`/`assertTenant`, admin karşılığı `requirePlatformAdminApi`
(401 anonim / 403 yetkisiz ayrımı bilinçli).

Konum kuralı: kapı **gövde parse edilmeden ve hiçbir fiyat/DB işi yapılmadan önce** çağrılır. Fiyatlamadan
sonra duran bir kapı, kiracısı olmayan bir çağrı adına yine de `tierForTenant`/`priceLineForTenant`/
`taxLineForTenant` sorguları çalıştırır — reddin maliyeti sıfır olmalı. Bunu testte de iddia et
(`expect(tierForTenantMock).not.toHaveBeenCalled()`), yalnız status koduna bakma.

`session?.tenantId || '<bir-şey>'` kalıbı bu depoda bir bug sınıfıdır (`src/lib/tenant.ts` başındaki yorum
bunu anlatıyor): fallback gerçek bir satırsa kiracılar-arası sızıntı, gerçek değilse (ör. `'default-tenant'`,
TASK-MTUI9F5YBHTDC) kaydedilemeyen bir ödeme/webhook 500 döngüsü. İkisi de kabul edilemez.

İlgili: [[fabrika-401-is-a-flow-step-not-an-error-state]] · [[fabrika-verification-recipe-mutation-and-counterfactual]]
