---
name: fabrika-g0-conversion-rate-formula
description: E10.1 "başarı oranı" (Proposal.submitted / Opportunity.g0) breaks if g0 means current stage=G0; use total opportunities or G0 gate-decision count instead
metadata:
  type: project
---

The `(Proposal.submitted) / (Opportunity.g0)` success-rate formula only makes sense if
"Opportunity.g0" is read as "opportunities that entered the pipeline via a G0 gate
decision" (≈ total opportunity count, since every opportunity starts at G0), **not**
"opportunities whose `stage` column currently equals G0".

**Why:** `stage` is a moving pointer — as opportunities progress (G0→G1→G2…), fewer and
fewer remain at G0. On the E10 seed data (5 opportunities, 2 submitted proposals) that
gives `2 / 1 = 200%`, a nonsensical ratio. Using total opportunities (or, equivalently,
`GateDecision.count(gate=G0)`, since every opportunity gets exactly one G0 decision) gives
the sane `2 / 5 = 40%`.

**How to apply:** any future "conversion rate" / "başarı oranı" KPI keyed off a gate name
should filter by `GateDecision` history (or total entity count) for the denominator, never
by the entity's *current* stage/status column, when the intent is "how many ever reached
this gate" rather than "how many are stuck here right now".

Also found while checking: [[fabrika-m5-kpi-duplicate-implementations]] — two separate
success-rate implementations exist in the codebase with different (and non-equivalent)
definitions.
