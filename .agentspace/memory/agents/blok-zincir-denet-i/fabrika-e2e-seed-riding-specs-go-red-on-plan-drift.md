---
name: fabrika-e2e-seed-riding-specs-go-red-on-plan-drift
description: Tohum kiracıya (main / fabrika-beta) binen e2e paketleri plan verisi değişince sessizce kırmızıya döner — modül kapısı render edilir, aranan form/başlık hiç basılmaz; kendi fixture kiracısını kuran paketler etkilenmez
metadata:
  type: project
  updatedAt: 2026-09-08
---

Fabrika'nın e2e paketleri iki sınıfa ayrılıyor ve dayanıklılıkları çok farklı:

- **Fixture-provisioned** — `beforeAll`'da kendi kiracısını/workspace'ini kurar
  (`tests/e2e/fixtures/m9-tenant.ts` → `M9_WORKSPACE = 'm9-e2e'`, `notfound-tenant.ts`).
  Plan/modül durumunu kendi garanti eder. **Dayanıklı.**
- **Seed-riding** — elle tohumlanan demo kiracıya bakar: `m9-brief-generate-failure.spec.ts:22`
  (`fabrika-beta` / `demo-opp-1`), `m10-audit-identity.spec.ts:23` (`/tr/main/…/demo-opp-1/documents`).
  **Plan verisi her değiştiğinde kırılır.**

2026-09-08'de bu 4 test kırmızıydı. Kök neden kodda değil veride: `c5bc95a`
("retire the EUR plan ladder") M9/M10'u yalnız **Ultra**'ya taşıdı
(`m9/manifest.ts:17`, `m10/manifest.ts:17` → `plansGrantingModule(...)`), ama `main` ve
`fabrika-beta` Ultra'ya taşınmadı. Sayfa **HTTP 200** ve modül kapısını basıyor:
"… modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Ultra." Testin aradığı
placeholder / başlık hiç DOM'a girmiyor, hata `locator.fill` timeout'u olarak görünüyor —
sebebi hiç söylemeyen bir mesaj.

**Teşhis (tahmin etme, 30 saniyede ölç):** gerçek bir oturumla sayfayı aç ve `main` gövdesini
yazdır. "Bu modül şu anda kullanılamıyor" görüyorsan hata testte ya da senin değişikliğinde
değil, kiracının planında. Ayırt edici işaret: aynı modülün fixture'lı paketi (m9-briefs-form,
m9-brief-persistence) YEŞİL kalır.

Bu, [[fabrika-status-code-needs-session-and-module-on]]'daki modül kapısının bir üst katmanı:
orada kapı `ModuleState` OFF'tan geliyordu, burada `PlanEntitlement`'tan — ikisi de aynı
"makul 200" gövdesini üretir.

Suçun sende olup olmadığını [[fabrika-ab-baseline-without-git-stash]] ile kanıtla.
