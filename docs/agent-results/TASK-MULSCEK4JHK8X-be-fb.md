# TASK-MULSCEK4JHK8X — Password-less Credentials sign-in is now behind `DEMO_LOGIN_ENABLED`

**Agent:** be-fb · **Sprint:** FB-GAP-1 · **Branch:** dev (not pushed) · **Commit:** `f3cb2536` · **Source:** `docs/agent-results/TASK-MULRTOTG9IKIM-se-fb.md`

This card only adds the gate. It does not choose the permanent sign-in design (password, magic link or OAuth only). That is a decision for the patron.

## 1. What was done

1. **Flag `DEMO_LOGIN_ENABLED`**
   - `src/lib/env.ts` validates it. Only the exact values `true` and `false` are accepted. Unset or blank means **off**. Any other value, such as `ture` or `1`, stops the server at boot.
   - `src/lib/demo-login.ts` is a new module. It does not import NextAuth or Prisma. It exports `isDemoLoginEnabled()`, `isPlatformAdminDemoEmail()`, `assertDemoLoginAllowed()` and `configuredOAuthProviders()`.
2. **Production with the flag on: the server refuses to start.** `src/instrumentation.ts` calls `assertDemoLoginAllowed()`, which exits with code 1. As a second lock, `isDemoLoginEnabled()` returns `false` whenever `NODE_ENV=production`.
   - **Why refuse instead of warn:** the flag lets anyone sign in as any account, platform admin included, without a password. A warning goes to a log nobody reads while admin sessions are handed out. Silently ignoring the flag is also bad: an operator who set it on purpose would not know why the demo is gone. Refusing to start is both safe and visible. The same pattern already exists for `AUTH_SECRET` (TASK-MULRTOTG9IKIM).
   - **Side effect:** a demo environment cannot run `next start` or the standalone server with the flag on, because both run with NODE_ENV=production. Demo login works only in `next dev` / NODE_ENV=development or test. If a public demo site on a production build is needed, the patron has to decide that (see §5).
3. **`src/lib/auth.ts`:**
   - When the flag is off, the `Credentials` provider is **not registered at all** (`...(demoLoginEnabled ? [Credentials(...)] : [])`).
   - The hardcoded `admin@yasinaslan.com.tr` → platform admin rule is now tied to the flag in three places: `authorize` (`isSuperadmin`), the `jwt` callback (demo grant) and the `session` callback. With the flag off, platform admin comes **only from `User.isPlatformAdmin`** in the DB, which the jwt callback reads. The field already exists, so no schema change was needed.
   - DB fallback (`[Auth.authorize] DB fallback for demo`): the condition is now `NODE_ENV === "production" || !demoLoginEnabled` → sign-in is refused. With the flag off, `authorize` cannot run anyway because the provider is not registered.
4. **`src/app/[locale]/(app)/layout.tsx`:** the sidebar admin check `userEmail === 'admin@…'` became `isPlatformAdminDemoEmail(userEmail)`, so it is also tied to the flag.
5. **Login and registration pages** (`login/page.tsx`, `register/page.tsx`, `/kayit` → register):
   - Both pages call `await connection()`, so the flag is read **per request**, not baked in at build time.
   - `AuthCard` has two new props: `demoLoginEnabled` and `oauthProviders`.
   - With the flag off, these are not rendered: the email/password form, the name/organisation fields, the submit button and the "Hızlı Demo Giriş Rolleri" block.
   - With the flag off, only providers whose id **and** secret are set get a button.
   - If no OAuth provider is configured, the page shows a "Giriş yapılandırılmamış." box (`data-testid="signin-not-configured"`).
   - The OAuth registration disclosure checkbox is kept.
   - With the flag on, the page behaves as before: all buttons are shown.
6. **`loginWithCredentialsAction`:** with the flag off, it returns the plain message "E-posta ile giriş bu ortamda kapalı." instead of an Auth.js Configuration error.
7. **Test environment:** `vitest.config.mts` gets `test.env.DEMO_LOGIN_ENABLED='true'` and `playwright.config.ts` gets `testEnv.DEMO_LOGIN_ENABLED='true'`.
8. **`.env.example`:** added `DEMO_LOGIN_ENABLED=true` with an explanation. **Note:** `.env.example` is still git-ignored by the `.env*` rule (`git check-ignore` → `.gitignore:34:.env*`). The change is **local only** and not in a commit, same as in the se-fb report; devop-fb's K-8 card covers this. I also added `DEMO_LOGIN_ENABLED=true` to the local `.env`, so leed-fb's dev server on :3000 keeps its demo flow.
9. **Messages:** no new keys were added to `messages/*.json`. The two new texts use the inline `isTr ? … : …` pattern already in the file, to avoid conflicting with fe-fb.

