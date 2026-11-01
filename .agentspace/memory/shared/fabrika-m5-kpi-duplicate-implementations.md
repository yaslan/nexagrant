---
name: fabrika-m5-kpi-duplicate-implementations
description: Two parallel M5 KPI/success-rate implementations exist (queries.ts wired live, fetch-metrics.ts orphaned) with different success-rate definitions
metadata:
  type: project
---

Two separate files compute dashboard KPIs for M5, written by different parallel agents,
with different "success rate" definitions:

- `src/modules/m5/server/queries.ts` (`getKpiMetrics`/`getKpiTrend`) — wired into the live
  dashboard route. `successRate` = proposals whose **opportunity.status** is
  FUNDED/ABOVE_THRESHOLD ÷ total proposals in range. This is a win-rate among already-
  submitted proposals.
- `src/lib/dashboard/fetch-metrics.ts` (`fetchDashboardMetrics`) — appears orphaned, not
  imported by the actual dashboard page. Its "Başarı Oranı" = opportunities whose
  `proposal.outcome` is SUBMITTED/FUNDED/ABOVE_THRESHOLD ÷ total opportunities. This is a
  G0→submission conversion rate, a different metric entirely from the one above.

**Why it matters:** if a future task asks to "fix" or "add" the success-rate KPI, check
which file is actually wired in first (`grep -rn fetchDashboardMetrics src/app`) — the
orphaned one may be exactly what the requester wants, already built and just not called.
See also [[fabrika-g0-conversion-rate-formula]] and
[[fabrika-parallel-agent-collisions]] for the general pattern.

**How to apply:** before adding a third KPI computation, reconcile these two rather than
adding a new file — decide which definition is the product-intended one (docs/ROADMAP.md
or the requester) and delete/merge the other.
