---
name: git-add-verify-before-commit
description: Even a single-file `git add <path> && git commit` can sweep in other agents' concurrently-staged work in this shared repo — always run `git diff --cached --name-only` right before the commit, not just after `git add`
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Running `git add <my-file-only> && git commit` is NOT safe in this repo, even though `git add` only stages the path given. Between the `add` and the `commit`, another agent's own `git add` (on their unrelated files, in the same shared working tree/index) can land in the index first — and `git commit` with no pathspec commits the *whole* index, not just what I just added.

**Why:** Concrete incident (TASK-MTQU0SAD85B8X, 2026-09-07): staged only my own result-report markdown file, then committed. `blok-zincir-dse`'s in-progress G0-production-wiring work (TASK-MTQ63RR8Z0G8E — `g0-compute.ts`, `g0-features.ts`, `evaluate.ts`, scratch `qd.mjs`/`qd2.mjs`, screenshots — 16 files) was staged in the shared index at that moment and got swept into my commit under my unrelated commit message. Content turned out to be real, finished, non-broken work (typecheck came back clean on a re-run — the first failure was a transient race from a third agent editing a file live, not a regression), so no damage was done, but the commit is misattributed and could have confused the owning agent's own commit flow. This is the concrete case behind [[fabrika-parallel-agent-file-race]] — that memory names the risk, this one is the worked example of how easily it happens even when you think you scoped `git add` correctly.

**How to apply:** In this repo, before *every* commit — not just ones with `git add -A` or `.` — run `git diff --cached --name-only` (or `--stat`) immediately before `git commit` and confirm the list is exactly what you intended, even if you just ran a scoped `git add <path>`. If it isn't, `git restore --staged <unwanted paths>` before committing rather than committing everything and sorting it out after. Do not "fix" an already-landed sweep-in with `reset`/`revert` — that risks destroying another agent's real work; instead document it transparently (as done here) and let the owning agent/PM confirm.
