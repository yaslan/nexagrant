# TASK-MUS7OVUMOJZP3 — be-fb: time-bound /api/cagrilar (SEDIA timeout + budget)

**Hüküm:** DONE. A stalled SEDIA no longer keeps the calls page on "loading". With SEDIA blackholed in a real browser, the page leaves loading after **10.4–10.9 s** and shows an error. The base code (3388b970) was still loading after 35 s.
**Tip:** bug (product reliability), follow-up to TASK-MUPVLWSIPC5WU-qae-fb-render-purity §(4) item 2.
**Platform:** Verified on mac (darwin, Node 26.5, `next dev`, Chromium via Playwright). Linux will be covered by the PR's CI. Not run on Windows (no machine). The changed code is platform-independent: `AbortSignal.timeout/any`, `setTimeout`, `fetch`. There are no paths, shells or processes in it. The blackhole check used `NODE_USE_ENV_PROXY`, which is test setup only and not product code.
**Branch / PR:** `be-fb/sedia-timeout` from origin/dev 3388b970. PR is open and not merged (link at the bottom).

## (1) Ne yapıldı
1. **`src/lib/adapters/sedia.ts`**: added `SEDIA_TIMEOUT_MS = 10_000`. Every search page fetch now gets `AbortSignal.timeout(timeoutMs)`, combined with an optional caller `signal` through `AbortSignal.any`. A timeout falls into the existing per-page `catch`: pagination stops and the topics read so far are returned, with the error in `errors[]`. If the caller's signal has already fired, no further page is requested. New options: `timeoutMs` (default is the constant; tests use it) and `signal`. The nightly k1 job keeps its behaviour, plus the 10 s per-page cap.
2. **`src/app/api/cagrilar/route.ts`**: added `CAGRILAR_BUDGET_MS = 20_000`. One `AbortSignal.any([budget, request.signal])` is passed to both SEDIA and translation, so the budget and a client disconnect cancel the same work.
   - If the budget runs out before or during translation, the topics come back in English with `translated: false`. A half-translated list is thrown away, so you never get a mix of Turkish and English.
   - The new field `translated: boolean` is added to the 200 body. Every existing field is unchanged.
   - When not one SEDIA page came back (`topics=[]` and `errors≠[]`), the route answers **503** `{success:false, error:'sedia_unavailable', message:'…'}` with `Retry-After: 30`, built through `internalError()` so the repo's 5xx body guard stays green. Upstream error text stays in the log. A genuine "no match" is still a 200.
3. **`src/lib/translation.ts`**: `translateText` and `translateTopicsBatch` take an optional `signal`. When it fires, the waiter leaves the shared queue immediately (no slot is taken, nothing is fetched later), calls already in flight are aborted, and the text falls back to the original.
4. **`calls/page.tsx`**: new `loadFailed` state, set after the await alongside the rows, so the derived `loading` pattern is unchanged. On `!res.ok`, `success:false` or a network error, the page shows an error cell (`role="alert"`, `data-testid="calls-load-error"`) and a short status line instead of "no results". The effect's cleanup aborts the superseded request (filter change or StrictMode double-run). That is how the server's `request.signal` actually fires. There is a 30 s client backstop in case the server never answers.

## (2) Kanıt

### Unit tests (new: `tests/sedia-timeout.test.ts` 4, `tests/api/cagrilar-budget.test.ts` 9; extended: `tests/translation-bounds.test.ts` +1)
- timeout → partial result: page 1 answers and page 2 hangs. The search returns `['HORIZON-T-1']` in under 1 s, page 3 is never requested, and `errors[0]` is `Page 2 fetch error: …timeout`.
- budget → translation skipped: when SEDIA uses up 20 s, `translate` is not called and the body has `translated:false` with English titles. When the budget expires mid-translation, the partial Turkish is discarded. The budget signal reaches SEDIA at exactly 20 000 ms (aborted is false at 19 999 ms and true at 20 000 ms).
- abort → queue emptied: 8 fetches are in flight and the rest are queued. On `abort()`, `queued` is 0 synchronously. After that `active` is 0, `queued` is 0, and only 8 fetches were ever sent. A new translation runs straight through afterwards.

### Mutants (each applied → its test run → file restored; script output verbatim)
```
M1 sedia: fetch has no signal: RED (killed) | Tests  2 failed | 2 passed (4)
M2 sedia: no abort check before a page: RED (killed) | Tests  1 failed | 3 passed (4)
M3 route: signal not passed to SEDIA: RED (killed) | Tests  2 failed | 7 passed (9)
M4 route: translate even after budget is gone: RED (killed) | Tests  1 failed | 8 passed (9)
M5 route: keep a translation cut off by the budget: RED (killed) | Tests  2 failed | 7 passed (9)
M6 route: no 503 on zero pages: RED (killed) | Tests  2 failed | 7 passed (9)
M7 translation: aborted waiter stays in queue: RED (killed) | Tests  1 failed | 3 passed (4)
M8 translation: queue ignores signal: RED (killed) | Tests  1 failed | 3 passed (4)
M9 translation: in-flight call not aborted: RED (killed) | Tests  1 failed | 3 passed (4)
restored: ['Tests  17 passed (17)']
```
9/9 killed, and the restored tree is green (red→green).

