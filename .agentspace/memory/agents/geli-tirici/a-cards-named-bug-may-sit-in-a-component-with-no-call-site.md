---
name: a-cards-named-bug-may-sit-in-a-component-with-no-call-site
description: Grep for a component's call sites before promising a real-browser repro — a card's "real bug" can live in dead code, making the e2e demand unsatisfiable
metadata:
  type: feedback
updatedAt: 2026-09-10
---

TASK-MTVPOR2CMV1RT named `EvidenceForm.tsx:95` a real user-facing bug and asked
for a Playwright repro of the file-picker cancel path. The defect was real at
the type level, but the component **has zero call sites** — the live evidence
upload UI is the modal inside `evidence-client.tsx`, which already writes
`e.target.files?.[0]` correctly. So the browser repro could not be produced at
all: there is no route that renders the component.

**Why:** a card author reading a `tsc` error list sees file paths, not
reachability. An error list says a file compiles, never that anything imports
it. Accepting "this is a user-visible bug" from the card and then failing to
reproduce it in a browser looks like a testing failure; it is actually a
premise failure, and only a call-site grep distinguishes the two.

**How to apply:** before accepting any "user-visible / reproduce in browser"
claim about a component, run
`grep -rn "<ComponentName>" --include='*.ts' --include='*.tsx' src` and confirm
a real call site (watch for dynamic `import()` and re-exports too). If the only
hit is its own definition, say so in the report, state plainly that the
real-browser evidence is unobtainable and why, fix the contract anyway if the
file is staying, and do NOT delete the file — that is a separate, destructive
decision. Note also that a similarly-named component (`EvidenceDrawer`) will
pollute a loose grep; match the exact name.

Related: [[fabrika-a-refactor-docstring-claims-work-that-may-not-exist]] — same
shape of error, a claim in a card or docstring that the tree does not support.
