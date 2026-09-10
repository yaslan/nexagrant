---
name: fabrika-a-probe-total-dropping-is-not-all-your-work
description: In the shared tree a compiler-probe total falls because neighbours are fixing their slices too — attribute a measurement per file, never by the aggregate delta
metadata:
  type: project
updatedAt: 2026-09-10
---

Measuring the `noUncheckedIndexedAccess` surface for slice 2
(TASK-MTVPOR2CMV1RT): the probe total went **148 → 105**, a drop of 43. The
slice owned **16**. The other 27 were slice 1's files
(`prisma/seed-m6-evaluations.ts`, `scripts/compare-production-backup.ts`,
`scripts/cordis-import.ts`, `scripts/verify-deployed-bytecode.ts`), closed by
another agent in the same working tree while the slice was in progress.

**Why:** every agent here shares one checkout, so a whole-project compiler run
photographs everyone's work at once. Reporting "I took the total from 148 to
105" would have claimed 27 errors of someone else's work — and the same effect
runs in reverse: a total that fails to drop can hide your fix behind a
neighbour's newly added errors.

**How to apply:** report the per-file count, not the total. Diff before/after
grouped by file and check both directions:

```bash
byfile() { grep 'error TS' "$1" | sed 's/(\([0-9]*\),.*//' | sort | uniq -c | sort -k2; }
diff <(byfile before.log) <(byfile after.log)
```

Lines that only *disappear* mean nothing regressed; a file that gained errors is
either yours or a neighbour's and must be attributed before you claim a green.
Quote your own files' counts in the report and say explicitly who closed the
rest.

Related: [[fabrika-agents-share-one-working-tree]],
[[fabrika-attribute-lint-typecheck-noise-with-git-show-head]],
[[fabrika-baseline-snapshot-goes-stale]].