### Real browser, SEDIA blocked
Setup: a local TCP "blackhole" on 127.0.0.1:9919 accepts connections and never answers, which is what a stalled upstream looks like. The dev server ran with `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9919` on port 3188. Probe: `blocked: TimeoutError 4002 ms`. The test signed in as the demo seat and opened `/tr/main/calls`.
```
after  (this branch): {"loadingEnded": true,  "elapsedMs": 10432, "errorCell": "Çağrı listesi şu anda alınamadı (…)",
                       "cagrilar": [{"failed":"net::ERR_ABORTED"}, {"status":503,"body":"{\"success\":false,\"error\":\"sedia_unavailable\",…}"}]}
before (3388b970):    {"loadingEnded": false, "elapsedMs": 35084, "errorCell": null, "cagrilar": []}
server log (after):   [WARN] [SediaAdapter] … "Page 1 not fetched: ResponseAborted"        ← StrictMode duplicate, cancelled by the client → request.signal
                      [ERROR] [SediaAdapter] Error on page 1: [TimeoutError] The operation was aborted due to timeout
                      GET /api/cagrilar?…&lang=tr&page=1&limit=20 503 in 10.6s
```
Screenshots in `docs/agent-results/TASK-MUS7OVUMOJZP3-be-fb/`: `after-1-loading.png`, `after-2-settled.png` (red error cell, status line "Çağrılar alınamadı"), `before-1-loading.png`, `before-2-still-loading.png` (skeleton still showing after 35 s).

### Gates
```
pnpm typecheck                → exit 0
pnpm lint                     → ✖ 3 problems (0 errors, 3 warnings) — pre-existing, in src/lib/invitations/accept.ts and tests/settings-profile-update.test.ts; eslint on the 7 touched files: exit 0
pnpm i18n:check               → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
pnpm vitest run               → Test Files 320 passed | 6 skipped (326) · Tests 4258 passed | 119 skipped (4377) · EXIT=0
E2E_PORT=3187 playwright render-purity-refactor.spec.ts --repeat-each=3 --retries=0 → 6 passed (10.2s)
```
Note: my first full vitest run overlapped with a Playwright run on the same local DB (5433/fabrika) and showed 51 live-DB failures across 18 files. On their own, those 18 files pass on both 3388b970 and this branch (131/131 each), and the clean rerun above passed too. The failures came from that overlap, not from this change.

## (3) Değişen dosyalar
- `src/lib/adapters/sedia.ts`, `src/app/api/cagrilar/route.ts`, `src/lib/translation.ts`, `src/app/[locale]/(app)/[workspace]/calls/page.tsx`
- tests: `tests/sedia-timeout.test.ts` (new), `tests/api/cagrilar-budget.test.ts` (new), `tests/translation-bounds.test.ts` (+1 test)
- **Outside the allowed list: `messages/tr.json`, `messages/en.json`** (+2 keys: `callsPage.loadFailed`, `callsPage.loadFailedShort`). The error state needs translated text. `callsPage` had no suitable key, and a hard-coded string would fail `i18n:check`. No other keys were changed.
- **Not touched:** `tests/e2e/render-purity-refactor.spec.ts` and `fixtures/cagrilar-response.json`. The fixture does **not** need `translated`, because the spec's `CagrilarResponseSchema` is a non-strict `z.object`, so the extra field is optional for it. That is why it stayed unchanged.

## (4) Riskler
- If SEDIA is slow but working (each page under 10 s, 5 pages), it can use up the whole 20 s budget and the list comes back in English (`translated:false`). The page does not explain this yet; today the same happens silently when MyMemory fails.
- `AbortSignal.any` needs Node ≥ 20.3 on the server; it is only used server-side. The client uses a plain `AbortController` + `setTimeout`, which every browser supports.
- The client now aborts superseded requests. The e2e stub's `route.fulfill` on an aborted request did not break the spec (6/6 green), but other specs that hold `/api/cagrilar` should know about it.

## (5) Açık sorular
- Should the page show a small "titles are in English (translation timed out)" note when `lang=tr && translated===false`? It needs one more i18n key. I suggest a separate small card.

## (6) Sonraki adım
Review + merge of the PR by crw-fb/lead. CI will show the Linux run.

## crw-fb inceleme (TASK-MUS7OVUMOJZP3#review-pr9) — eklendi, yukarıdaki be-fb içeriği değiştirilmedi
**Hüküm:** ONAY — no blocking findings. Full review: `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUS7OVUMOJZP3-crw-fb.md`.
- typecheck EXIT=0 · vitest 4258 passed / 119 skipped · render-purity ×3 = 6 passed · mutants M1/M3/M7/O1 RED, O2 (`signal ?? pageTimeout`) SURVIVED → test gap (Ö-1).
- Ö-2: small abort race in translation.ts (between `wake` and `run`, ≤3 s slot hold) → one line, `signal?.throwIfAborted()`.
- Badge `calls/page.tsx:348-351` is pre-existing and static → separate card.
- CI build-and-test 37120647287 was still at the "Test" step at 14:50 → do not merge until it is green.
- Platform: mac (darwin, Node 26.5). Linux = CI. Windows not run.
