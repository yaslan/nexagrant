# TASK-MUSBCXP9RKS3D#faz1-fix — production-mode (start) E2E evidence + fixture fixes (PR #10)

**Hüküm:** ✅ GEÇTİ. `identity-honesty.spec.ts` runs 2/2 green under `E2E_WEB_SERVER=start` (`next build` + `next start`). The temporary mutant turns it red, and the revert turns it green again. typecheck and lint for the whole repo are clean.
**Tip:** test-altyapısı / bug-fix (in the fixture)
**Platform:** Verified on mac (Darwin 27.0.0, Node + pnpm 11.25, Postgres in Docker on :5433). I did not run Windows or Linux. Why: none is available on this machine. What the code tells us: the fixture uses only Playwright, Prisma and `next-auth/jwt`, with no paths, shells or process handling, so it is platform-independent. CI (ubuntu) runs the same commands.
**Branch / commit:** `qae-fb/e2e-prod-session-fixture` · fbc6a513 (code) + the report commit. Not merged.

---

## 1. What was done

### (a) Start-mode evidence: the real cause of the failure is TWO separate things

| Symptom (phase 1) | Real cause | Evidence |
|---|---|---|
| `pnpm build` exit 1 in the main checkout | **tsc type check**, not env: 560 `error TS…`, **all** from other agents' untracked nested worktrees inside the repo root (`FONBRIDGE-wt-crwfb-review-K1/`, `FONBRIDGE-wt-crwfb-review-MTVTMZXYT84RZ/`). tsconfig `include: **/*.ts` sweeps them in. The `instrumentation.ts:18 process.exit … Edge Runtime` line is only a WARNING printed next to that error. | `grep "error TS" build.log \| grep -v "^FONBRIDGE-wt-"` → **0 lines** |
| `next start` does not come up | **The leader's hypothesis is correct**: `.env:75 DEMO_LOGIN_ENABLED=true`. In start mode, playwright.config's `testEnv` does not add DEMO_LOGIN_ENABLED, and `webServer.env = {...process.env, ...testEnv}`. The shell gives no value, so Next loads `.env`, `assertDemoLoginAllowed` throws, and `process.exit(1)` runs. | `start-env-true.log` below |

Fix: I did **not** change `.env` and did **not** touch the nested worktrees (they belong to other agents). I built in a **clean, separate worktree** (`git worktree add --detach <scratchpad>/wt fbc6a513`, `.env`/`.env.local` copied, `pnpm install --frozen-lockfile`, `prisma generate`). I passed `DEMO_LOGIN_ENABLED=false` from the shell; process.env beats .env.

Behavior of playwright.config.ts in start mode (I read it, nothing changed): `E2E_WEB_SERVER=start` → command `pnpm start --port $E2E_PORT`; testEnv = AUTH_SECRET (test-only), DATABASE_URL, INVOICE_SUPPLIER_*; **no DEMO_LOGIN_ENABLED**; `reuseExistingServer:false`. So the flag can only come from the shell or from `.env`.

### (b) The mutant spec was removed; a real temporary mutant was run
- `tests/e2e/identity-honesty-mutant.spec.ts` → `git rm` (fbc6a513).
- Mutant: in the clean worktree I commented out the entire `tx.membership.upsert(...)` block in `seedIdentity`, giving RED 2/2. I reverted it with `git checkout --`, giving GREEN 2/2, and `git status --short` returned 0 lines.

### (c) typecheck + full-repo lint: clean (outputs below).

### (d) The "Do not call both seedIdentity() and signInAs()…" warning was WRONG and misleading
That sentence was in the phase 1 report, not in the fixture. It is misleading because the two functions are not alternatives: they are **two halves that must be used together**. `seedIdentity` writes the DB rows (in beforeAll, no browser needed). `signInAs` puts a cookie into one browser context (in the test body or beforeEach; `beforeAll` has no `page`). I added a usage block with examples to the top of the fixture (`tests/e2e/fixtures/session.ts`):

