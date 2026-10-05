---
name: g0-scoring-production-hooked
description: G0 puanı production'da kanonik scoreG0/decideG0 ile hesaplanıyor — rescoreOpportunityG0 hook'u bağlanmış, testler yeşil
metadata:
  type: project
  updatedAt: "2026-09-07"
---

## Durum: ÇÖZÜLDÜ ✅

G0 kapı puanı kanonik fonksiyonlarından production'da hesalanıyor.

**Akış:**
- Opportunity oluşturulduğunda: `pipeline/actions.ts:241` -> `rescoreOpportunityG0(tenantId, opportunityId)`
- `rescoreOpportunityG0()` -> `computeG0ForOpportunity()` -> `decideG0(features, facts)` -> `scoreG0(features)`

**Kanıt:** 
- `src/lib/scoring/g0-compute.ts` zaten hook'lanmış (2026-09-07 14:41)
- `src/lib/scoring/g0-scoring.test.ts` yazılmış: 28 test pass
- Gate yeşil: lint 0 error, typecheck clean, 825 test pass

**Not:** Keşif raporu (2026-09-06) "production'da çağrılmıyor" dedi ama rapor yazıldıktan sonra bağlandı (14:41'de). Keşif Adım 1 (consolidate) yaptı, Adım 2 (bağlamak) başka ajan tarafından yapıldı.

**Dosyalar:**
- `src/lib/scoring/g0-canonical.ts` — kanonik scoreG0/decideG0
- `src/lib/scoring/g0-compute.ts` — production hook (rescoreOpportunityG0)
- `src/lib/scoring/g0-scoring.test.ts` — 28 unit test (NEW, 2026-09-07)

**Sonuç:** P0 sorunu kapandı. G0 hiç yapay değer almıyor — seed/demo'da statik/random kalıyor ama production'da kanonik.
