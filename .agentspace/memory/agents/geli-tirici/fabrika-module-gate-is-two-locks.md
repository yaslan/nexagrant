---
name: fabrika-module-gate-is-two-locks
description: Fabrika modül kapısı iki kilit — ModuleState=ON VE planın modülü vermesi; e2e seed'i yalnız birincisini kurarsa sayfa "aboneliğinizin kapsamı dışında" der
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da bir modül sayfasına ulaşmak için İKİ kilit birden açık olmalı:

1. `ModuleState(tenantId, moduleId) = ON` — kiracı modülü açmış,
2. kiracının `Subscription.planId`'si o modülü veren bir plan — `plansGrantingModule('M6')` → `pro`, `ultra`.

`Subscription` satırı YOKSA kiracı giriş katmanına düşer ve plan kapısı sayfayı kapatır:
"<Modül> modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Pro, Ultra."

Bu, e2e fixture'larında sessiz bir tuzak: seed `ModuleState`'i yazar, test "element not found"
ile düşer ve hata **testin kendi adımında değil**, ondan önceki render'da gerçekleşir — bu yüzden
kart/bug raporu yanlış adımı suçlar (TASK-MTQZ9767FOZMB'de kart "slider fill() çalışmıyor" diyordu,
gerçek sebep buydu; slider sapasağlamdı).

Doğru desen (icat etme, kopyala): `scripts/seed-relationship-e2e.ts` — tenant upsert'ünün hemen
ardından `prisma.subscription.upsert({ where:{tenantId}, update:{planId:'pro',status:'ACTIVE'},
create:{...} })`, ve rollback'e `subscription.deleteMany({ where:{tenantId} })`.

Teşhis kısayolu: Playwright fail'inde `test-results/<...>/error-context.md` içindeki YAML DOM
anlık görüntüsünü oku — `main > alert > heading "Bu modül şu anda kullanılamıyor"` görüyorsan
sorun testte değil, fixture'ın hak setinde.

Bkz. [[fabrika-e2e-gate-blocked-by-landing-page-500]]
