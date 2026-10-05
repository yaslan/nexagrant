---
name: e10-1-hitrate-formula
description: M5 dashboard "isabet oranı" (hit rate) formula was silently wrong — it computed above-threshold rate instead; correct formula and real schema field names
metadata:
  type: project
---

`src/modules/m5/server/queries.ts` `getKpiMetrics`/`getKpiTrend` labeled a KPI
"İsabet Oranı" / hit rate in the UI (`messages/*.json` → `Dashboard.hitRate`)
but actually computed the **above-threshold rate**: proposals whose
`opportunity.status ∈ {FUNDED, ABOVE_THRESHOLD}` divided by total proposals.
Per `docs/ROADMAP.md:63` these are two separate KPIs ("eşik üstü oranı" and
"isabet"), and only one was implemented, under the wrong name.

Fixed 2026-09-06 to the real hit-rate definition: `Proposal.count(submittedAt
not null) / Opportunity.count(g0Score not null)`, guarding the actual
denominator (opportunities), not `totalProposals`, against divide-by-zero.

**Schema gotcha:** a task spec asked for `Opportunity.scoredG0` — that field
does not exist. The real field is `Opportunity.g0Score` (Float?). `Proposal`
has no `status` field either; submission state lives in `Proposal.submittedAt`
(DateTime?) and `Proposal.outcome` (String?). Always check
`prisma/schema.prisma` directly before writing a query from a task
description — field names in task text can be stale or invented.

**Why:** task-board retry of this exact query; a previous attempt left a
broken scratch file (`scripts/_verify-*-tmp.ts`, untracked, duplicate
`const from`/`to`) that blocked `pnpm typecheck` repo-wide — always check
`pnpm typecheck` output isn't being failed by an unrelated stray script
before assuming your own edit broke it.

**How to apply:** if asked again to touch M5 KPI "success rate"/"hit rate"/
"above-threshold rate", know these are meant to be two different numbers —
"eşik üstü oranı" (above-threshold rate) still has no dashboard card as of
this fix; only "isabet oranı" (hit rate, this formula) is shown. Adding the
above-threshold card is a separate, not-yet-scoped task.

See [[fabrika-parallel-agent-file-race]] for the general stray-scratch-file
pattern in this repo (multiple agents writing to `scripts/` concurrently).