## 2. Evidence

The build was done in a separate worktree (`git worktree add --detach … f3cb2536`, a copy of `.env`, `pnpm install --offline`). Nothing touched :3000. My own servers used ports 3100 and 3101 and were stopped afterwards, and the worktree was removed.

### 2.1 Flag off: `DEMO_LOGIN_ENABLED=false pnpm build && next start -p 3100`

```
build exit=0   (/[locale]/login, /register, /kayit → ƒ Dynamic)

$ curl /api/auth/providers
{"google":{…},"microsoft-entra-id":{…}}          ← no credentials provider

csrf len=64
--- POST /api/auth/callback/credentials (email=admin@yasinaslan.com.tr, csrfToken, password=x) ---
HTTP/1.1 302 Found
location: http://localhost:3100/api/auth/error?error=Configuration
--- cookie jar names ---
authjs.csrf-token
authjs.callback-url                                ← no authjs.session-token
--- GET /api/auth/session ---
null                                                ← NO SESSION OPENED
server log: [auth][error] Error: Provider with id "credentials" not found. Available providers: [google, microsoft-entra-id].
```

Login and registration HTML (number of occurrences):

```
== /tr/login  http=200                 == /tr/register  http=200              == /tr/kayit?kod=ABC123  http=200
  type="email"                0          type="email"              0            type="email"                     0
  type="password"             0          type="password"           0            type="password"                  0
  Hızlı Demo                  0          Hızlı Demo                0            Google ile Devam Et              0
  admin@yasinaslan.com.tr     0          admin@yasinaslan.com.tr   0            signin-not-configured            1
  Google ile Devam Et         1          Google ile Devam Et       1            Davet koduyla kayıt bu ortamda   1
  Microsoft Kurumsal          0          disclosure-ack            1
```

(Microsoft is not configured in the local `.env` because its id/secret are empty, so its button is hidden.)

No OAuth configured (`AUTH_GOOGLE_ID= AUTH_GOOGLE_SECRET=` in addition):

```
  type="email"              0
  Google ile Devam Et       0
  signin-not-configured     1
  Giriş yapılandırılmamış   1
```

Screenshots (AgentSpace internal browser):

- `docs/agent-results/TASK-MULSCEK4JHK8X-screenshots/01-flag-off-google-only.png`: only "Google ile Devam Et"
- `docs/agent-results/TASK-MULSCEK4JHK8X-screenshots/02-flag-off-no-oauth.png`: "Giriş yapılandırılmamış."

### 2.2 Production + flag on / invalid value → the server does not start

```
$ DEMO_LOGIN_ENABLED=true next start -p 3100
DEMO_LOGIN_ENABLED=true is not allowed when NODE_ENV=production: it lets anyone sign in as any account, platform admin included, without a password. Remove it from the production environment; the server will not start with it.
DEMO_LOGIN_ENABLED=true -> exit=1

$ DEMO_LOGIN_ENABLED=ture next start -p 3100
❌ Invalid environment variables: DEMO_LOGIN_ENABLED: Invalid option: expected one of "true"|"false"
DEMO_LOGIN_ENABLED=ture -> exit=1
```

### 2.3 Flag on: `next dev -p 3101` (DEMO_LOGIN_ENABLED=true from `.env`)

```
providers: ['google', 'microsoft-entra-id', 'credentials']
POST /api/auth/callback/credentials (admin e-mail, csrf)
HTTP/1.1 302 Found
location: http://localhost:3101/tr/default/dashboard
cookies: authjs.session-token authjs.csrf-token authjs.callback-url
session: {'email': 'admin@yasinaslan.com.tr', 'isPlatformAdmin': True, 'hasTenant': True}
```

In a real browser: `/tr/login` → "Gerekli Çerezler" → a **real click** on the "Platform Yöneticisi" demo button → the dashboard opened.

- `docs/agent-results/TASK-MULSCEK4JHK8X-screenshots/03-flag-on-demo-form.png`
- `docs/agent-results/TASK-MULSCEK4JHK8X-screenshots/04-flag-on-demo-admin-signed-in.png`

### 2.4 Gates (worktree, HEAD `f3cb2536`)

```
typecheck exit=0
lint      exit=0
vitest src/lib/demo-login.test.ts src/lib/auth-secret.test.ts   Tests 9 passed (9)
pnpm test   Test Files 7 failed | 160 passed | 8 skipped   Tests 46 failed | 1867 passed | 93 skipped
```