```ts
const ws = { id: 'my-ws', slug: 'my-ws', name: 'My WS' };
test.beforeAll(async () => {
  await seedIdentity({ userId: 'e2e-a', email: 'a@e2e.test', role: 'TENANT_OWNER', tenantId: 'demo-tenant' }, ws);
  await seedIdentity({ userId: 'e2e-b', email: 'b@e2e.test', role: 'PIPELINE_MANAGER', tenantId: 'demo-tenant', workspaceIds: [ws.id] });
});
test.afterAll(() => cleanupIdentity(['e2e-a', 'e2e-b']));

test('owner sees X', async ({ page }) => {
  await signInAs(page, { id: 'e2e-a', email: 'a@e2e.test', tenantId: 'demo-tenant', role: 'TENANT_OWNER' });
  await page.goto('/tr/my-ws/panel');
});
```
Rules (also in the fixture comment): the claims (id/email/tenantId/role) must name a seeded user, because the cookie creates nobody. Two users in **one** test need two `browser.newContext()` calls, each with its own signInAs, because a second signInAs on the same context overwrites the cookie.

### Fixture bug found along the way (fixed)
`seedIdentity(identity, workspace)` used to write `workspaceIds = [workspace.id]`. The upsert is keyed on `tenantId_slug`. If that slug already exists under **a different id**, nothing is created, yet the membership pointed at a non-existent `workspace.id`. Now the membership gets `row.id`, the id the upsert returns. Also, `signInAs`'s default baseURL was hard-coded to `localhost:3000`; it now follows the same `E2E_BASE_URL` / `E2E_PORT` default as playwright.config.ts.

## 2. Evidence (copied output; full logs in `docs/agent-results/TASK-MUSBCXP9RKS3D-qae-fb-faz1-2/*.log`)

**Build in the main checkout (diagnosis):** `DEMO_LOGIN_ENABLED=false pnpm build` → exit=1
```
FONBRIDGE-wt-crwfb-review-MTVTMZXYT84RZ/tests/modules/m6/scoring.test.ts(28,49): error TS2345: Argument of type 'import(".../FONBRIDGE-wt-crwfb-review-MTVTMZXYT84RZ/src/lib/db").TenantTx' is not assignable to parameter of type 'import(".../FONBRIDGE/src/lib/db").TenantTx'.
... (560 error TS lines in total, every one under FONBRIDGE-wt-crwfb-review-*/)
Failed to type check.
Turbopack build encountered 1 warning:
./src/instrumentation.ts:18:5
Warning: A Node.js API is used (process.exit at line: 18) which is not supported in the Edge Runtime.
[ELIFECYCLE] Command failed with exit code 1.
```

**Build in the clean worktree:** `DEMO_LOGIN_ENABLED=false pnpm build` → **exit=0** (full: `build.log`, 308 lines)
```
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env.local, .env
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
  Creating an optimized production build ...
✓ Compiled successfully in 8.2s
  Running TypeScript ...
  Finished TypeScript in 12.1s ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/38) ...
...
└ ○ /sitemap.xml                                                        1h      1y
ƒ Proxy (Middleware)
```

**Start, .env value as-is (negative check):** `E2E_PORT=3011 E2E_WEB_SERVER=start E2E_DATABASE_URL=… pnpm exec playwright test tests/e2e/identity-honesty.spec.ts` → exit=1 (`start-env-true.log`, full)
```
[WebServer] $ next start --port 3011
[WebServer] ⚠ "next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.
[WebServer] DEMO_LOGIN_ENABLED=true is not allowed in a production build or with NODE_ENV=production: it lets anyone sign in as any account, platform admin included, without a password. Remove it from the production environment; the server will not start with it.
Error: Process from config.webServer was not able to start. Exit code: 1
```

