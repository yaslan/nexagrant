# TASK-MUSLBY3NHR3LQ#review-pr22 — PR #22 review (crw2-fb)

**Hüküm:** ONAY (no blocking findings; 2 non-blocking suggestions)
**Tip:** review (E2E test fix: external network dependency)
**Platform:** mac (darwin, Chromium/Playwright, `next dev`) locally; Linux (ubuntu) in CI, where it passed. The change is only a Playwright spec, so no platform-specific code path is involved. `context.route` and `proxy` work the same way in Chromium on Linux (CI = ubuntu). Windows: not run, because there is no Windows machine. Nothing in the code depends on the platform.

Reviewed: `qae-fb/remove-external-links-deps` @ `483171b0` (base `dev`), in my own detached worktree `/Users/macbook/alan/FONBRIDGE-wt-crw2fb-review-pr22`, E2E_PORT=4322. No code was changed and nothing was merged.

## 1. What was done

The PR changes one file, `tests/e2e/m1-partner-outreach.spec.ts` (+14/−2):
- `context.route(...)` fulfills the 5 external hosts with `200 ''` (lines 97–102).
- In the popup step, `waitForURL` timeout goes from 30 s to 5 s (line 134). The comment is updated.

### (a) Did the claim get weaker?
**No.** Note: the task brief says the `popup.waitForURL` lines were "deleted". That is **not true**. The lines are still there; only the timeout changed. Every assert is the same as in the old test:

```
$ git diff origin/dev...HEAD -- tests/e2e | grep -E '^[-+].*(expect|timeout|skip|waitFor)'
+      // Mock external domains to prevent network timeout flakiness; fulfill with empty response
+      // waitForURL while avoiding the external dependency.
+      // A real click opens a new tab (mocked to prevent network timeout flakiness).
-      await popup.waitForURL(/ec\.europa\.eu/, { timeout: 30_000, waitUntil: 'commit' });
+      await popup.waitForURL(/ec\.europa\.eu/, { timeout: 5_000, waitUntil: 'commit' });
```

- No `expect` was removed or loosened. No `skip` was added.
- The test still proves that a real click opens a new tab: `context.waitForEvent('page')` (130–133), that the popup URL host is `ec.europa.eu` (135), and that `window.opener === null` (136). The only difference is that the popup now gets a mocked empty 200 instead of the real EU page. The test never checked the content of the real page, so it loses no proof. All it loses is "the real site is up", and an E2E gate should not check that.
- Timeout 30 s → 5 s: the mocked response comes back in milliseconds (the full test takes about 0.9 s). 5 s is a large margin. If the mock is not applied, the test fails fast instead of hanging for 30 s, which is better.

### (b) Is it only this spec?
Yes. No other spec opens a popup or goes to an external URL:
```
$ grep -rnE "waitForEvent\('(page|popup)'\)|target', '_blank'|goto\('https?://" tests/e2e | grep -v m1-partner-outreach
(empty)
```
The `ec.europa.eu` `sourceUrl` values in `tests/e2e/fixtures/cagrilar-response.json` are only data in a mocked `/api/cagrilar` response (`calls-sedia-status.spec.ts:56`, `render-purity-refactor.spec.ts:94`). No test navigates to them.

## 2. Evidence

