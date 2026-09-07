---
name: fabrika-entitlement-is-getentitlements-not-planentitlement
description: CLAUDE.md §4'ün andığı PlanEntitlement tablosu ve src/lib/authz depoda YOK — hak edişin tek gerçeği src/lib/billing.ts::getEntitlements(); plan kapısı 2026-09-07'de checkModuleAccess içine bağlandı
metadata:
  type: project
updatedAt: 2026-09-07
---

CLAUDE.md §4 "`PlanEntitlement` + `ModuleState` + rol → `can(user, action, resource)`
(`src/lib/authz`)" diyor. **İkisi de yok.** `PlanEntitlement` diye bir Prisma modeli ve
`src/lib/authz` diye bir dizin depoda bulunmuyor. Bunları aramak zaman kaybı; hak edişin
tek gerçeği:

- `src/lib/billing.ts::getEntitlements(tenantId)` → `{ allowedModules, seats, workspaces,
  aiCreditsMonthly }`. `Plan` satırını **değil** `src/lib/billing/catalog.ts::PLAN_GRANTS`'ı
  okur (bayat satır modül dağıtamasın diye) ve **aktif `AddOn` satırlarını ekler**.
- Bu yüzden "planı kapsamıyor mu?" sorusunun doğru cevabı `PLAN_GRANTS`'a bakmak değil,
  `getEntitlements()` çağırmaktır — yoksa add-on'la satın alınmış modülü haksız yere kapatırsın.

TASK-MTQZ8MVAU3J7I'de plan kapısı `checkModuleAccess` (`src/lib/modules/access.ts`) içine
bağlandı: önce hak ediş, sonra `canAccessStatus`. Sıra yalnız *cümleyi* belirliyor ve bilinçli —
hiç satın alınmamış bir modül için "yöneticiniz kapatmış" demek kullanıcıyı açamayacağı bir
ayara yollar. Yeni sebep kodu `PLAN_UPGRADE_REQUIRED`.

**Ölçüm tuzağı (işe yarayan yaklaşım):** Hatayı kurgulamaya çalışma, **canlı veritabanına bak**.
`Subscription` + `ModuleState`'i yan yana çekmek yetti: demo kiracı `pro` (grant M1-M5,M8) iken
`ModuleState M10 = ON` duruyordu — hata zaten oradaydı, senaryo uydurmaya gerek kalmadı.
Plan/statü uyuşmazlığı arayan her görevde ilk adım bu iki tabloyu birlikte sorgulamak olmalı.

İlgili: [[fabrika-module-gate-is-opt-in]], [[fabrika-hardcoded-copy-defeats-grep-audit]]
