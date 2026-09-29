# TASK-MUMJ2ERCFP964 — Round 2: m11 guard + SSO card (be-fb)

**Sprint:** FB-KAMU-2 · **Branch:** dev · **Code commit:** `4e5ea9e1` · **Platform:** macOS (Darwin 27.0.0)
Round 1: `TASK-MUMJ2ERCFP964-be-fb.md` (admin actions, `548bf112`).

## 1. What was done

The boss approved two changes (29.09).

**(a) m11:**
- `generateSectionDraftAi` and `calculateLumpSumBudget` now start with `await requireTenantAction({ readOnly: true })`. `readOnly` is set because they do not write, so a tenant whose pilot has expired can still use them.
- **The full test suite caught a regression:** `addBudgetLine` and the session-less partner portal `addBudgetLineByToken` were calling `calculateLumpSumBudget` internally. The new guard refused the token path, which caused 2 red live tests: `bearer-token-hash.live`, `pilot-gates`.
- The fix moves the arithmetic into a private helper, `lumpSumTotal()`, which is not exported and so is not a server action. Both internal callers use the helper, and only the exported action carries the guard. The partner portal works as before.

**(b) SSO opened to tenants:** implementation is on a separate card, **TASK-MUML0QZAZ5M80** (todo, be-fb, FB-KAMU-2/cekirdek). Scope:
- A `manage_sso` permission for `TENANT_OWNER` only.
- The form moves into the tenant settings.
- A tenant's save is always PENDING/inactive and becomes active only after a platform admin approves it (approved).
- `domain_taken` and `public_domain` refusals.
- Only approved records reach sign-in.

## 2. Evidence
```
npx vitest run tests/modules/m11.test.ts tests/m11-partb-editor-buffer.test.tsx
 Test Files  2 passed (2) · Tests 19 passed (19)

Mutations (one guard removed at a time):
RED  generateSectionDraftAi guard -> 1 failed | 14 passed (15)
RED  calculateLumpSumBudget guard -> 1 failed | 14 passed (15)

pnpm typecheck → exit 0 · eslint (2 files) → exit 0
pnpm test (first attempt, before the helper) → 2 failed: bearer-token-hash.live, pilot-gates
  "TenantScopeError: Request has no tenant scope" ← token path through the guarded action
pnpm test (after lumpSumTotal) → Test Files 215 passed | 2 skipped; Tests 2484 passed | 8 skipped
pnpm build (isolated worktree, 4e5ea9e1, real baseline, i18n-baseline.json NOT touched):
  ✅ i18n check passed … · ✓ Compiled successfully · ✓ Generating static pages (31/31) · build exit 0
```
- B-5, noted in round 1, was closed by fe-fb in `4627049d`. So the build is now green **with the real baseline**.
- The `public-sector-assignment` "idempotent [6,4,4]" failure seen in the first full run did not repeat in the second run. It depends on live DB state and is not related to m11.

## 3. Changed files
- `src/modules/m11/server/actions.ts`
- `tests/modules/m11.test.ts`
- `docs/agent-results/TASK-MUMJ2ERCFP964-be-fb-2.md`

## 4. Risks
- The UI client calls to `calculateLumpSumBudget` (`application/client.tsx:134`) and `generateSectionDraftAi` (`PartBCollaborativeEditor.tsx:381`) run inside a workspace session, so they are not affected. Without a session, the call is refused.
- The `public-sector-assignment` live test may be flaky (it failed once and passed on the next run). I did not investigate.

## 5. Open questions
- None. SSO's open design points are listed on TASK-MUML0QZAZ5M80.

## 6. Next step
- crw-fb review, round 1 and round 2 together.
- TASK-MUML0QZAZ5M80 (SSO tenant self-service).

**Platform statement:** verified on macOS. The change is in server-side authorization only and has no platform-dependent code, so it behaves the same on Windows and Linux. I could not run it there because there is no machine for it in this session.
