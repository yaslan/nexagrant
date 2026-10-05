# TASK-MULRTOTG9IKIM — Ö-4: committed NextAuth signing-key fallback removed, AUTH_SECRET and CALENDAR_ENCRYPTION_KEY rotated

**Agent:** se-fb · **Sprint:** FB-GAP-1 · **Branch:** dev (not pushed) · **Source:** `docs/agent-results/TASK-MULQLVLW21FE2-crw-fb.md` §3 Ö-4 and K-9

**Commits:**

| Commit     | Content                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bfe33cd7` | `src/lib/auth.ts` fallbacks removed + `src/instrumentation.ts` + `src/lib/auth-secret.ts` (+ test). **be-fb builds on this commit.** |
| `3c5f753a` | `docker-compose.yml` env reference, `playwright.config.ts` test key, 11 e2e specs + `fixtures/auth-secret.ts`, probe file            |
| `14e5fc50` | `instrumentation.ts`: exit the process when the key is missing instead of answering every request with 500                           |

Secret values appear nowhere in this report. Only md5 fingerprints, lengths and counts are given.

## 1. What was done

1. **`src/lib/auth.ts`:** removed the literal fallback in `secret: AUTH_SECRET || NEXTAUTH_SECRET || "<literal>"`. The `demo-google-id` / `demo-google-secret` fallbacks are also gone. The `demo-entra-id` / `demo-entra-secret` fallbacks in the same file were the same class of issue (they hide a configuration error), so I removed them too. The `Credentials.authorize` branch was **not touched** (per leed-fb's warning; be-fb is working there).
2. **Startup check:** `src/instrumentation.ts` → `assertAuthSecretConfigured()` (`src/lib/auth-secret.ts`). If `AUTH_SECRET` (or `NEXTAUTH_SECRET`) is missing or blank, the server logs a clear message and **exits with code 1**. It also rejects the retired key, which lives in git history, by its SHA-256 digest. Only the digest is in the code, not the value. The same check applies to dev, `next start` and the standalone server. `next build` does not need the key, so CI and Docker image builds are unaffected.
   - Why exit instead of throwing: with the first version (throw), Next logged the error but **kept listening** and answered every request with 500. A port health check would have seen a running server (measured, §2.2).
3. **`docker-compose.yml:16`:** `AUTH_SECRET=${AUTH_SECRET:?set AUTH_SECRET (openssl rand -base64 32)}`. Compose refuses to start without the variable.
4. **e2e:** the 11 specs now call `e2eAuthSecret()` from `tests/e2e/fixtures/auth-secret.ts`. There is no fallback, and a missing key throws. `playwright.config.ts` gives both the dev server and the specs a single **test-only** key (`test-e2e-auth-secret-fixture-not-for-any-deployment`, overridable with `E2E_AUTH_SECRET`). It is different from the key in `.env`. Because `process.env` takes precedence over `.env` in Next, the server Playwright starts verifies with this key.
5. **`tmp-mint-cookie.mjs`:** it no longer exists in HEAD. It was added in `ca73ced5` and deleted in `7a40d72e`. The only other place that referenced it is the crw-fb report. No action needed.
6. **`docs/agent-results/ADR-0002-evidence-2/probe-checkout-vat.mts`:** the literal fallback was removed, and it throws if `AUTH_SECRET` is missing (behaviour otherwise unchanged).
7. **Local `.env` rotation:** `AUTH_SECRET` and `CALENDAR_ENCRYPTION_KEY` were replaced with `openssl rand -base64 32`, without being printed anywhere.
8. **`.env.example`:** `AUTH_SECRET=change-me` became blank, with a comment. `change-me` would have passed the startup check. Instructions and a warning were added to `CALENDAR_ENCRYPTION_KEY`. **Note:** `.env.example` is currently git-ignored (the `.env*` rule; a `!.env.example` exception is devop-fb's K-8 card). This change stays local only and is not in a commit.
9. **Test fixtures (K-9):** the calendar tests keep their own fixture keys (`SAMPLE_HEX_KEY`, `TEST_KEY`). After the rotation, the local `.env` key is no longer equal to them. The new auth test uses the value `test-only-auth-secret-not-used-anywhere-else`.

## 2. Evidence

### 2.1 Fingerprints (values not printed)

```
old literal (auth.ts:170)   len=51 md5=1af6d60b9230a828ab4fec6941f3ddc8
.env AUTH_SECRET (before)   len=51 md5=1af6d60b9230a828ab4fec6941f3ddc8   ← identical to the literal (Ö-4 confirmed)
.env AUTH_SECRET (after)    len=44 md5=332e26b92c762e780668dff0f417907a
.env CALENDAR_ENCRYPTION_KEY before md5=fe3a1ff5…  after len=44 md5=82769607406afaf615e0d7ff959a03fd (decodes to 32 bytes)
```

`git grep -F <old literal>` (value read from a file, not printed):

```
HEAD matches: 0 files
prev (2bd7667d) matches: 14 files
```

### 2.2 Startup without the key (HEAD `14e5fc50`, separate worktree, no `.env`)

```
$ env -u AUTH_SECRET -u NEXTAUTH_SECRET pnpm build        → build exit=0
$ env -u AUTH_SECRET … node .next/standalone/server.js
AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and put it in the environment; the server will not start without a session-signing key.
[probe] exit code=1
$ env -u AUTH_SECRET … next start -p 3491                 → same message, exit code=1
$ env -u AUTH_SECRET … next dev -p 3494                   → same message, exit code=1
$ AUTH_SECRET=<retired key, md5 1af6d60b…> node .next/standalone/server.js
AUTH_SECRET is a retired key that is published in the git history. Rotate it with `openssl rand -base64 32`.
[probe] exit code=1
```

First version (throw only, `bfe33cd7`), measured on standalone. This is why exit was added:

```
Failed to prepare server Error [AuthSecretNotConfiguredError]: …
[probe] GET /tr -> 500
[probe] GET /api/auth/session -> 500
[probe] alive at 15s -> killing own child
```

docker-compose:

```
$ env -u AUTH_SECRET docker compose config -q
error while interpolating services.fabrika-web.environment.[]: required variable AUTH_SECRET is missing a value: set AUTH_SECRET (openssl rand -base64 32)
$ AUTH_SECRET=x docker compose config -q   → exit=0
```

### 2.3 Real browser sign-in with the new key

`next start -p 3493` in a separate worktree, using the rotated `.env` (without an AUTH_SECRET in the shell, so the key came only from `.env`). In the AgentSpace internal browser: `/tr/login` → cookie banner "Gerekli Çerezler" → email `demo@usfinbridge.com` → submit. The dashboard opened (signed in).

- `docs/agent-results/TASK-MULRTOTG9IKIM-screenshots/01-login-form-new-key.png`
- `docs/agent-results/TASK-MULRTOTG9IKIM-screenshots/02-signed-in-dashboard-new-key.png`

### 2.4 JWT signed with the old key is rejected

The same platform admin token, minted in scratchpad with `next-auth/jwt` `encode()` (salt `authjs.session-token`), sent to the same server:

```
retired key: HTTP 200, session=null (rejected)
current key (positive control): HTTP 200, session=user.email=admin@yasinaslan.com.tr isPlatformAdmin=undefined
```

Server log for the rejected token: `JWTSessionError … cause: Error: no matching decryption secret`. The positive control shows the mechanism works and that the key difference alone causes the rejection. Before the rotation, the `.env` key was identical to the literal (§2.1), so the same old-key token would have been accepted.

### 2.5 Calendar data affected by the rotation

```
fabrika                {"total":1,"encrypted":0,"with_token":0,"providers":"ics"}
fabrika_db             relation "CalendarConnection" does not exist
fabrika_planver_probe  relation "CalendarConnection" does not exist
```

The only row is ICS and has no token. **0 encrypted rows exist**, so no data became unreadable after the rotation.

### 2.6 Gates (HEAD `14e5fc50`, separate worktree)

```
typecheck exit=0
lint exit=0
vitest src/lib/auth-secret.test.ts      Tests 4 passed (4)
pnpm test (HEAD 14e5fc50)   Test Files 7 failed | 160 passed | 8 skipped   Tests 46 failed | 1886 passed | 93 skipped
pnpm test (baseline 2bd7667d, same worktree and .env)
                            Test Files 7 failed | 159 passed | 8 skipped   Tests 46 failed | 1882 passed | 93 skipped
