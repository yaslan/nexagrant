---
name: fabrika-e2e-red-check-module-lock-first
description: "element not found" ile düşen Fabrika e2e'sinde ÖNCE error-context.md'deki main bloğuna bak — modül kilidi ekranıysa kusur test edilen özellikte değil, fikstürün planı/ModuleState'i eksik
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da bir e2e "locator … element(s) not found" / `fill` timeout ile düşüyorsa, ürüne
dokunmadan önce Playwright'in yazdığı `test-results/<test>/error-context.md` içindeki
`- main:` bloğunu oku. İki cümleden biri çıkıyorsa teşhis bitmiştir:

- *"… modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: X"* → **plan** eksik
  (`PLAN_GRANTS`, `src/lib/billing/catalog.ts`). Fikstüre o planla `Subscription` gerekir.
- *"… modülü kiracınızda kapalı."* → plan tamam, **`ModuleState` satırı yok** (varsayılan `OFF`).

**Why:** `moduleGate` iki bağımsız gerçeği birlikte okuyor (`src/lib/modules/access.ts`), ve
ikisi de spec yazıldıktan *sonra* ürüne girdi — bu yüzden dün yeşil olan spec bugün kırmızı
olabiliyor: `15de510` planı, `df6e7ab` manifest rotalarına otomatik kapıyı ekledi (2026-09-07).
Kırmızının sebebi neredeyse hiç test edilen özellik değil.

**How to apply:** ürün kodunu değiştirme, testi de gevşetme — fikstürü tamamla.
Yeni fikstür yazarken plana kendin plan uydurma: kilit mesajı entitlement'ın geçtiğini
söylüyorsa (`kiracınızda kapalı`) yalnız `ModuleState` ekle. `free` planı zaten M3+M5 veriyor;
kendine `ultra` yazan fikstür ürünün gerçekte yaptığından azını test eder.

Yan kural: e2e ekran görüntülerini BAŞKA görevin `docs/agent-results/TASK-…-screenshots/`
klasörüne yazan spec, her koşumda o raporun kanıtını eziyor. Kendi görev id'ne al.

İlgili: [[fabrika-module-gated-e2e-needs-own-tenant]] · [[fabrika-second-dev-server-port-isolation]]
