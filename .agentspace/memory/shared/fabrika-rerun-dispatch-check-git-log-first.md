---
name: fabrika-rerun-dispatch-check-git-log-first
description: A "yeniden koşu" (rerun) dispatch claiming "previous attempts did no work, tree has no half-done code" can be wrong for an individual task — check git log on the target files before assuming a fresh start
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTRD91ZLKEQ3A was dispatched a third time as "S12 Dalga 7 (YENİDEN
KOŞU — önceki iki denemede pane'ler açıldı ama limit nedeniyle prompt hiç
başlamadı; hiçbir iş yapılmadı, ağaçta yarım kod YOK, sıfırdan başla)". That
premise was false for this specific task: `git log -- <billing page.tsx>`
showed it was fully fixed and committed to `dev` on 2026-09-07 in two commits
(`219ddca`, `bb78d65`), with a complete evidence report already at
`docs/agent-results/TASK-MTRD91ZLKEQ3A-blog-yazar.md`. The "previous attempts
never started" framing is a **batch-level** observation (about panes that
never got a prompt) applied uniformly to every task in the wave; it does not
mean every individual task in that wave is actually untouched.

**Why this matters:** acting on the "sıfırdan başla" framing without checking
would mean either quietly re-doing finished work (wasted tokens, risk of
regressing a careful fix) or, worse, not noticing the fix already shipped and
reporting a false "iddia doğrulandı, düzelttim" for something that was fixed
a day earlier by a different session.

**How to apply:** on any "rerun"/"tekrar dispatch" task, before writing code,
run `git log --oneline -5 -- <the file(s) the card names>` and check
`docs/agent-results/` for an existing report with the same TASK id. If a
report already exists and the commit is on the current branch, treat this as
a **re-verification** task (per the standing rule to try to refute the
card's claim, not confirm it): re-measure independently with fresh
evidence, and if the prior fix holds, say so plainly rather than inventing
new changes to justify the dispatch. Flag the stale "no prior work" framing
back in "Açık sorular" so whoever schedules the next wave can avoid
re-dispatching an already-closed task.
