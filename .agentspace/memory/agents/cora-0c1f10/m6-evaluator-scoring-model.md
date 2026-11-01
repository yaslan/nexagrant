---
name: m6-evaluator-scoring-model
description: M6 Evaluator Lens scoring logic — 4 criteria (1–5 scale), 70% consensus threshold, ESR normalization
metadata:
  type: project
  updatedAt: 2026-09-06
---

## M6 Scoring Model (Fabrika v1.1)

**Criteria:** 4 axes (not 5 as some older task specs state)
- Innovation (weight: 0.3)
- Feasibility (weight: 0.2)  
- Impact (weight: 0.3)
- Communication (weight: 0.2)

All weights sum to 1.0.

**Score Range:** 1–5 per criterion (DB enforces via CHECK constraint)
- MIN_SCORE = 1
- MAX_SCORE = 5

**Panel Average:** Weighted sum across reviewers
- `panelAverage = Σ(criterionAverage × weight) / Σ(weights)`
- Example: if all 5s = 5.0, if all 1s = 1.0

**Consensus Rule (Hard Rule: 70% threshold)**
- **Solid:** ≥70% of reviewer pairs within ±1.0 point difference
- **Divergent:** <70% agreement

**ESR Normalization:** ESR score (0–15 official) → 1–5 scale
- `normalized = (esrTotal / 15) * 4 + 1`
- Maps: 0→1, 15→5

**ESR Comparison:**
- `delta = normalized_esr - panel_avg`
- `agreement = true` if |delta| ≤ 0.5
- Used for calibration: how well does M6 panel match official review?

**Related Functions (TASK-MTQ2L2XN88AJN):**
- `calculatePanelScore()` — panel average + consensus
- `calculateConsensusOutcome()` — agreement % detection
- `compareWithEsr()` — delta & agreement check
- `getPanelScoresForProposal()` — query for dashboard
- `updateEvaluationScore()` — persist after reviewer submit
- `getCalibrationMatrix()` — accuracy reporting

**Note:** TASK-MTQ2L2XN88AJN spec mentioned "0–10 slider" and "5 criteria" — these are **outdated**. M6.1 (data model) is the source of truth: 1–5 scale, 4 criteria, as implemented in `types.ts` and `schema.prisma`.

**Status:** ✅ Implemented in S9 (v1.1). 20 unit tests passing. E2E test pending M6.2 UI completion.
