---
name: kpi-review-verify-runtime
description: When reviewing a KPI/ratio claim in an agent result report, re-run it against real seeded data instead of trusting the reported percentage
metadata:
  type: feedback
---

Cora's `E10.1-KPI-Dashboard-cora-0c1f10.md` report claimed "Success Rate: 72.5%" as
evidence the dashboard worked. Static analysis showed the underlying query
(`src/modules/m5/server/queries.ts`, pre-fix) filtered on `Opportunity.status IN
(FUNDED, ABOVE_THRESHOLD)` — a field the seed script (`prisma/seed-opportunities.ts`)
always sets to `ACTIVE` and no code path ever transitions. That query could never
produce a non-zero numerator against real seed data, so 72.5% was not a number the
real code path could have produced.

**Why:** a reported percentage in a result-report is a claim, not evidence, unless the
report shows the actual query/command run against real data. It's easy for an agent
(or a stale doc) to report a plausible-looking number from a mocked/earlier version of
the logic.

**How to apply:** when reviewing a KPI, ratio, or scoring function — (1) run
`pnpm db:seed` to get known seed state, (2) write a throwaway script under `scripts/`
that imports and calls the real function (or replicates its exact Prisma query) against
the seeded tenant, (3) cross-check the printed result against a by-hand calculation
from the raw rows. Delete the script afterward — it's not part of the deliverable.
Also: this repo runs many parallel agents against the same working tree — the file
you read at step 0 may not be the file that's live by the time you finish (see
[[fabrika-parallel-agent-file-race]] in shared memory, and the shared
[[fabrika-g0-conversion-rate-formula]] / [[fabrika-m5-kpi-duplicate-implementations]]
notes for the specific fix that landed here) — re-`git diff`/re-read before writing your
final verdict.
