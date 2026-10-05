---
name: fabrika-module-off-blocks-platform-admin-too
description: ModuleState OFF (missing row) blocks a page for EVERYONE including platform admin — no bypass; and /admin/modules has a race bug where rapid sequential ON clicks on dependent modules can silently revert to OFF
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Doğrulanan davranış (`src/lib/modules/state-machine.ts` `canAccessStatus()`):

- `OFF` (ya da hiç `ModuleState` satırı yok, aynı şey) → **kimse** göremez, `isPlatformAdmin` bile.
  Bypass yalnız `DEV` (admin-only) ve `PILOT` (admin + `PILOT_ROLES`) durumlarında var.
- `demo-tenant` gibi uzun süredir seed'lenen bir tenant'ın bile M1/M4/M6/M9 gibi modülleri **hiç**
  `ModuleState` satırına sahip olmayabilir (yalnız plan'ın `modules[]` listesinde adı geçmesi yetmez —
  o liste `PlanEntitlement`, `ModuleState` ayrı bir tablo). Bir modül sayfasını (örn. M9 briefs, `moduleGate('M9', locale)` arkasında) gerçek tarayıcıda test etmeden önce DB'den kontrol et:
  ```js
  await prisma.moduleState.findMany({ where: { tenantId: 'demo-tenant' } })
  ```
  Boşsa `/tr/admin/modules` (platform admin girişiyle, örn. `admin@yasinaslan.com.tr`) üzerinden açman
  gerekir — sayfada kapatılmış olsa bile.

**Bağımlılık zincirini AÇARKEN dikkat — `/admin/modules` istemci bug'ı (`client.tsx`):**
`applyStatusChange` sunucu isteğinden ÖNCE optimistic olarak `setState`liyor, hata alırsa
`catch` bloğunda `setModuleStates(initialStates)` çağırıyor — bu, component mount anındaki PROP'u
(yalnız o modülü değil, TÜM tenant state'ini) geri yüklüyor. Sonuç: M9 gibi `requires: [M1, M4]` olan
bir modülü açmadan önce M1'i ON yapıp hemen ardından (aynı oturumda, saniyeler içinde) M4'ü ON'a
tıklarsan, M4'ün sunucu isteği DB'de M1'in commit'i henüz görünmeden çalışabilir → "Missing required
dependency" hatası → **her iki** modül de UI'da OFF'a geri döner (M1'in kendi isteği ayrıca başarılı
olmuş olsa bile, state boşa gider — ekranda göründüğü ile DB'deki gerçek farklı olabilir).

**Doğru sıra:** her ON tıklamasından sonra DB'yi doğrula (`node` ile `moduleState.findMany`), bir
sonraki bağımlı modüle geçmeden önce. `requires: [M1, M4]` → M1 ON → DB'de doğrula → M4 ON → DB'de
doğrula → M9 ON.

İlgili: [[fabrika-module-gate-is-opt-in]], [[fabrika-module-state-not-enforced]],
[[fabrika-runtime-verification-recipe]]
