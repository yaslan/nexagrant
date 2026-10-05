---
name: fabrika-e2e-fixture-needs-modulestate
description: ModuleState seed etmeyen bir e2e fixture'ı specini modül kilidinde öldürür ve hata "element(s) not found" der — kilidi arama, önce fixture'ın ModuleState satırını say
metadata:
  type: project
  updatedAt: 2026-09-07
---

`moduleGate()` eksik `ModuleState` satırını **`OFF`** sayar (`src/lib/modules/access.ts` — "A missing
`ModuleState` row means the tenant was never granted the module"). Sayfa o zaman içeriği değil
`guard.tsx`'in kilit `<section>`'ını render eder. Playwright'ın gördüğü tek şey şudur:

```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('main').getByText('Archive E2E — opportunity to archive')
Error: element(s) not found
```

Yani hata **veri/seçici hatası gibi görünür**, kilit gibi değil: yaml dökümünde kenar çubuğu
(`complementary`) render olduğu için sayfa "açılmış" sanılır. Saatler burada yanabilir.

**Teşhis (tek komut, tahmin yok):**

```bash
# fixture'ı seed et, sonra:
prisma.moduleState.findMany({ where: { tenantId: <FIXTURE_TENANT> } })   → [] ise sebep budur
```

**2026-09-07 ölçümü:** `scripts/seed-archive-e2e.ts` ve `scripts/seed-gate-e2e.ts` hiç
`moduleState` yazmıyor → `tests/e2e/opportunity-archive.spec.ts` ve
`tests/e2e/gate-tenant-isolation.spec.ts` M5 kilidinde düşüyor. M5'i elle `ON` yapınca **spec
değiştirilmeden geçti** (`1 passed`), yani kusur fixture'da, üründe değil.
`scripts/seed-f10-e2e.ts` doğru yapıyor (`moduleState.upsert(... status: 'ON')`), `d8d9dd2` aynı
sınıf hatayı m6 fixture'ı için plan tarafında düzeltmiş.

**Fixture yazarken iki fact gerekir, biri yetmez** (`checkModuleAccess` ikisini de kontrol eder):
1. **Yetkilendirme (plan):** aboneliği olmayan kiracı `free` planına düşer; `free` yalnız
   **M3 + M5** verir (`src/lib/billing/catalog.ts`). Başka bir modül gerekiyorsa `Subscription` seed et.
2. **Durum:** `ModuleState` satırı `status: 'ON'`.

İlgili: [[fabrika-module-gate-is-opt-in]] · [[fabrika-e2e-own-fixture-hides-route-bugs]] ·
[[fabrika-module-off-blocks-platform-admin-too]]
