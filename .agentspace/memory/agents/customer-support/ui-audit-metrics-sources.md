---
name: ui-audit-metrics-sources
description: UI metric sources audit findings — G0 Score seed hardcoding, Başarı Oranı case bug, Evaluator Lens label missing
metadata:
  type: project
  updatedAt: 2026-09-07
---

## UI Audit Findings — Metric Source Verification (TASK-MTQ63RR8Z0G8E)

**Date:** 2026-09-07  
**Status:** 3 P0 + 2 P1 issues found  
**Report:** `/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md`

### Critical Issues (P0)

#### 1. Evaluator Lens — Missing "iç ön değerlendirme" Label
- **File:** `src/modules/m6/ui/EvaluationDashboard.tsx`
- **Issue:** Panel evaluation scores shown without disclaimer that they are "internal preliminary" (iç ön değerlendirme)
- **Rule Violation:** CLAUDE.md § 8 (UI must use `t()` for all user text) + § 7 (evidence audit)
- **Impact:** Users see panel scores as official, not preliminary estimates
- **Fix:** Add label "⚠️ İç Ön Değerlendirme" to EvaluationDashboard component
- **Commit:** TBD (separate fix task)

#### 2. Başarı Oranı (Success Rate) — Case Mismatch Bug
- **File:** `src/lib/dashboard/fetch-metrics.ts:35`
- **Bug:** Code checks `['SUBMITTED', 'FUNDED', 'ABOVE_THRESHOLD'].includes(outcome)` but database stores `outcome = 'above_threshold'` (lowercase)
- **Result:** Dashboard shows "Başarı Oranı: 0%" when it should show "20%" (1/5 proposals)
- **Source:** Schema comment says `// funded | reserve | above_threshold | below` (all lowercase)
- **Impact:** Success metrics appear 100% worse than reality; team morale and reporting affected
- **Fix:** Change `fetch-metrics.ts:35` to lowercase: `['submitted', 'funded', 'above_threshold']`
- **Commit:** TBD (separate fix task)

#### 3. Demo Mock — Random G0 Score (Hardcoded)
- **File:** `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:45`
- **Code:** `calculatedScore = Math.floor(Math.random() * 15 + 80)` (random 80–95)
- **Issue:** New opportunities created via UI get random g0Score instead of computed value
- **Impact:** Demo data pollutes production seed with fake scores
- **Status:** Demirtaş (scaffolding), but should be removed or marked clearly
- **Fix:** Either remove or add comment /* TODO: remove, demo only */

### Secondary Issues (P1)

#### 4. G0 Score — Hardcoded Seed Values
- **Finding:** All G0 Scores in dashboard (avg 84.4) come from seed: [75, 82, 85, 88, 92]
- **Source:** `prisma/seed-opportunities.ts` hardcoded statically
- **Truth:** Canonical function `src/lib/scoring/g0-canonical.ts::scoreG0()` exists but **never called in production**
- **Status:** Known (dün keşif — TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md)
- **Implication:** Dashboard metrics are recycled static data, not real calculations
- **How to Apply:** When G0 scoring goes live (separate sprint), seed will automatically reflect real computation

#### 5. G0→G2 Duration — Unrealistic (0 days)
- **Dashboard shows:** "G0→G2 Süresi: 0 gün"
- **Reason:** All seed opportunities created at same timestamp (2026-09-06T16:04:55.313Z ±5ms)
- **Impact:** Duration metric useless; team cannot see real pipeline speed
- **Fix:** Seed opportunities with staggered createdAt: (now - 30d, now - 20d, now - 10d, now - 5d, now)

### Audit Method

Kanıt taraması (source code audit) + seed verification + metric calculation check:

1. **Code grep:** Found metric sources in UI components and fetch-metrics.ts
2. **Seed audit:** `pnpm exec tsx` with live Prisma queries to check actual values
3. **Metric calc:** Ran `fetchDashboardMetrics()` directly, compared expected vs. actual
4. **CLAUDE.md § 7 check:** Evidence binding audit — none found for dashboard KPIs

### Related

- [[e11-2-feedback-validation]] — E11.2 system status (separate module, similar audit needed)
- TASK-MTQ63RR8Z0G8E (dün's keşif) — G0 consolidation findings

### Next

- Create three separate fix tasks (P0 × 2, P1 × 1) in sprint
- Add integration test: verify metric values after data changes (no hardcoding regression)
