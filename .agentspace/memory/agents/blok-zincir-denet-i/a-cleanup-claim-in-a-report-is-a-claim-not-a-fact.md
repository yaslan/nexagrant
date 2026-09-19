---
name: a-cleanup-claim-in-a-report-is-a-claim-not-a-fact
description: A report saying "test data was removed" often means the seed SCRIPT file was deleted, not that the DB rows it wrote were deleted — check live state, not prose
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Kural

A verification report's line like "seed-test-alerts.ts deleted, seed.ts reverted" or
"test alerts were then removed" describes what happened to the **code artifact** used to
generate test data. It does not, by itself, say anything about whether the **rows that
code wrote to the database** were deleted. These are two different deletions and a report
can be honestly worded and still leave the second one undone — the author likely believed
deleting the seed script implied the data was gone, or forgot the DB write was permanent.

**Concrete case (TASK-MTVFKK8UZS5BF, 2026-09-10):** a report claimed "Test alerts were
then removed" after seeding 286 rows into `SystemAlert` to verify a >300-row truncation
fix. Querying the live DB during audit showed all 286 rows (`source`: test-module/
test-worker/test-api, message `"Test alert for truncation testing #N"`) still present,
`resolvedAt: null`, making up 89% of the table's 320 total rows. `pnpm alerts:check`
passed anyway because that gate only flags rows whose `meta.tenantId` points at a deleted
tenant — these generic rows carry no `tenantId`, so they're invisible to that specific
gate while still polluting the exact "real total alert count" metric the fix under review
was supposed to make trustworthy.

## Why

A QA/audit role's job is exactly to not take "removed", "cleaned up", "done" at face value
from another agent's report — that is the whole point of an independent audit pass. The
gate that would normally catch orphaned SystemAlert rows (`alerts:check`) is scoped to a
narrower defect (tenant-FK orphans) and does not generalize to "is this row real product
signal or test debris" — so a clean gate result is not evidence the console's numbers are
trustworthy. See [[fabrika-tests-leave-permanent-alerts-in-the-operator-console]] for the
underlying mechanism (`SystemAlert` has no FK/cascade, so anything that writes one and
forgets a scoped `deleteMany` leaves it forever).

## How to apply

- When a report claims test/seed data was "removed" or "cleaned up", **query the live
  table it wrote to** (grouped by a source/message pattern named in the report) before
  accepting the claim — don't infer DB state from "I deleted the script".
- A gate passing (e.g. `pnpm alerts:check`) only proves what that gate specifically checks
  for; state the gate's actual scope before treating "gate green" as "data is clean".
- If found dirty: report the row count and fraction of the table it represents (89% here)
  — that framing is what makes the defect legible, not just "N stray rows exist".
- Unrelated but adjacent finding from the same audit: `git log -S <symbol>` can reveal a
  fix landed inside a commit whose message is entirely about a different task
  (`14c04f3`, message about billing/iyzico, diff also contains the alerts-console fix) —
  this is the same shared-tree sweep class documented in
  `fabrika-shared-messages-json-may-already-be-committed.md` and
  `git-add-verify-before-commit.md` (other agents' memory); when a report gives no commit
  hash, use `-S` on a symbol unique to the change to locate the actual landing commit
  before trusting "it's on HEAD".

## Related

[[fabrika-tests-leave-permanent-alerts-in-the-operator-console]] — why SystemAlert rows
from tests never self-clean
[[a-record-is-not-a-document]] — same shape of lesson one level up: a claim written in a
report/record is not the same as the state it claims to describe
