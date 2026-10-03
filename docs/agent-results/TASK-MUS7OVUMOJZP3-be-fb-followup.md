---
görev: TASK-MUS7OVUMOJZP3
kod: TASK-MUS7OVUMOJZP3#pr9-followup
ajan: be-fb
tip: hata
hüküm: "Done: Ö-1 (test for mutant O2) and Ö-2 (throwIfAborted plus a race test) added to PR #9 on be-fb/sedia-timeout. Both new tests go RED on their mutant and GREEN on the real code. typecheck, full vitest and render-purity ×3 are green. Not merged."
platform: "Verified on mac (darwin, Node v26.5.0, Chromium via Playwright, E2E_PORT=3317). Linux: PR CI build-and-test. Windows: not run (no machine). The code has no platform dependency (AbortSignal, setTimeout, fetch only)."
---

# PR #9 follow-up: Ö-1 and Ö-2 (be-fb)

**Hüküm:** Done. Ö-1 and Ö-2 are on the branch, with evidence. Not merged.
**Tip:** bug-fix follow-up (test gap + small race)
**Platform:** mac (darwin, Node v26.5.0). Linux: PR CI. Windows: not run, no machine. The changed code uses only `AbortSignal`, `setTimeout` and `fetch`. There are no paths, shells or processes, so it behaves the same on every platform.

Scope: only Ö-1 and Ö-2. I did not do Ö-3, Ö-4, Ö-5 or the badge (they go on a separate card).

## (1) Ne yapıldı
- **Ö-1** `tests/sedia-timeout.test.ts`: new test "a live caller signal does not replace the per-page timeout". It passes a caller `signal` that never fires, a stalled page 2 and `timeoutMs: 50`. It expects the result in under 1 s, `caller.signal.aborted === false`, page 1's topic returned, exactly 2 fetches, and the error `Page 2 fetch error: …timeout`.
- **Ö-2** `src/lib/translation.ts` `withTranslationSlot`: added `signal?.throwIfAborted();` as the first line inside the `try`. Because it is inside the `try`, the `finally` still passes the slot to the next waiter or decrements the counter, so the slot cannot leak.
- **Ö-2 test** `tests/translation-bounds.test.ts`: "a waiter aborted between getting the slot and starting its call sends nothing and frees the slot". I made the race deterministic like this. `wake` is the only code that calls `removeEventListener('abort', …)` on the waiter's signal. The test wraps that method on the client signal and calls `client.abort()` right after the real removal. That is exactly the window between `wake()` and the waiter's `run()`. Then it frees one of the 8 held slots.

## (2) Kanıt

### Ö-1: mutant O2 (`sedia.ts:330`) → RED, reverted → GREEN
```
-          signal: signal ? AbortSignal.any([pageTimeout, signal]) : pageTimeout,
+          signal: signal ?? pageTimeout,
== O2 applied
     × a live caller signal does not replace the per-page timeout 2003ms
Error: Test timed out in 2000ms.
      Tests  1 failed | 4 passed (5)
Updated 1 path from the index
== reverted
      Tests  5 passed (5)
```

### Ö-2: test RED before the fix (it reproduces the race)
```
     × a waiter aborted between getting the slot and starting its call sends nothing and frees the slot 2003ms
Error: Test timed out in 2000ms.
      Tests  1 failed | 9 passed (10)
```
(Without the fix the late call goes out on an already-aborted signal, and only the 3 s fetch timeout ends it. That is the window crw-fb described.)

### Ö-2: after the fix → GREEN
```
 ✓ … a waiter aborted between getting the slot and starting its call sends nothing and frees the slot 1ms
 ✓ … a live caller signal does not replace the per-page timeout 51ms
      Tests  10 passed (10)
```

### Ö-2: the test also catches a leaking variant (throw placed *before* the `try`)
```
+  signal?.throwIfAborted();          ← outside try, so finally does not run
     × a waiter aborted between getting the slot and starting its call sends nothing and frees the slot 4ms
AssertionError: expected { cacheSize: 5000, active: 8, …(1) } to match object { active: 7, queued: +0 }
== restored
      Tests  5 passed (5)
```
So the placement inside the `try` matters, and the test protects it.

### Gates (worktree `FONBRIDGE-wt-befb-sedia-timeout`, run in order, never in parallel)
```
pnpm typecheck  → $ tsc --noEmit ; typecheck EXIT=0
eslint (3 changed files) → EXIT=0
pnpm vitest run → Test Files 320 passed | 6 skipped (326) · Tests 4260 passed | 119 skipped (4379) · EXIT=0
E2E_PORT=3317 playwright tests/e2e/render-purity-refactor.spec.ts --repeat-each=3 --retries=0 → 6 passed (10.6s) · EXIT=0
```
4258 → 4260: that is the 2 new tests. No Playwright run was active during vitest (`pgrep -fl "playwright test"` was empty).

## (3) Değişen dosyalar
- `src/lib/translation.ts` (+3: comment + `signal?.throwIfAborted();`)
- `tests/sedia-timeout.test.ts` (+23: Ö-1 test)
- `tests/translation-bounds.test.ts` (+53: Ö-2 test)
- `docs/agent-results/TASK-MUS7OVUMOJZP3-be-fb-followup.md` (this report)

The worktree also had an uncommitted change to `docs/agent-results/TASK-MUS7OVUMOJZP3-be-fb.md`: crw-fb appended its review summary there. I did not write it, so I left it out of my commit.

## (4) Riskler
- The Ö-2 test wraps `AbortSignal.removeEventListener` on the test's own signal. If `withTranslationSlot` later stops removing the listener in `wake`, the hook will not fire. The test then fails on `expect(woken).toBe(true)`: it fails loudly instead of passing silently.
- The module keeps shared state (`activeTranslations`, the queue). The test frees every slot it held at the end and checks `active: 0, queued: 0`, so later tests start clean.

## (5) Açık sorular
None.

## (6) Sonraki adım
1. Wait for CI build-and-test on the new head, then merge (lead/crw-fb). lighthouse-a11y is red on every PR and does not block.
2. Ö-3, Ö-4, Ö-5 and the badge go on a separate card, as decided.
