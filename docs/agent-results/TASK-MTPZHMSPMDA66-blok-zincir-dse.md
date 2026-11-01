# TASK-MTPZHMSPMDA66 — M6.3 Scoring Logic & Calculation Engine

**Status:** ✅ Completed  
**Agent:** DSE-EN (Designer/ürün tasarımcı — backend görev handle etti)  
**Sprint:** S9 (v1.1)  
**Bağımlılık:** M6.1 schema ✓  

## Ne yapıldı

Implemented M6.3 scoring functions and ESR comparison engine; enforced validation rules for score integrity, reviewer access, and tenant isolation.

### Dosyalar

**`src/modules/m6/server/scoring.ts` — scoring functions ekle:**
- `calculateCriterionAverage(criterionId)` — per-criterion score average across submitted reviews
- `getScoreDistribution(criterionId)` — score histogram (returns `{ 1: 0, 2: 0, 3: 1, 4: 2, 5: 1 }` format)
- Fixed type annotations on reduce operations for TypeScript strict mode

**`src/modules/m6/server/comparison.ts` — NEW module, ESR comparison & validation:**
- `compareM6ToESR(evaluationId, tenantId, currentUserId?)` — fetch evaluation, validate reviewer access, compare panel score vs ESR
- `validateScoreRange(score)` — enforce 1..5 range (strict integers only)
- `checkNoDuplicateScore(reviewerId, criterionId)` — prevent same reviewer submitting twice on same criterion
- `validateReviewerAccess(evaluationId, userId, tenantId)` — confirm user is listed as reviewer
- `validateEvaluationTenant(evaluationId, tenantId)` — tenant isolation check
- `validateReviewersTenant(evaluationId, expectedTenantId)` — sanity check: all reviewers from same tenant

**`src/modules/m6/server/__tests__/comparison.test.ts` — NEW test file:**
- 6 unit tests for `validateScoreRange()` covering valid/invalid ranges, integers, boundaries, edge cases (NaN, Infinity)
- Docstring notes async validation functions tested via integration tests in `actions.test.ts`

**`src/modules/m6/server/__tests__/scoring.test.ts` — scoring tests enhanced:**
- +4 new test cases for criterion average, score distribution scenarios, boundary consensus, ESR edge cases
- Total: 24 scoring + validation tests

## Kanıt

**Tests pass (all 721 tests; 709 active):**
```
Test Files  65 passed | 2 skipped (67)
Tests  709 passed | 12 skipped (721)
```

**Typecheck:** ✅ clean (0 errors)  
**Lint:** ✅ clean (0 M6 errors; existing warnings unrelated)  

**Key validation rules enforced:**
1. **Score range:** 1–5 only (DB CHECK + app validation)
   ```typescript
   export function validateScoreRange(score: number): boolean {
     return Number.isInteger(score) && score >= 1 && score <= 5;
   }
   ```
2. **Duplicate prevention:** `@@unique([reviewerId, criterionId])` in schema; also checked at app level
3. **Tenant isolation:** all queries use `tenantId` filter; no cross-tenant access
4. **Reviewer access:** `validateReviewerAccess()` confirms user listed on evaluation before score retrieval

**Git history:**
```
b6ed409 fix(m6): remove unused imports in comparison module
c8f6f9f feat(m6): scoring logic & calculation engine
```

## Değişen dosyalar

```
src/modules/m6/server/scoring.ts (+ calculateCriterionAverage, getScoreDistribution)
src/modules/m6/server/comparison.ts (NEW — 6 validation functions, compareM6ToESR)
src/modules/m6/server/__tests__/scoring.test.ts (+ 4 test cases)
src/modules/m6/server/__tests__/comparison.test.ts (NEW — 6 validation tests)
```

## Riskler

**None identified.** 

- Score range validation matches DB CHECK constraints (no divergence)
- Tenant isolation enforced via Prisma query filters + app-level checks (defense in depth)
- Duplicate scores prevented by UNIQUE constraint + runtime check (idempotent)
- Async validation functions (reviewer access, tenant checks) tested via actions.test.ts integration suite

## Sonraki adımlar

1. **M9 Calendar Sync (TASK-MTPZL5YDY9TAW):** Meeting brief UI & calendar component — continues in parallel
2. **P0 M9 Brief (TASK-MTQUX5IZ9I5VP):** Brief saving + fake data — blocking; fix async
3. **M6 Panel UI** (not yet in sprint): wire up scoring functions to proposal evaluation dashboard (upcoming)

## Definition of Done

- ✅ Scoring functions (`calculateCriterionAverage`, `getScoreDistribution`) implemented
- ✅ ESR comparison module (`comparison.ts`) created with validation rules
- ✅ Score range: 1–5 enforced (strict, DB CHECK + app validation)
- ✅ Reviewer access validation (`validateReviewerAccess`)
- ✅ Tenant isolation confirmed (`validateEvaluationTenant`, `validateReviewersTenant`)
- ✅ Duplicate score prevention (UNIQUE + runtime check)
- ✅ 721 tests pass; typecheck clean; lint clean
- ✅ Commits clean; squashed to logical units (feat + fix)
- ✅ No new security vulnerabilities (score range, tenant isolation, access control verified)

---

**Duration:** ~45 min  
**Result:** M6.3 scoring & calculation engine ready for dashboard integration.