### (c) External network blocked, `--repeat-each=10 --retries=0`
Network block: an untracked scratch config `pw-offline.config.ts` sends all browser traffic to a dead proxy (`proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1' }`). Only localhost can be reached.
```
E2E_DATABASE_URL=$(grep ^DATABASE_URL= .env | cut -d= -f2-) E2E_PORT=4322 ANTHROPIC_API_KEY=invalid OPENAI_API_KEY=invalid \
 pnpm exec playwright test -c pw-offline.config.ts tests/e2e/m1-partner-outreach.spec.ts --repeat-each=10 --retries=0
Running 30 tests using 1 worker
  ✓   1 … external search links and e-mail templates work (tr) (2.3s)
  ✓   2 … external search links and e-mail templates work (en) (962ms)
  ✓   3 … fits a 390px phone without horizontal scroll (tr) (707ms)
  … (4–29 all ✓, 655ms–1.0s)
  ✓  30 … fits a 390px phone without horizontal scroll (tr) (671ms)
  30 passed (38.1s)
```
**Control (proves the block is real):** I ran the `origin/dev` version of the same spec with the same config. It fails the same way CI failed:
```
  ✘  1 … zz-crw2-devcopy.spec.ts:91:9 … work (tr) (31.7s)
    TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
    > 122 |       await popup.waitForURL(/ec\.europa\.eu/, { timeout: 30_000, waitUntil: 'commit' });
  1 failed
  1 passed
```
→ Old test: red without network. New test: green without network. The fix removes the external dependency, as intended. (The temporary copy was deleted.)

### (d) My own mutants (RED → revert → GREEN)
M1. In `src/modules/m1/outreach.ts:45`, the `ft` host `ec.europa.eu` → `example.com`:
```
  ✘  1 … work (tr) (1.2s)
    Expected: "ec.europa.eu"
    Received: "example.com"
    > 116 |         expect(new URL(href).host).toBe(host);
  1 failed
```
M2. In `src/modules/m1/ui/PartnerOutreach.tsx:125`, `target="_blank"` → `target="_self"`:
```
  ✘  1 … work (tr) (11.1s)
    Expected: "_blank"
    Received: "_self"
    > 113 |         await expect(a).toHaveAttribute('target', '_blank');
  1 failed
```
After the revert (`git status`: only `?? pw-offline.config.ts`):
```
  ✓  1 … work (tr) (1.4s)
  ✓  2 … work (en) (863ms)
  ✓  3 … fits a 390px phone … (tr) (688ms)
  3 passed (6.1s)
```
Lint: `pnpm exec eslint tests/e2e/m1-partner-outreach.spec.ts` → exit 0.

### (e) `gh pr checks 22`
At review time (16:41 UTC):
```
build-and-test	pending	0	https://github.com/yaslan/fonbridge/actions/runs/37137194443/job/111244013460
```
**Final (CI):**
```
$ gh pr checks 22
build-and-test	pass	18m22s	https://github.com/yaslan/fonbridge/actions/runs/37137194443/job/111244013460
# E2E summary in the log:
  2 skipped
  220 passed (11.7m)
```

## 3. Findings (by severity)

No blocking findings.

- **Suggestion 1 (dead code):** `m1-partner-outreach.spec.ts:99–102`. Only the `ft` link is clicked, so the 4 routes for `een`, `ideal-ist`, `b2match` and `linkedin` never match. They do no harm and act as a guard if a click is added later. You can keep them or delete them. Not a defect.
- **Suggestion 2 (inaccurate comment):** `:129` says "(3) no opener (proves target="_blank" + rel="noopener")". `window.opener === null` proves `noopener`, not `target="_blank"`. The new tab is proven by the `waitForEvent('page')` in (2), and the attributes are checked at 113–114. Suggested wording: "(3) no opener → rel=noopener".

## 4. Risks
- Inaccurate claims in qae-fb's report (they do not affect the code): "Platform: Sonoma 14.7" (the machine is Darwin 27); "Risk: NONE"; and the CI run `37134272315` that it cites as the source of the flake was not checked in this review. The card/brief also says "popup.waitForURL deleted", but those lines are kept.
- The mock fulfills the popup with an empty 200, so a broken URL path on the real site (e.g. if the EU portal moves `partner-search`) cannot be caught. The old test could not catch that either (it used `waitUntil: 'commit'` and never checked the page content). This is not new risk.

## 5. Open questions
None.

## 6. Next step
After CI is green, the merge decision is the lead's. Suggestions 1 and 2 can be handled in this PR or later; they do not block.

## Changed files (by this review)
Only this report. No changes to the PR branch.