**Start, GREEN:** `E2E_PORT=3011 E2E_WEB_SERVER=start DEMO_LOGIN_ENABLED=false E2E_DATABASE_URL=… pnpm exec playwright test tests/e2e/identity-honesty.spec.ts` → **exit=0** (`start-green.log`, full; themeColor warnings trimmed here)
```
[WebServer] $ next start --port 3011
[WebServer] [app-url] NEXT_PUBLIC_APP_URL is a loopback (localhost) address in production: set it to https://fonbridge.com
[e2e-gate] Dev server info: PID=none
Running 2 tests using 1 worker
  ✓  1 [chromium] › tests/e2e/identity-honesty.spec.ts:63:7 › app frame identity › a session with no name is never given somebody else’s name (519ms)
  ✓  2 [chromium] › tests/e2e/identity-honesty.spec.ts:92:7 › app frame identity › a session that carries a name shows that name (378ms)
  2 passed (3.2s)
```

**Mutant (Membership upsert commented out), start mode → RED, exit=1** (`mutant-red.log`)
```
  ✘  1 [chromium] › ... › a session with no name is never given somebody else’s name (10.3s)
  ✘  2 [chromium] › ... › a session that carries a name shows that name (10.2s)
    Error: expect(locator).toBeVisible() failed
    Locator: locator('header:visible').first()
    Error: element(s) not found
    > 77 |     await expect(header).toBeVisible();
  2 failed
```
(The page snapshot has no app frame; it shows only `/tr/giris` and `/tr` links. Without a Membership, the session does not get into the workspace panel.)

**Revert → GREEN, exit=0** (`revert-green.log`)
```
  ✓  1 [chromium] › ... › a session with no name is never given somebody else’s name (374ms)
  ✓  2 [chromium] › ... › a session that carries a name shows that name (259ms)
  2 passed (2.7s)
status-lines=       0      ← git status --short
```

**Regression, dev mode:** `E2E_WEB_SERVER=dev` → 2 passed (7.3s), exit=0 (`dev-green.log`)

**typecheck (clean worktree):** exit=0
```
$ tsc --noEmit
```
**lint (whole repo, `pnpm lint` = `eslint`):** exit=0, 0 errors / 3 warnings (pre-existing, files I did not touch)
```
src/lib/invitations/accept.ts  31:15  warning  'Prisma' is defined but never used
tests/settings-profile-update.test.ts  5:32  warning  'beforeAll' is defined but never used
tests/settings-profile-update.test.ts  16:18  warning  'withTenant' is defined but never used
✖ 3 problems (0 errors, 3 warnings)
```

## 3. Changed files
- `tests/e2e/fixtures/session.ts`: usage block, `row.id` fix, baseURL default
- `tests/e2e/identity-honesty-mutant.spec.ts`: **deleted**
- `docs/agent-results/TASK-MUSBCXP9RKS3D-qae-fb-faz1-2.md` + `…-faz1-2/*.log`: evidence
- Untouched: `src/` (demo-login.ts, instrumentation.ts), `.env`, playwright.config.ts

## 4. Risks
- **The main checkout's `pnpm build` / `pnpm typecheck` stay red locally** while the nested worktrees `FONBRIDGE-wt-crwfb-review-K1/` and `-MTVTMZXYT84RZ/` sit inside the repo root (they belong to crw-fb). CI is clean, so it is not affected. Whoever runs locally will be misled by "build is broken".
- `cleanupIdentity` deletes only User + Membership. Workspaces it creates (`e2e-default`, or the one passed in) stay behind. That is harmless (upsert), but it is a leftover.
- `identity-honesty.spec.ts` gives the second user the literal `workspaceIds: ['fabrika-beta-workspace']`. If that slug exists under another id in some DB, the second test breaks. Today it is green on the local DB.
- `next start` warns "output: standalone" ⇒ CI may be using `node .next/standalone/server.js`. Locally, `next start` works.

## 5. Open questions
- Should the nested worktrees be moved out of the repo root, or should tsconfig `exclude` get `FONBRIDGE-wt-*`? (The second is a change outside `src/`, but it is a decision.) → crw-fb / the leader.
- Should `cleanupIdentity` also delete the workspaces it created?

## 6. Next step
- Leader review of PR #10, then the phase 2 worker can use the fixture as described in the usage block.
- Phase 2 command template: `DEMO_LOGIN_ENABLED=false pnpm build` (clean tree) → `E2E_WEB_SERVER=start DEMO_LOGIN_ENABLED=false pnpm exec playwright test <spec>`.
