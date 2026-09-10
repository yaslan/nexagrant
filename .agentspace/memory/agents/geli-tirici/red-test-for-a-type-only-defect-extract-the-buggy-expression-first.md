---
name: red-test-for-a-type-only-defect-extract-the-buggy-expression-first
description: To get an honest failing test for a type-contract defect, first extract the buggy inline expression verbatim into a named function, then fix its body — the red shows a value mismatch instead of "export does not exist"
metadata:
  type: feedback
updatedAt: 2026-09-10
---

A `noUncheckedIndexedAccess` defect is usually inline and untestable: an index
read buried in a JSX `onChange` or a `setState` updater. Writing the regression
test against a helper that does not exist yet gives a worthless red —
`TypeError: x is not a function` proves nothing about the bug.

The sequence that produces real evidence, in three steps:

1. Extract the inline expression into an exported named function **verbatim,
   bug included** — a pure refactor, no behaviour change, and it still compiles
   under the repo's current (flag-off) config.
2. Run the test. The red is now a value mismatch that names the defect, e.g.
   `expected { text: '' } to deeply equal { text: '', authorId: 'user-fallback' }`
   or `Object.is(result, null)` → false because the value is `undefined`.
3. Fix the body. Green.

**Why:** the intermediate state is never committed, so this costs nothing, and
the captured red/green pair is the difference between "I claim this was a bug"
and evidence a reviewer can read. It also leaves the logic as a pure function —
which is what CLAUDE.md asks for anyway.

Two assertion notes that mattered: use `Object.is(x, null)`, never
`expect(x).toBeFalsy()`, when the regression value is `undefined` — both are
falsy, so a loose check passes on the bug. And `toEqual` catches an **absent**
key against an expected one, which is how the missing `authorId` surfaced.

Related: [[fabrika-photograph-degraded-state-by-renaming-function]].