```

The failures are the **same 46 tests in the same 7 files** at both commits (`plan-admin`, `plan-repository`, `calendar-token-db.live`, `concept-template-tenant-scope.live`, `double-charge-prevention`, `plan-entitlement-version`, `relationship-tenant-scope`). The cause is `PrismaClientKnownRequestError: Authentication failed against the database server … credentials for 'fabrika'`, an env/DB credential issue in the test environment. It is unrelated to this change. It falls within devop-fb's TASK-MULQKN4K7SRN0 card ("vitest should load .env"). My change adds +4 passing tests. So "test 0" in the DoD **was not met, because of a pre-existing failure.**

**e2e was not run:** the AgentSpace kill-guard (R8) blocks Playwright runs while the live app is open. The specs pass typecheck and lint. Command for the patron: `MURAT_LIVE_OK=1 pnpm test:e2e tests/e2e/identity-strings.spec.ts` (all specs share the same helper).

## 3. Changed files

- `src/lib/auth.ts`, `src/instrumentation.ts` (new), `src/lib/auth-secret.ts` (new), `src/lib/auth-secret.test.ts` (new)
- `docker-compose.yml`, `playwright.config.ts`, `tests/e2e/fixtures/auth-secret.ts` (new), 11 × `tests/e2e/*.spec.ts`
- `docs/agent-results/ADR-0002-evidence-2/probe-checkout-vat.mts`
- Not committed (git-ignored): `.env` (rotation), `.env.example` (placeholders)
- This report + 2 screenshots

## 4. Risks

- **The old key is still in git history** (`c915bc43` and the others). Per the rules, history was not rewritten. The value is effectively public, which is why the startup check rejects it by digest.
- **Local sessions dropped:** existing local session cookies are invalid after the rotation. Anyone signed in on this machine (agent or human) has to sign in again. A dev server that is already running holds the old key in memory. After a restart it picks up the new `.env` key.
- **New observation (outside this card, not fixed):** the Credentials provider does not check a password. A wrong password signed in `demo@usfinbridge.com` in §2.3, and the login page says "Demo için serbest / ŞİFRESİZ OTURUM". The platform admin address (`admin@yasinaslan.com.tr`) is also a one-click passwordless demo sign-in. This is a deliberate demo feature, but I could not find an env gate that turns it off in production. On a deployed environment, anyone could sign in as any existing email address, including the platform admin. That risk is more direct than Ö-4. It sits in the `authorize` branch be-fb is working on, so I didn't touch it. **I propose a separate card** (demo sign-in only when `DEMO_LOGIN_ENABLED=true`, off in production, with real credential verification).
- `.env` permissions are `644`. On a single-user machine the risk is low, but `chmod 600` is recommended.

## 5. Open questions / patron actions

- **Patron action:** check the deploy/production `AUTH_SECRET`. If it is unset, the new code will not start the server there. That is intended, but it has to be set before deploy. If it was ever set to the old literal (md5 `1af6d60b…`), the server will also refuse to start. In both cases, rotate with `openssl rand -base64 32`. As long as the old value was in use, anyone with repo access could mint a session JWT. I did not touch the deploy environment.
- **Patron action:** if a deploy environment has a `CALENDAR_ENCRYPTION_KEY`, check whether it equals the commit fixture (K-9). Rotating it makes existing encrypted tokens unreadable, and users would have to reconnect their calendars.
- Should the passwordless demo sign-in get a production gate (see Risks)?

## 6. Next step

- be-fb: add the invite code in `authorize` on top of `bfe33cd7` (leed-fb was notified along with the hash).
- devop-fb: the `!.env.example` exception in K-8 (so these placeholders get tracked) and the vitest DB credential issue (TASK-MULQKN4K7SRN0).
- leed-fb: open a card for the passwordless demo sign-in production gate.

## Platform statement

Verified on **mac** (darwin, Node 26.5, Next 16.3.4): build, `next start`, standalone, `next dev`, docker compose config, and the real browser sign-in. The changed code paths are platform-independent: `process.env`, `process.exit(1)`, `crypto.createHash` and Compose `${VAR:?}` interpolation behave the same on Windows and Linux. The only platform difference is the key-generation instruction `openssl rand -base64 32`, which isn't built into Windows (use Git Bash/WSL, or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). **Windows/Linux were not run:** this machine has only macOS.
