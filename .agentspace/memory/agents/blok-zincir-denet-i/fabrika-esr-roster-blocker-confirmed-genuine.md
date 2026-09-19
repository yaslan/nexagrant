---
name: fabrika-esr-roster-blocker-confirmed-genuine
description: E11.3 (TASK-MTQ2KL3JO4MK2) ESR calibration roster blocker independently audited — confirmed genuine external/human dependency, not a hidden code bug
metadata:
  type: project
  updatedAt: "2026-09-10"
---

Audited (2026-09-10) whether E11.3's "blocked on human action" claim (`pnpm beta:esr-preflight` → 4 reds: roster, survey-sent, responses, accuracy) was real or a code bug dressed up as a data gap. **Confirmed genuine** on all four, after reading `docs/BETA_DATA/beta-partners.csv` (all 10 rows on the RFC 2606 `.invalid` TLD, header says PLACEHOLDER), the readiness-gate code (`src/lib/beta/esr-readiness.ts`), and live-testing the anti-gaming self-test-file rejection (`--responses=docs/BETA_DATA/esr-survey-responses.example.csv` correctly gets flagged as self-test even though it pushes accuracy to 85%).

**Nuance for next pass:** the 4th red ("accuracy" 80% < 85%) is not purely "waiting on partner data" — it could also be closed by a NEW boss decision to lower the composite threshold, but the code deliberately blocks that route (`esr-readiness.ts:274`) because it would be overfitting a closed decision (Roadmap Açık kararlar #8, 2026-09-06) to 20 curated hard-case fixture rows. Don't offer threshold-lowering as a "code fix" without flagging this is scope creep on a closed decision.

**New gap found, not yet a card:** `RESEND_API_KEY` is unset on the dev machine and the preflight gate never checks for it — so even once the roster is real, `--send` will fail a second time with a fresh, unpreflighted error. Proposed as a small preflight-enhancement card (add a check to `evaluateEsrReadiness`), not done yet.

**Do NOT create a new roster template file** — `docs/BETA_DATA/beta-partners.csv` already is the exact template the PM/boss should copy to `docs/BETA_DATA/beta-partners.local.csv` and fill in. Only `contactEmail` is validation-enforced real; `contactName`/`orgName` should also be real for a non-embarrassing survey but aren't code-enforced.

Full writeup: `docs/agent-results/TASK-MTQ2KL3JO4MK2-denetim.md`. See also [[fabrika-roadmap-decision-9-stale]] (found while writing this report) and [[g0-scoring-production-hooked]] (confirms the calibration's target function IS wired to production, so closing E11.3 will actually matter).