The 7 failing files match the baseline in the se-fb report one for one: `plan-admin`, `plan-repository`, `calendar-token-db.live`, `concept-template-tenant-scope.live`, `double-charge-prevention`, `plan-entitlement-version`, `relationship-tenant-scope`. They also fail with the same 46 tests. The cause is a DB credential error in the test environment: `Authentication failed … credentials for 'fabrika'`, which appears 18 times in the log. That is devop-fb's TASK-MULQKN4K7SRN0 card and is unrelated to this change. The passed count dropped from 1886 to 1867 because fe-fb removed the marketplace tests (`ae1615eb`). "test 0" was **not reached, because of these pre-existing failures.**

**e2e was not run:** the AgentSpace kill-guard (R8) blocks e2e runs while the live app is open. The command for the patron to run with `!` (the dev server Playwright starts gets `DEMO_LOGIN_ENABLED=true` from `testEnv`):

```
! cd /Users/macbook/alan/FONBRIDGE && MURAT_LIVE_OK=1 pnpm test:e2e tests/e2e/auth.spec.ts tests/e2e/registration-consent.spec.ts tests/e2e/identity-strings.spec.ts
```

### 2.5 Platform admin rows in the DB (local, read-only)

```
platform admins: 1 [ 'a***@yasinaslan.com.tr' ]   users total: 19
```

## 3. Changed files (`f3cb2536`)

`src/lib/demo-login.ts` (new) · `src/lib/demo-login.test.ts` (new) · `src/lib/env.ts` · `src/instrumentation.ts` · `src/lib/auth.ts` · `src/lib/tenant.ts` (comment only) · `src/lib/actions/auth.ts` · `src/app/[locale]/(app)/layout.tsx` · `src/app/[locale]/login/AuthCard.tsx` · `src/app/[locale]/login/page.tsx` · `src/app/[locale]/register/page.tsx` · `vitest.config.mts` · `playwright.config.ts`
Local only (git-ignored): `.env.example`, `.env`

## 4. Risks

- **B1 side effect (AÇIK):** with the flag off, **registration with an agency invite code is completely closed.** B1 decision S2-a hides OAuth when a code is present, because the OAuth round trip would lose the code. The code works only with the email form, and the email form is closed when the flag is off. `/kayit?kod=…` now shows only "Davet koduyla kayıt bu ortamda şu an kapalı." Evidence is in §2.1. The fix is the patron's decision: carry the code through OAuth (cookie + `events.createUser`), wait for the permanent sign-in design, or something else.
- **Rows the demo path wrote to the DB:** the demo path persisted `isPlatformAdmin=true` for `admin@yasinaslan.com.tr` (1 row locally). With the flag off, that row is still an admin: if someone signs in to that address with Google OAuth (`allowDangerousEmailAccountLinking: true`), they get platform admin. That is correct only if the person who owns that mailbox is a real admin. **The same row should be checked in production:** `SELECT email FROM "User" WHERE "isPlatformAdmin";`.
- **Existing JWTs:** tokens minted while the flag was on keep `isPlatformAdmin=true` in their payload until they expire. The jwt callback only sets the flag to `true` and never takes it back. When the environment is switched to "off", **rotate `AUTH_SECRET`** to invalidate those tokens.
- **Production before this change:** Credentials was **active** in production too; only the DB fallback was closed. If a production deployment ever existed, the risk above applies to it.
- **Out of scope, noted:** on a DB error, `safeAdapter.createUser` returns a fake `user-oauth-<ts>` id. This is the OAuth path, where identity has been verified by the provider, and the session is tenantless. It is a separate fallback from the one in this card.
- Demo mode cannot run on a production build (§1.2).

## 5. Open questions (for the patron)

1. How should registration with an invite code work with the flag off? (see the B1 side effect above)
2. Is a public demo site on a production build needed? If yes: a second explicit knob (e.g. `DEMO_LOGIN_ALLOW_PRODUCTION`), or the demo runs on a dev server?
3. The permanent sign-in design (password / magic link / OAuth only) is still open.

## 6. Next steps

- Patron: run the e2e command in §2.4 with `!`.
- Deploy: do not set `DEMO_LOGIN_ENABLED` in production; rotate `AUTH_SECRET`; check the `isPlatformAdmin` rows.
- devop-fb K-8: add the `!.env.example` exception, then commit this card's `.env.example` change.

**Platform:** verified on **mac** (Darwin 27, Node 26.5, Next 16.3.4; `next build`, `next start`, `next dev`, AgentSpace internal browser). The code path does not depend on the platform: it reads environment variables, checks strings and uses `process.exit(1)` (the same pattern already used by the `AUTH_SECRET` check). It behaves the same on Windows and Linux. The Docker image (Linux, `NODE_ENV=production`) refuses to start if the flag is set to `true`. **Windows/Linux were not run** because this machine is mac only.
