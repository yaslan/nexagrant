# TASK-MUSBCXP9RKS3D#m9-brief-bisect — crw2-fb

**Hüküm:** NOT A REGRESSION. The failure comes from the LOCAL ENVIRONMENT, and the spec has a timing weakness. `m9-brief-generate-failure.spec.ts:71` is red locally because the local `.env` has a real `ANTHROPIC_API_KEY`. With that key the brief retry makes a real LLM call that takes about 20 s. The spec gives that wait only the default 10 s `expect` timeout. In CI the E2E web server has no key ("ANTHROPIC_API_KEY not set"), so the action falls back to the template in under 1 s and the test passes. On the same clean dev, with the LLM key overridden to fail fast: **9/9 green**. `src/` has no bug and the DB has no leftover rows. A bisect is not needed: the spec is red in the same way at the start of the range (d0d2f5ec).
**Tip:** debug / root cause (no code changed)
**Platform:** mac (darwin, Node 26.5, local Postgres :5433). Linux CI was read from the logs; I did not run it again. Windows not run (no machine). The cause is environment/timing, so it is not platform dependent.

## 1. Ne yapıldı
- Made a clean worktree OUTSIDE the repo root (`scratchpad/wt-m9`) on `origin/dev` = `da3491a7`. Ran `pnpm install` and `prisma generate`. Port 3471, `--workers=1`. Before each run I checked `pgrep -fl "playwright test"`: no other m9 run was active. One other agent's probe was running at the same time (`zz-probe-diag.spec.ts`, port 3071, evidence tenant). It uses a different tenant and a different port, so it cannot affect `m9-e2e-tenant`.
- (a) Dev mode, 3 runs, real key → 3/3 red. (a') Same tree, LLM key overridden at process level (`.env` NOT changed) → 9/9 green.
- (b) Read the dev CI logs.
- (c) Range check: the files that matter did not change between d0d2f5ec and da3491a7, and the spec is red at d0d2f5ec too, so I did not bisect.

## 2. Kanıt

### (a) Clean origin/dev da3491a7, dev mode, real key: 3/3 RED (same line every time)
```
E2E_PORT=3471 pnpm exec playwright test tests/e2e/m9-brief-generate-failure.spec.ts --repeat-each=3 --retries=0 --workers=1
  ✘  1 … :71:7 … a dropped request surfaces in the band, keeps the form, and retries (14.9s)
  ✓  2 … :133:7 … an action that comes back with no brief is reported, not ignored (1.5s)
  ✓  3 … :184:7 … the happy path still ends with a brief and no band (23.0s)
  ✘  4 … :71:7 … (11.4s)   ✓ 5 (1.3s)   ✓ 6 happy path (24.0s)
  ✘  7 … :71:7 … (11.4s)   ✓ 8 (1.2s)   ✓ 9 happy path (26.2s)

    Error: expect(locator).toBeFocused() failed
    Locator: getByRole('main').getByRole('button', { name: /Yapay Zeka Brief Oluştur/ })
    Timeout: 10000ms
    Error: element(s) not found
    > 123 |     await expect(generate).toBeFocused();
```
Page snapshot at the moment of failure (`error-context.md`). The retry request was still in flight:
```
  - textbox "Görüşülecek Ortak / Kurum Adı": Fraunhofer Institute
  - button "AI Brief Hazırlanıyor..." [disabled]
```
Note: the happy path takes **23–26 s** locally because of the real LLM call. In CI it takes **4.4 s**.

### (a') Same tree, only the LLM made to fail fast: 9/9 GREEN
```
ANTHROPIC_API_KEY=invalid-e2e-crw2 OPENAI_API_KEY=invalid-e2e-crw2 E2E_PORT=3471 pnpm exec playwright test … --repeat-each=3 --retries=0 --workers=1
[WebServer] [M9 generateMeetingBrief] LLM call fallback: Anthropic API error 401: … invalid x-api-key
  ✓  1 … :71:7 … retries (3.2s)   ✓ 4 (2.9s)   ✓ 7 (2.6s)
  ✓  3 happy path (2.2s)          ✓ 6 (3.4s)   ✓ 9 (1.4s)
  9 passed (27.8s)
```

### (b) Dev CI
```
gh run view 37132293107 (ccabe7ff, success):
  ✓  117 … m9-brief-generate-failure.spec.ts:71:7 … retries (6.8s)
  ✓  118 … :133:7 (3.9s)
  ✓  119 … :184:7 happy path (4.4s)
  [WebServer] [M9 generateMeetingBrief] LLM call fallback: ANTHROPIC_API_KEY not set   (×3)
```
```
gh run view 37134264648 (c5b70703, completed success):
  ✓ :71 6.7s   ✓ :133 3.6s   ✓ :184 4.3s
```
`37134272315` (da3491a7) and `37134255791` (7575fd15) were still `in_progress` at the second check, so they have no m9 lines in their logs yet. `37132837305` (a7e6121c), `37132313716` (d92ab243) and `37126281385` (d0d2f5ec) are `success`.

### (c) Range: no regression
```
git diff --stat d0d2f5ec da3491a7 -- <spec> fixtures/m9-tenant.ts briefs/ src/modules/m9 src/lib/llm.ts playwright.config.ts
 src/modules/m9/server/calendar-actions.ts | 35 ++++++++++++++++++++++---------   (not on the generateMeetingBrief path)

git checkout d0d2f5ec; … playwright test …:71 --repeat-each=1 --retries=0
  ✘  1 … :71:7 … retries (12.1s)
    Error: expect(locator).toBeFocused() failed / element(s) not found
    > 123 |     await expect(generate).toBeFocused();
```
There is no first bad commit: the spec is red at the start of the range in the same way.

## Root cause (spec:line)
`tests/e2e/m9-brief-generate-failure.spec.ts:117-126`
1. On retry, `attemptGenerateBrief` (`briefs/client.tsx:219`) calls `setGenerateError(null)` **before** it sends the request. So `expect(band).toHaveCount(0, { timeout: 60_000 })` on line 120 passes **at once**. The 60 s budget, which was meant for the generation, is never used.
2. During the request the button label is `AI Brief Hazırlanıyor...` (`client.tsx:599-603`). The `generate` locator (`/Yapay Zeka Brief Oluştur/`) matches nothing, so line 123 `toBeFocused()` waits only the default `expect.timeout` (10 s, from `playwright.config.ts`).
3. With a real LLM (~20 s) the wait runs out → "element(s) not found". In CI (no key → template fallback in under 1 s) it never runs out.

`src/` is correct: the form is cleared only on success (`client.tsx:255-257`), as designed.

**qae-fb reported line 126 (`toHaveValue('')` → "Fraunhofer Institute"). I did not see that.** In my 4 red runs it was always 123. A hypothesis I have NOT verified: if the retry returns `brief: null` (DB write failed, for example RLS or credits), the band comes back with `notSaved`. The button then keeps its normal name and gets focus, so 123 passes and 126 fails. That run's log would be needed to confirm it.

## Proposed one-line fix (NOT applied, the task said no code changes)
Spec line 123: give the generation wait an explicit budget:
```diff
-    await expect(generate).toBeFocused();
+    await expect(generate).toBeFocused({ timeout: 60_000 });
```
(When the button gets its normal name back, generation is done and line 255 has already cleared the form in the same render, so 126/127 pass with the default timeout.) Note: the whole test timeout is 60 s, and with a real LLM the test spends about 25 s, so it fits.
Separately, as a recommendation: local E2E runs should match CI and not make a paid LLM call (local: `ANTHROPIC_API_KEY=` / an invalid key). That is a decision about `.env` and the config, so it is the owner's call; I did not touch it.

## 3. Değişen dosyalar
Only this report. No changes to `src/`, `.env*`, `playwright.config.ts` or `global-setup.ts`.

## 4. Riskler
- When run with a real key, this spec writes real LLM spend (AiUsageLog) on every local run.
- With the fix, a real LLM that takes over 60 s would still hit the test timeout. That is acceptable, because CI does not take that path.

## 5. Açık sorular
- Should PR #16 (fe-fb/e2e-prod-2c) apply the line-123 fix, or should local runs be made to match CI by removing the key?
- What was the environment of qae-fb's line-126 run (real key? any DB-write warning)?

## 6. Sonraki adım
- fe-fb / qae-fb: apply the one-line fix to the spec on the 2c branch and check it 3× with the real key and 3× with no key.
- Look at the m9 lines in the dev CI runs (37134272315 and others) after they finish.
