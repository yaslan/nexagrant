---
name: fabrika-has-no-middleware-every-route-self-gates
description: Fabrika deposunda middleware.ts HİÇ YOK — hiçbir rotanın önünde merkezi kapı yoktur, her route handler yetkisini kendi çağırmak zorundadır; "yolda bir yerde auth vardır" varsayımı yanlıştır
metadata:
  type: project
  updatedAt: 2026-09-08
---

`find . -maxdepth 3 -name middleware.ts -not -path "./node_modules/*"` → **boş**.
Next.js middleware yok, yani `/api/**` altındaki hiçbir rotanın önünde ortak bir
kimlik/yetki kapısı yok. Kimliği doğrulanmamış bir istek doğrudan handler'a düşer.

Sonuç, bir rotayı incelerken geçerli tek kural: **kapıyı handler'ın kendi içinde görmüyorsan
kapı YOKTUR.** 2026-09-08'de `src/app/api/admin/documents/upload` ve
`src/app/api/admin/cordis/import` tam olarak böyle korumasızdı (ilkinde `KNOWN GAP` yorumu
duruyordu) — paylaşılan `tenantId: null` RAG korpusuna anonim yazma. TASK-MTSXG31NGW48D'de
ikisine de kapı takıldı, ama **yapısal boşluk duruyor**: eklenecek üçüncü admin rotası yine
korumasız doğar.

Kapı sarmalayıcıları `src/lib/tenant.ts` içinde, hepsi aynı desende — **yenisini yazma, çağır:**

| Bağlam | Fonksiyon | Reddedince |
|---|---|---|
| server action (kiracı) | `requireTenantAction()` | throw `TenantScopeError` |
| sayfa (server component) | `requireTenantPage(locale)` | redirect |
| route handler (kiracı) | `requireTenantApi()` | `{ok:false, response}` 401 |
| server action (platform admin) | `requirePlatformAdmin()` | throw `PlatformAdminRequiredError` |
| route handler (platform admin) | `requirePlatformAdminApi()` | `{ok:false, response}` 401 / 403 |

`requirePlatformAdminApi` 401 (`UNAUTHENTICATED`, oturum yok) ile 403
(`PLATFORM_ADMIN_REQUIRED`, oturum var ama yetki yok) ayrımını korur; kararı
`isPlatformAdminSession()`'a devreder, kopyalamaz. E-postadan admin TÜRETME.

Kapı **gövde okumasından ÖNCE** çağrılmalı (`req.formData()` / `req.json()`): sonra çağrılırsa
reddedilen istek yine de PDF ayrıştırır ve gömme parası harcar.

İlgili: [[fabrika-session-tenant-mismatch]] · [[fabrika-module-gate-is-two-locks]] · [[fabrika-verify-authz-with-a-real-nextauth-cookie]]
