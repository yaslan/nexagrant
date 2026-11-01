---
name: fabrika-roadmap-decision-9-stale
description: docs/ROADMAP.md Açık kararlar #9 ("G0 canonical function never called in production") is stale — the hook landed same-day and the doc was never updated
metadata:
  type: reference
  updatedAt: "2026-09-10"
---

`docs/ROADMAP.md` line 132 (Açık kararlar #9) says `scoreG0()`/`decideG0()` are "bugün hâlâ hiçbir üretim çağrı noktasında kullanılmıyor" (measured 2026-09-07). This is **not current** — verified 2026-09-10 by grep:

- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:241` → `rescoreOpportunityG0(tenantId, created.id)`
- `src/lib/gates/evaluate.ts:108` → `computeG0ForOpportunity(tx, tenantId, opportunityId)`
- `src/lib/scoring/g0-compute.ts` last touched 2026-09-10 (actively maintained, not dead code)

The hook (commit `c60dfe7`, 2026-09-07 11:27) landed the same day the roadmap entry cites as its measurement date — almost certainly the doc was written before the fix, then never revisited. Matches [[g0-scoring-production-hooked]] in `blok-zincir-denet-i`'s own memory, which recorded the fix correctly on 2026-09-07.

**How to apply:** before citing ROADMAP #9 (or PROJECT.md:81's footnote referenced by it) as "G0 isn't wired to production," grep for `rescoreOpportunityG0`/`computeG0ForOpportunity` first — the doc lags the code here. Whoever picks up TASK-MTQ63RR8Z0G8E next should also just delete/close roadmap decision #9 rather than re-answer it.

Found while auditing TASK-MTQ2KL3JO4MK2 — see `docs/agent-results/TASK-MTQ2KL3JO4MK2-denetim.md` §5 for the full trail.
