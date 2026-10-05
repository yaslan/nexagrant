# TASK-MUMJ2ERCFP964 — Admin server actions had no identity check (be-fb)

**Sprint:** FB-KAMU-2 · **Branch:** dev · **Code commit:** `548bf112` · **Platform:** macOS (Darwin 27.0.0)

## 1. What was done

- I listed every `'use server'` file in `src/` (34 files, plus 2 inline actions in pages). Under `src/app/[locale]/admin/`, 3 files had no check at all: 12 actions.
- I added the existing `requirePlatformAdmin()` helper (`src/lib/tenant.ts:227`) as the first line of each of these 12 actions. I did not write a new helper. This is the same pattern that `alerts`, `feedback`, `modules` and `billing/plans` already use.
- `handleConfigureSso` now reads the tenant from the session through the existing `requireTenantAction()`. It ignores the `tenantId` the browser sends: `{ ...config, tenantId }`. Because it goes through `requireTenantAction`, a tenant whose pilot has expired is also refused, as it is for every other write.
- I did not touch `src/lib/k2-cordis/partnerProfileJob.ts` (devop-fb's file). `cordis/actions.ts` only imports it.
- New test: `tests/admin-actions-authz.test.ts`. It calls each of the 12 actions as 3 callers and adds 2 tenant-scope tests for SSO, 38 tests in total.

### Admin server action inventory

| File | Action | Before | After |
|---|---|---|---|
| admin/billing/actions.ts | `handleConfigureSso` | **no check**, trusted the client `tenantId` | `requirePlatformAdmin` + session tenant (`requireTenantAction`) |
| admin/blog/actions.ts | `createBlogPostAction` | **no check** | `requirePlatformAdmin` |
| 〃 | `updateBlogPostAction` | **no check** | `requirePlatformAdmin` |
| 〃 | `deleteBlogPostAction` | **no check** | `requirePlatformAdmin` |
| 〃 | `toggleFeaturedBlogPostAction` | **no check** | `requirePlatformAdmin` |
| admin/cordis/actions.ts | `handleRunCordisImportAction` | **no check** | `requirePlatformAdmin` |
| 〃 | `handleGetK2Status` | **no check** | `requirePlatformAdmin` |
| 〃 | `handleRunCordisSync` | **no check** | `requirePlatformAdmin` |
| 〃 | `handleGetCordisMetrics` | **no check** | `requirePlatformAdmin` |
| 〃 | `handleRunCordisLiveDelta` | **no check** | `requirePlatformAdmin` |
| 〃 | `handleGetCordisDeltaLogs` | **no check** | `requirePlatformAdmin` |
| 〃 | `handleTestRagQuery` (paid embedding) | **no check** | `requirePlatformAdmin` |
| admin/alerts/actions.ts | `setAlertResolved` | `requirePlatformAdmin` ✓ | unchanged |
| admin/feedback/actions.ts | `triageFeedbackEntry` | `requirePlatformAdmin` ✓ | unchanged |
| admin/modules/actions.ts | `updateTenantModuleStatus` | `requirePlatformAdmin` ✓ | unchanged |
| admin/billing/plans/actions.ts | 11 actions (draft/publish/archive/delete/assign/pilot…) | `requirePlatformAdmin` in each ✓ | unchanged |

**Why the tenant admin is not accepted:** the whole `/admin` tree is platform-admin only. The layout calls `isPlatformAdminSession` and returns `notFound`. So the matching gate for the actions is `requirePlatformAdmin`. A `TENANT_OWNER` who is not platform staff is refused. The test uses this case as "another tenant's admin".

**Outside `/admin` (scanned, not changed):** in the workspace, agency and module actions, the guard count matches the export count. `pipeline/actions.ts` uses its own `sessionScope()`. Two exceptions (see Open questions): `m11 generateSectionDraftAi` and `calculateLumpSumBudget` have no guard, but they do not touch the DB and only compute a result. `lib/actions/auth.ts` holds the sign-in actions, which are public by design.

## 2. Evidence

**New test, 38/38:**
```
npx vitest run tests/admin-actions-authz.test.ts
 Test Files  1 passed (1)
      Tests  38 passed (38)
```
For each action: anonymous → `PLATFORM_ADMIN_REQUIRED` and the spy behind the gate is never called; another tenant's `TENANT_OWNER` (`isPlatformAdmin:false`) → `PLATFORM_ADMIN_REQUIRED`, nothing reached; platform admin → runs. SSO: when the browser sends `tenantId:'tenant-B'`, `tenant.update.where` is `{ id: 'tenant-A' }` (the session tenant). A platform admin with no tenant in the session gets `TENANT_SCOPE_REQUIRED` and nothing is written.

**Mutations, 13/13 red** (one guard removed at a time, file restored afterwards):
```
RED   sso: guard #1 removed -> 2 failed | 36 passed (38)
RED   blog: guard #1..#4 removed -> 2 failed | 36 passed (38)   (each one separately)
RED   cordis: guard #1..#7 removed -> 2 failed | 36 passed (38) (each one separately)
RED   sso: requireTenantAction removed, client tenantId trusted -> 2 failed | 36 passed (38)
survivors: 0
```

**Gates:**
```
pnpm typecheck         → tsc --noEmit, exit 0
npx eslint <4 files>   → exit 0
pnpm test              → Test Files 215 passed | 2 skipped (217); Tests 2483 passed | 8 skipped (2491), exit 0
```

**`pnpm build`:** I ran it in a separate worktree (scratchpad, commit `548bf112`, `.env` copied, `pnpm install --offline`, `prisma generate`). The `.next` directory of `:3000` was not touched.
- With the baseline as is: **red**. The i18n gate reports `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx 38 → 39 (+1)`. That file is not part of this change. crw-fb's İNCELEME-19 already records it as **B-5** (a dev build red since `587a50e0`).
- With only that single baseline entry raised to 38→39 **inside the isolated worktree** (not committed): `✓ Compiled successfully`, `✓ Generating static pages (31/31)`, **build exit 0**. Apart from B-5, the build is green with this change.

**Live, prod build, `:3102` (my own process, stopped at the end):** anonymous `POST /tr/admin/billing` with `Next-Action: <handleConfigureSso id>` and a payload with `tenantId:"tenant-X"` → the action result row is `1:E{"digest":…}` (an error). The server log shows:
```
⨯ Error [PlatformAdminRequiredError]: Unauthorized: platform admin required.
```
It appears 3 times (SSO ×2, blog delete ×1). I did not make a live call as a valid admin, because it would write to the DB. The unit test covers the positive path. Note: the prod server refuses to start while `.env` sets `DEMO_LOGIN_ENABLED=true` (a correct guard). Only for this process I passed `DEMO_LOGIN_ENABLED=false`.

## 3. Changed files
- `src/app/[locale]/admin/billing/actions.ts`
- `src/app/[locale]/admin/blog/actions.ts`
- `src/app/[locale]/admin/cordis/actions.ts`
- `tests/admin-actions-authz.test.ts` (new)
- `docs/agent-results/TASK-MUMJ2ERCFP964-be-fb.md` (this report)

## 4. Risks
- `configureEnterpriseSso` writes with plain `prisma.tenant` and not through `withTenant`. This is not a new behaviour, and the tenant is now the one from the session. Whether the write succeeds under the `fabrika_app` role depends on RLS on `Tenant`. Not verified in this task.
- `handleGetK2Status` and the other read-only CORDIS actions are now platform-admin only too. The only client is the `/admin/cordis` page, which is already gated. I found no other importer: grep shows only 2 text tests.
- A platform admin whose free pilot has expired can no longer save SSO (`PILOT_EXPIRED`), which is intended.

## 5. Open questions
- Should `m11 generateSectionDraftAi` and `calculateLumpSumBudget` get a guard? They touch no data and have no cost (template text and arithmetic). They are outside the admin scope, so I did not change them.
- Should a tenant `TENANT_OWNER` be able to configure SSO for their own tenant (`rbac` `manage_billing`)? Today the screen is under `/admin`, so only platform staff can. If this changes, the action gate must switch to `can(role,'manage_billing')` + session tenant.
- B-5 (i18n +1) keeps the dev build red. Whose card is it?

## 6. Next step
- Review (crw-fb): mutations and inventory.
- Close B-5 with a separate card (localize the literal in `application/client.tsx`, or bring the baseline back into agreement).

**Platform statement:** verified on macOS (Darwin 27.0.0). The change touches only server-side authorization and has no platform-dependent code path: no process handling, file paths, shells or UI. It behaves the same on Windows and Linux. I could not run it there because there is no machine for it in this session.
