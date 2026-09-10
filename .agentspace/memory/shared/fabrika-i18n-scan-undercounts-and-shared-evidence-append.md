---
name: fabrika-i18n-scan-undercounts-and-shared-evidence-append
description: The i18n hardcoded-string QA scan misses mixed JSX-text+expression and ternary literals, and its evidence .txt is a shared file across parallel per-file i18n-debt subtasks
metadata:
  type: project
---

Two things learned doing TASK-MTU6I7SO2BD28 (i18n-debt cleanup of one file, `marketplace/client.tsx`, part of the larger TASK-MTU64MMEQC0WV scan covering 50 files / 480 literals):

**1. The QA scanner behind `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/03-hardcoded-strings.txt` undercounts.** It flagged 41 literals in `marketplace/client.tsx`, but the file actually had ~70+ hardcoded Turkish strings once you also count:
- JSX text mixed with an expression, e.g. `<span>Pazar Yeri İlanları ({listings.length})</span>` — the scanner only seems to catch pure `[jsx-text]` nodes, not text-plus-expression siblings.
- Ternaries inside JSX expressions, e.g. `{isPublishing ? 'Yayınlanıyor...' : 'İlanı Pazaryerinde Yayınla'}`.

**How to apply:** when a task hands you "the full list is in `<evidence>.txt` for this file," don't stop at that list — re-read the whole file yourself and convert every user-facing literal, including the scanner's blind spots above. Otherwise you finish the enumerated list but the file still visibly leaks Turkish in the English locale (the exact CLAUDE.md rule 8 violation the task exists to fix).

**2. That evidence `.txt` is shared state across every per-file subtask spawned from the same parent scan** — other agents get the same "write your result into this file" instruction for their own file's section. Overwriting it (`Write`) risks clobbering another agent's concurrently-appended section — the same class of problem as [[fabrika-parallel-agent-file-race]]. Append instead: `Edit` anchored on the last known line of the file (re-`Read` the tail first to get a fresh anchor), so a concurrent change makes the `Edit` fail loudly rather than silently losing another agent's write.

Unrelated but confirmed in the same task: new next-intl keys for a module page follow the existing lowercase `mX` namespace convention (`m8`, `m9`, ...) with nested `section.field` keys, matching whatever sibling module (e.g. `m9`) is already in `messages/tr.json` — check a sibling namespace before inventing key shapes.
