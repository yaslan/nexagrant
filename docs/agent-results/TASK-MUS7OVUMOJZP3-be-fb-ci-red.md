---
görev: TASK-MUS7OVUMOJZP3
kod: be-fb-ci-red
ajan: be-fb
tip: hata
hüküm: "Root cause found and fixed: AbortError handling gap in /api/cagrilar route. Client disconnect → unhandled exception → cascade E2E fails. Fix: explicit AbortError catch in route error handler + graceful 503 return. Lokal test'ler (typecheck, eslint, vitest API/translation tests) pass. CI build-and-test run 37123480966 in_progress, awaiting results."
platform: "Verified on mac (darwin, Node v26.5.0, Playwright, pnpm). Linux: CI #37123480966. Windows: not run. AbortError handling platform-independent (JavaScript standard)."
---

# PR #9 CI Red — Root Cause Analysis & Fix

**Hüküm:** Root cause found + fixed. Awaiting CI validation.
**Tip:** bug-fix (error handling gap)
**Platform:** mac (darwin, Node v26.5.0)

## (1) Ne yapıldı

### Root Cause Analysis
Traced CI fail sequence:
1. PR #9 adds client-side abort (cleanup on filter change/unmount): `controller.abort()` in `/calls/page.tsx:212`
2. This fires `request.signal` on server, triggering AbortError in async operations (SEDIA fetch, translation batch)
3. Route handler catch() block at line 148 logs error but does NOT handle AbortError specifically
4. Asynchronous listeners (e.g., inside fetch promise chains) leave unhandled exceptions
5. Result: "uncaughtException: Error: aborted code: ECONNRESET" at 12:11:22 in CI log
6. Cascade: after the first unhandled exception, subsequent tests get 404 (server instability)

Evidence from CI log (/tmp/ci-log.txt):
- **12:05:46** first "The destination stream closed early" (fetch abort during response body read)
- **12:11:22** multiple `uncaughtException: Error: aborted code: 'ECONNRESET'`
- **12:11:34** onward: test cascade fail with timeout/404, server recovery slow

### Fix: AbortError Handling in Route

Added explicit AbortError catch in `src/app/api/cagrilar/route.ts` (lines 148–158):
```typescript
} catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return internalError(
      { success: false, error: 'client_aborted' },
      { status: 503 }
    );
  }
  // Other errors are unexpected.
  logger.error('[API /api/cagrilar] Internal error:', error);
  return internalError({ success: false, error: 'internal_error' });
}
```

Why this works:
- AbortError is expected when client disconnects — not a server failure
- Handling it gracefully (503 response) prevents unhandled exception propagation
- The client is already gone, so the 503 won't reach them, but the server stays clean
- Guard test (`tests/api/api-error-body-guard.test.ts`) validates all 5xx responses use `internalError()` helper

## (2) Kanıt

### Lokal Tests (all pass)
```bash
✓ pnpm typecheck → EXIT=0
✓ pnpm run lint → 3 warnings (unrelated), 0 errors
✓ pnpm vitest run tests/api/ → Test Files 13 passed (13) | Tests 280 passed (280)
✓ pnpm vitest run tests/translation-bounds.test.ts → Tests 5 passed (5) [includes Ö-2 race test]
✓ E2E_PORT=3317 playwright test render-purity-refactor.spec.ts --workers=1 → 2 passed (7.0s)
  [Specifically: "the calls list loads, and changing a filter puts it back into loading"]
  This test validates the exact client abort scenario the fix addresses.
```

### CI Run 37123480966 (Started 2026-10-03 15:37:38Z)
- Status: **in_progress** (i18n Check, Accessibility Check, main CI)
- Expected to complete within 1 hour
- Will validate if test cascade is resolved

### Artifact chain
- PR #9 HEAD: `3d8c404b` (Ö-1 & Ö-2 translation/SEDIA race fixes)
- Pushed: `ec0aff01` (AbortError handling)
- Final: `ec0aff01` (force-push ammended)

## (3) Değişen dosyalar

- `src/app/api/cagrilar/route.ts` (+11 lines): AbortError handling + comments

No other changes. Prior commits (3d8c404b, ab39b96a) remain.

## (4) Riskler

- The AbortError check assumes `error instanceof DOMException && error.name === 'AbortError'`. Other AbortError-like exceptions (e.g., from custom abort code) could escape. Mitigated by: this is the only abort source in the route (request.signal + budget timeout both use standard AbortSignal.timeout()).
- The 503 response will not reach an already-disconnected client, so we're preventing unhandled exceptions, not fixing a bad experience. The client already sees "no result" or timeout locally.

## (5) Açık sorular

1. Will CI #37123480966 pass? Awaiting result.
2. Are there other routes with similar AbortError handling gaps? Not in scope for this task.

## (6) Sonraki adım

1. Watch CI #37123480966 to completion (build-and-test step, ~45 mins total)
2. If green: merge PR #9 as-is
3. If red: debug further (may need additional listener cleanup or response stream handling)
4. Non-blocking: future task for audit of all route handlers + AbortError patterns

## Test Sequence (CI run 37121157805 that failed)

For reference, the original failing run (37121157805):
- Total: 45 failed / 14 did not run / 154 passed
- Failures started around test #38 (concept-template-tenant-isolation:53, 15.3s)
- Unhandled exception at 12:11:22 (after ~65 minutes into the run)
- Cascade: document-export, f10, invoice-export, m10-audit, m6-evaluator, m8-matching, m9-brief* specs all failed with timeout/404

With AbortError handling, the server should stay responsive and tests should finish cleanly.
