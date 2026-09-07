---
name: fabrika-task-id-reuse-in-wave
description: The same TASK-xxxx id can be handed to multiple agents for unrelated work in a closing wave — evidence/screenshot folders under that id may hold another task's files
metadata:
  type: project
  updatedAt: 2026-09-07
---

Observed during the S10 closing wave (2026-09-07): `TASK-MTQWBAJ2T5XSV` had at
least four unrelated result files —
`docs/agent-results/TASK-MTQWBAJ2T5XSV-blockzincir-pm.md` (F11+F14, esr-calibration
fixture), `-customer-support.md`, a `fix(k5): assign pipeline cards to real
tenant members` commit (`ed39194`), and this session's own F15 (Turkish caps
corruption, [[fabrika-css-uppercase-turkish-dotted-i]]) — all filed under the
same task id. The shared `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/`
folder ended up holding screenshots from all of them, numbered `01-`, `02-`...
with no natural collision only because each agent happened to pick different
descriptive suffixes.

**How to apply:** before trusting a result file or a screenshot under
`docs/agent-results/TASK-<id>-*`, check whether its content actually matches
the task you were given (read the file, don't just assume the id ties it to
your work) — see also [[fabrika-board-cards-go-stale]] for the related "in_progress
card may show finished work" trap. When writing your own result file, keep
your own agent-name suffix (`TASK-<id>-<your-agent-name>.md`) so at least the
report itself never collides, and give your screenshots descriptive names
(not bare `01.png`) so they don't silently overwrite or blend into another
agent's evidence in the shared screenshots folder for that id.
