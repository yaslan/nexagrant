# TASK-MUSBCXP9RKS3D#faz2a — group 2a moved off the demo sign-in form (qae-fb)

**Hüküm:** ⚠️ GEÇTİ, 2 açık bulguyla. All 16 group 2a specs are migrated or classified. **Start mode: 57 passed / 2 failed / 3 skipped. Dev mode: 62/62 passed.** The 2 start failures are **not** session failures. Both specs pass in dev with the same migrated session code. Their root causes are production-only behaviour in `src/` (B-class, outside this card's scope, details in §1.4). The `registration-consent` skip is a **SKIP PROPOSAL** waiting for approval. The mutant goes RED, and after the revert the same spec is GREEN. typecheck and lint are clean.
**Tip:** test-altyapısı (E2E migration) + fixture extension
**Platform:** Verified on mac (Darwin 27.0.0, Node + pnpm, Postgres in Docker on :5433, `next build` + `next start` and `next dev`, Chromium). Windows and Linux were not run because neither is available on this machine. What the code tells us: the changes use only Playwright, Prisma and `next-auth/jwt` (cookie minting). There are no file paths, shell commands or process handling, so they are platform-independent. CI (ubuntu) runs the same `playwright test`.
**Branch / commit:** `qae-fb/e2e-prod-2a` (opened from `origin/qae-fb/e2e-prod-session-fixture` @e139bfd8) · code a5af4ef9 + report commit. **PR #11** (https://github.com/yaslan/fonbridge/pull/11), base `dev`, not merged. It depends on PR #10.

---

## 1. What was done

### 1.1 Fixture change (`tests/e2e/fixtures/session.ts`, which I own)
| Change | Why |
|---|---|
| `seedIdentity({..., isPlatformAdmin?: boolean})` writes `User.isPlatformAdmin` (on both create and update) | `src/lib/auth.ts` jwt callback: `token.isPlatformAdmin = false`, then it reads the value **from the DB row only**. In start mode `demoAdmin` is also false. So an /admin spec can only be admin through the DB row. A cookie claim does not count. |
| `workspaceIds: []` given **explicitly** → membership `workspaceIds = []` (= every workspace, schema "empty = all"); `e2e-default` is created only when **neither** `workspaceIds` nor `workspace` is given | The demo seats (db:seed) hold `[]`. Without this change the fixture always forced `e2e-default`, so a new seat could not reach `main` / `fabrika-beta`. Backward compatible: the only existing user (`identity-honesty`) always passes a value. |
| `E2E_IDENTITIES.platformAdmin.email` → `platform.admin@e2e.fabrika.test` | The old value `admin@yasinaslan.com.tr` belongs to `demo-user-superadmin`, and `User.email` is unique, so seeding the preset hit a unique violation. It was a trap (nobody uses it yet). |

### 1.2 Per-spec decisions (16 files)
| Spec | Tests | Decision |
|---|---|---|
| billing-identity-form | 4 | **seedIdentity + signInAs + cleanupIdentity**: its own TENANT_OWNER and PIPELINE_MANAGER seats on `demo-tenant`, `workspaceIds: []` |
| price-lock | 3 | same (TENANT_OWNER). The 2 inline demo-form blocks became a `signInAsOwner` helper |
| billing-invoice-history | 3 | same (TENANT_OWNER) |
| m1-partner-outreach | 3 | same (PIPELINE_MANAGER, the role of the replaced `alice` seat) |
| dashboard-outcome-case | 1 | same (PIPELINE_MANAGER). The DB comparison now looks up the seeded seat's e-mail |
| admin-blog-persistence | 3 | same, platform admin (`isPlatformAdmin: true`). **It was demo-dependent:** it minted a cookie, but `demo-user-admin` has no DB row, so it became admin only through `demoAdmin` (the e-mail claim plus demo on). Baseline start: 1 ✘ / 2 did not run. Assert `createdById: 'demo-user-admin'` → `ADMIN.userId`: still pinned to the signed-in user's id, so it is no weaker. |
| purge-failure-alert-console | 1 | same, platform admin. The "no admin in DB → skip" guard was removed because the spec now seeds its own admin and that skip can no longer fire. |
| alert-console-truncation | 1 | same, platform admin. The guard and its now-dead `skipReason` were removed. `cleanupIdentity` runs before the `expect` in `afterAll`, so a failed count cannot leave the user behind. |
| m9-calendar-connect | 5 | **signInAs only**: `scripts/seed-f10-e2e.ts` already writes User + Membership and `rollback` deletes them. seedIdentity/cleanupIdentity would write and delete the same rows twice. |
| document-export-tenant-isolation | 5 | signInAs only (`seed-doc-export-e2e.ts` owns the rows; both tenant A and tenant B seats) |
| module-plan-gate | 2 | signInAs only (`seed-plan-e2e.ts`, FLIP) |
| plan-entitlement | 1 | signInAs only (`seed-plan-e2e.ts`, LENS) |
| evidence-unverified-badge | 2 | signInAs only (`fixtures/evidence-tenant.ts` owns the rows). `tenant.signIn` drives the demo form, but `evidence-tenant.ts` is **shared with evidence-fabrication.spec.ts and outside group 2a, so I did not touch it**. The user id is written in the spec (`ev-badge-e2e-user`). |
| mobile-main-overflow | 12 | **signInAs as the db:seed admin seat itself (`demo-user-superadmin`), no seed and no cleanup.** Reason: `fixtures/mobile-long-content.ts` (not mine) plants the "my requests" rows under `requesterId: 'demo-user-superadmin'`, so a new admin would change what the test means. Cleanup would delete a seed row, which is unacceptable. The existing "is the admin in the DB" skip stays. |
| **admin-plan-editor** | 13 | **Not demo-dependent, unchanged.** It mints a cookie for the seeded `demo-user-superadmin`, and the admin right comes from the DB row. Baseline start: **13/13 ✓** before any change (`base-admin-start.log`). |
| **registration-consent** | 3 | **SKIP PROPOSAL** → `test.skip(process.env.E2E_WEB_SERVER === 'start', …)` (file level). What it tests is the e-mail registration form plus `/api/auth/callback/credentials` itself. auth.ts registers that provider only when `demoLoginEnabled` is on, and `next start` cannot boot with that flag, so there is nothing to test in start mode. A minted session cannot stand in, because the subject is the sign-up itself. It still runs in dev (3/3 ✓). **Needs the leader's/boss's approval.** |

The static split (faz0 §3) said 53 tests; the real count is 62, because `mobile-main-overflow` generates its tests in a loop (12, not 4).

No assert was deleted or weakened, and no timeout was raised. Every new `signIn` keeps the same `waitForURL(target, same timeout)` after `goto(target)`, so "the session is real and was not bounced to /giris or /no-workspace" is still proven.

### 1.3 Mutant (start mode)
In `billing-identity-form`'s `beforeAll`, right after the seed, I deleted the seats' Membership rows under `withSystemScope` (`MUTANT: membership rows deleted = 2`). Result: **RED**. `page.waitForURL: Timeout 30000ms … waiting for navigation to "**/tr/main/settings/billing"`, 1 failed / 3 did not run. Then `git checkout --`, `git status --short` = 0 lines, and the same spec runs **GREEN 4/4**.

### 1.4 The 2 red tests in start mode: root causes (B-class, `src/`, outside my scope)
**B-1 · m9-calendar-connect › "an unconfigured provider is refused in Turkish"** (start ✘, dev ✓)
- Observed: the banner says "Takvim işlemi tamamlanamadı. Lütfen tekrar deneyin." (`errors.unknown`). Expected: `CALENDAR_OAUTH_NOT_CONFIGURED` → "Bu sağlayıcı henüz bağlanamıyor…".
- Root cause: `connectCalendar` (`src/modules/m9/server/calendar-actions.ts:89`) **throws** `CalendarActionError`. The client reads the code from `error.message` with `calendarErrorCode()` (`src/lib/calendar/errors.ts`). In a **production build, Next.js does not send the message of an error thrown in a Server Action** (only a `digest` is passed), so the code is lost and the user always sees "unknown". Server log: `⨯ Error [CalendarActionError]: CALENDAR_OAUTH_NOT_CONFIGURED … digest: '182274248'`.
- Impact: in production every M9 error message (already connected, not authorized, encryption key missing…) collapses into the generic text. **This is a real production bug.** Fix suggestion: return a `{ ok: false, code }` result instead of throwing (the project's existing server-action result pattern).
- Severity: Medium (the user gets no useful instruction; no data loss).

**B-2 · evidence-unverified-badge › "a fresh upload is recorded as unverified"** (start ✘, dev ✓)
- Observed: after the "Cloudflare R2'ye Yükle" click the modal stays open, no row is written, and a native `alert` (dismissed by Playwright) appears.
- Root cause: the R2 variables in `.env` are empty, so `hasObjectStore=false`, and `getPresignedUploadUrl` (`src/lib/storage.ts:332`) hands out the dev URL `/api/evidence/mock-upload`. That route returns **404 under `NODE_ENV === 'production'`** (`src/app/api/evidence/mock-upload/route.ts:29`). The PUT fails, and the client shows `put_failed` in an alert.
- Impact: in a production deployment without R2, uploading fails with a raw "404"; the presign should refuse earlier with an understandable error. For the test: start mode in CI needs an object store (R2 or a test S3/minio) for this test to pass.
- Severity: Medium (environment/configuration; R2 should be configured in real production).

I did not touch these two tests: no skip, no weakening. They stay red until the fix lands.

## 2. Evidence (copied output; full logs: `docs/agent-results/TASK-MUSBCXP9RKS3D-qae-fb-faz2a/*.log`, DB URLs redacted)

Build (clean, separate worktree `FONBRIDGE-wt-qaefb-2a`, outside the repo root): `pnpm install --frozen-lockfile && prisma generate && DEMO_LOGIN_ENABLED=false pnpm build` → exit 0.
Command: `E2E_PORT=3047 E2E_WEB_SERVER=start|dev E2E_DATABASE_URL=<.env.local> [DEMO_LOGIN_ENABLED=false] pnpm exec playwright test <16 specs>`

> Note: my first baseline run without `E2E_DATABASE_URL` gave false failures: the test process had no DATABASE_URL, so the spec-side `prisma.*` calls failed with `PrismaClientKnownRequestError`. That was my run setup, not a product bug. All the evidence below comes from runs with that variable set.

**Per-spec counts (`full-start.log` / `full-dev.log`):**
| Spec | start | dev |
|---|---|---|
| admin-plan-editor | 13 ✓ | 13 ✓ |
| m9-calendar-connect | 4 ✓ 1 ✘ (B-1) | 5 ✓ |
| document-export-tenant-isolation | 5 ✓ | 5 ✓ |
| mobile-main-overflow | 12 ✓ | 12 ✓ |
| billing-identity-form | 4 ✓ | 4 ✓ |
| registration-consent | 3 skip (SKIP PROPOSAL) | 3 ✓ |
| price-lock | 3 ✓ | 3 ✓ |
| billing-invoice-history | 3 ✓ | 3 ✓ |
| admin-blog-persistence | 3 ✓ (baseline: 1 ✘ 2 did not run) | 3 ✓ |
| module-plan-gate | 2 ✓ | 2 ✓ |
| m1-partner-outreach | 3 ✓ | 3 ✓ |
| evidence-unverified-badge | 1 ✓ 1 ✘ (B-2) | 2 ✓ |
| purge-failure-alert-console | 1 ✓ | 1 ✓ |
| plan-entitlement | 1 ✓ | 1 ✓ |
| dashboard-outcome-case | 1 ✓ | 1 ✓ |
| alert-console-truncation | 1 ✓ | 1 ✓ |
| **Total** | **57 passed, 2 failed, 3 skipped** (1.6m) | **62 passed** (1.7m), exit 0 |

```
# full-start.log (tail)
  ✘  32 … evidence-unverified-badge.spec.ts:99:5 › a fresh upload is recorded as unverified, not valid (30.4s)
  ✘  36 … m9-calendar-connect.spec.ts:84:7 › … an unconfigured provider is refused in Turkish, not silently swallowed (10.3s)
           - unexpected value "Takvim işlemi tamamlanamadı. Lütfen tekrar deneyin."
  2 failed
  3 skipped
  57 passed (1.6m)
# full-dev.log (tail)
  62 passed (1.7m)
```
(The `[users-scheduled-deletion] failed for user purge-alert-s-…` line in both logs is the failure `purge-failure-alert-console` provokes on purpose.)

**Mutant → RED** (`mutant-red.log`)
```
  ✘  1 … billing-identity-form.spec.ts:105:7 › … an owner with no identity on file is told so, and given the form (30.4s)
  1 failed
  3 did not run
MUTANT: membership rows deleted = 2
    TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
    waiting for navigation to "**/tr/main/settings/billing" until "load"
```
**Revert → GREEN** (`revert-green.log`)
```
status-lines=       0
  ✓  1 … an owner with no identity on file is told so, and given the form (496ms)
  ✓  2 … a VKN whose check digit does not hold is refused, and nothing is written (484ms)
  ✓  3 … a valid identity is stored, normalised, and read back masked (781ms)
  ✓  4 … a member who may not edit it never receives the number (343ms)
  4 passed (4.4s)
```
**Cleanup check:** after the runs, the e2e seat count in the DB (`e2e-%-admin`, `e2e-billing-%`, `e2e-price-%`, `e2e-invoice-%`, `e2e-m1-%`, `e2e-dashboard-%`) = **0**.

**typecheck:** `pnpm typecheck` → exit 0 (`$ tsc --noEmit`)
**lint:** `pnpm lint` → exit 0, `✖ 3 problems (0 errors, 3 warnings)`. These are the same 3 pre-existing warnings as in faz1-2 (`src/lib/invitations/accept.ts`, `tests/settings-profile-update.test.ts`), in files I did not touch.

## 3. Changed files
- `tests/e2e/fixtures/session.ts`: `isPlatformAdmin`, explicit `[]` = all workspaces, preset e-mail
- 15 specs: admin-blog-persistence, alert-console-truncation, billing-identity-form, billing-invoice-history, dashboard-outcome-case, document-export-tenant-isolation, evidence-unverified-badge, m1-partner-outreach, m9-calendar-connect, mobile-main-overflow, module-plan-gate, plan-entitlement, price-lock, purge-failure-alert-console, registration-consent
- Unchanged: `admin-plan-editor.spec.ts` (not demo-dependent)
- Not touched: `src/`, `.env*`, `playwright.config.ts`, `global-setup.ts`, `scripts/seed-*`, `fixtures/evidence-tenant.ts`, `fixtures/mobile-long-content.ts`
- `docs/agent-results/TASK-MUSBCXP9RKS3D-qae-fb-faz2a.md` + `…-faz2a/*.log`

## 4. Risks
- **The `evidence-tenant.ts` fixture still drives the demo form** (`tenant.signIn`). `evidence-fabrication.spec.ts` (group 2b?) depends on it. Whoever migrates 2b should replace the shared fixture's `signIn` with `signInAs` (and return `userId`). Then this spec's hard-coded `ev-badge-e2e-user` can go too.
- `mobile-main-overflow` and `admin-plan-editor` depend on db:seed's `demo-user-superadmin` row having `isPlatformAdmin=true`. CI runs `pnpm db:seed`, so this holds today.
- The seats are per-spec (`e2e-<spec>-…`), so specs running in parallel on the same DB do not delete each other's users. Two runs of the **same** spec at the same time on the same DB can still clash (that was already true for the demo tenant's shared rows).
- B-1 and B-2 will be red in a start-mode CI run until the fix lands (they are not caused by this card).

## 5. Open questions
- **SKIP PROPOSAL approval:** `registration-consent` skipped under start → leader/boss.
- B-1 (Server Action error code lost in prod) → who fixes it in `src/`? (be-fb?) Suggestion: `{ ok:false, code }` return pattern.
- B-2 → should start-mode CI get an object store (minio), or should the presign refuse early in production without R2? Both are probably needed.

## 6. Next step
- Leader review of the PR (base `dev`). When 2b is migrated, `evidence-tenant.ts` should go to `signInAs` (see risks).
- Open cards for B-1 and B-2 (`src/` scope).
