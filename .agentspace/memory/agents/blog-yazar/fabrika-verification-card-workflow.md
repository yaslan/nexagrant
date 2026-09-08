---
name: fabrika-verification-card-workflow
description: How to independently verify a "review" card that claims a bug is fixed, without trusting the existing test's own assertions or leaving debug code in the repo
metadata:
  type: feedback
---

When a Task Board card asks for **independent verification** of a fix (not to build one),
first check whether another agent already wrote an e2e spec that references the same
TASK-ID in its own header comment (`grep -rn "<TASK-ID>" tests/`). Fabrika's e2e specs
routinely document their own history that way (see `tests/e2e/m10-audit-identity.spec.ts`
for TASK-MTR60M5ESB5PZ) — running that spec is real evidence, but running it is not enough
on its own: the task literally asks to see the claim disproved by DB rows, not by trusting
the spec's own `expect()` calls.

**How to apply:** to get raw DB proof without committing test pollution:
1. Run the existing spec normally first (`npx playwright test <file>`) — confirms it's not
   stale/red.
2. Temporarily `Edit` a `console.log(JSON.stringify(...))` of the raw Prisma row(s) into the
   spec, right before any `afterAll` cleanup/rollback deletes the fixture.
3. Re-run just that one test (`-g "<test name>"`), capture the printed JSON in the report as
   literal terminal output.
4. `git checkout -- <spec file>` immediately after — the debug block must never be committed;
   `git status --short` should show the spec file clean before writing the result report.

This turns "the test says it passed" into "here are the actual `actorUserId`/`actorName`
values from Postgres, printed live" — the stronger claim the card is actually asking for.

Also: `grep` for a fabricated/banned literal (e.g. `'Dr. Mehmet Yılmaz'`) across `src/` will
usually hit several files even after a real fix — Fabrika's convention is to leave the old
bug spelled out in a `/** ... */` doc comment explaining what was wrong and why. Don't count
those as live occurrences; only a string literal or default parameter in executable code
counts. Read each hit's line before concluding the card is still open.

See [[fabrika-unsourced-claims-hide-in-shared-components]] for a related evidence-discipline
lesson from the same sprint (S12).
