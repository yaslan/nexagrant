# TASK-MTV69TO4K8NVZ — the demo seat moves to the company's own domain

**Agent:** customer-support (CS-EN) · **Sprint:** S12 · **Type:** bug/copy · **Date:** 2026-09-10
**Platform verified on: macOS (darwin 25.6.0, zsh).** Nothing touched here is platform-dependent —
the change is three string literals and a comment in TypeScript, rendered by Next.js and asserted by
Playwright. No process handling, no file path, no shell or binary name, no keyboard-shortcut text, no
screen/DPI assumption, no camera or microphone permission. Windows and Linux were **not run** (no
machine available in this session) and there is no code path that could behave differently on them.

---

## 1. What was done

The one-click demo seat for the SME role moved from `mehmet@example.com` to **`demo@usfinbridge.com`**,
at both ends of the flow, plus the assertion that pins it.

| # | Where | Before | After |
|---|---|---|---|
| a | `src/lib/auth.ts:39` — `DEMO_PROFILES` key | `"mehmet@example.com"` | `"demo@usfinbridge.com"` |
| b | `src/lib/auth.ts:36` — the comment above it | RFC 2606 rationale | rewritten, see below |
| c | `src/app/[locale]/login/AuthCard.tsx` — handler argument + visible line | two literals | one constant, `DEMO_SEATS.sme` |
| d | `tests/e2e/identity-strings.spec.ts:86` | expects the old address | expects the new one |

### (b) The comment

The previous comment said example.com is reserved *for exactly this*. After the key changed, that
sentence would have contradicted the line under it, so it was rewritten rather than left standing.
The warning it carried is kept — that was the part worth keeping:

```
  // The rule this seat has to satisfy is unchanged: a demo address printed on
  // the public login page must never look like a real mailbox at a company we
  // do not control. It was parked on the domain RFC 2606 reserves for
  // documentation while the brand domain was in flux (TASK-MTV5ESBVAHUEV);
  // usfinbridge.com is our own domain, so a seat on it names nobody else's
  // mailbox and reads as ours rather than as a placeholder (owner's decision,
  // 2026-09-10, TASK-MTV69TO4K8NVZ). If this ever has to move off a domain the
  // company owns, move it back to that reserved domain — never invent a
  // plausible third-party one.
```

The literal string `example.com` is deliberately not in it: the card's own grep check treats that
string as a failure, so the rule is stated as "the domain RFC 2606 reserves for documentation".

### (c) Why `AuthCard` cannot read the address from `auth.ts`

**One sentence, as asked:** `AuthCard.tsx` is a `'use client'` component and `src/lib/auth.ts` imports
NextAuth, the Prisma adapter and the database client, so importing `DEMO_PROFILES` from it would drag
the whole server auth stack into the browser bundle — the addresses would have to move to a
server-free module of their own first, which is outside this card's scope.

What *was* removed is the duplication inside the file. Each of the three demo buttons used to write
its address twice — once as the `handleDemoLogin` argument, once as the visible `<div>` — so a rename
could change the label while the button still signed in as the old address. There is now one
`DEMO_SEATS` constant at the top of the file and both sides read from it:

```ts
const DEMO_SEATS = {
  platformAdmin: 'admin@yasinaslan.com.tr',
  sme: 'demo@usfinbridge.com',
  tto: 'ayse@tto.edu.tr',
} as const;
```

So the address is now written **twice in the repo**, not three times: once as the map key in
`auth.ts`, once in `DEMO_SEATS`. The comment on `DEMO_SEATS` records that these two lists have to be
kept in step by hand, and why.

---

## 2. Evidence

### 2.1 The real risk: clicking the button (the address is a map KEY)

Changing the local part could have silently broken the profile lookup — the sign-in would still
succeed, but `DEMO_PROFILES[email]` would miss and the seat would fall through to the generic
`${computedName} Kuruluşu` path with a default `SME`/`role`. So the button was actually clicked, in a
real Chromium, against a dev server on port 3210/3100, and the POST body was captured:

```
LOGIN PAGE shows seat: demo@usfinbridge.com
POST bodies carrying an address:
   /tr/giris -> demo@usfinbridge.com
URL after click : http://localhost:3100/tr/default/dashboard
session cookie  : authjs.session-token (len 691)
page <title>    : Panel — Fabrika
GET /api/auth/session -> 200 {"user":{"name":"Demo","email":"demo@usfinbridge.com","image":null,
"id":"cmtv6gz2u0000gcxk2wco8rc5"},"expires":"2026-10-10T07:00:20.675Z",
"tenantId":"cmtv6gz2z0001gcxkls4f3ngn","role":"TENANT_OWNER",
"workspaceIds":["cmtv6gz330002gcxkto5tiz88"],"isPlatformAdmin":false}
```

**Proof the map key matched rather than the fallback** — the tenant the sign-in created carries the
`orgName` from `DEMO_PROFILES`, not the derived name, and the role is the one the profile declares:

```
NEW ROW: {
  "id": "cmtv6gz2u0000gcxk2wco8rc5",
  "email": "demo@usfinbridge.com",
  "name": "Demo",
  "memberships": [
    { "role": "TENANT_OWNER",
      "tenant": { "name": "FonBridge SME Ar-Ge Ltd.", "slug": "org-co8rc5", "orgType": "SME" } }
  ]
}
```

Had the key missed, `tenant.name` would read `Demo Kuruluşu`. It does not.

Frames: `TASK-MTV69TO4K8NVZ-screenshots/01-login-demo-seat.png` (the login page showing the seat),
`…/02-signed-in-dashboard.png` (the dashboard after the click, user chip "Demo").

### 2.2 Served HTML, before and after

Both captures are from a running dev server (`pnpm dev -p 3100`), same URL `/tr/giris`. The "before"
was taken by restoring the two files to `HEAD` for the length of one request, then restoring the new
content from a scratchpad copy (not from git), so nothing of the change was lost.

```
BEFORE demo@usfinbridge.com hits: 0
BEFORE mehmet@example.com  hits: 1
lass="text-[10px] text-muted font-mono">mehmet@example.com</div></div><span class="

AFTER  demo@usfinbridge.com hits: 1
AFTER  mehmet@example.com  hits: 0
lass="text-[10px] text-muted font-mono">demo@usfinbridge.com</div></div><span class="
```

### 2.3 The required grep

```
$ grep -rn "mehmet@\|example.com" src/lib/auth.ts "src/app/[locale]/login/AuthCard.tsx"
exit=1 (no matches — clean)
```

### 2.4 e2e — the identity specs, run for real

Port 3000 is held by a neighbouring dev server that answers 500, and `playwright.config.ts` sets
`reuseExistingServer: false`, so the run was pointed at a free port with `E2E_PORT=3210`; Playwright
started and tore down its own server.

```
$ E2E_PORT=3210 npx playwright test tests/e2e/identity-strings.spec.ts tests/e2e/identity-honesty.spec.ts
  ✓ 5 [chromium] › identity-strings.spec.ts:79 › the login page headlines the demo seat, not a person
  ✓ 6 [chromium] › identity-strings.spec.ts:98 › the login page in English shows the same seats, translated
  … 8 passed (8.4s)
E2E EXIT=0
```

### 2.5 `pnpm gate` — run at commit `1e3dd94`, **red, and not because of this change**

```
$ git rev-parse --short HEAD
1e3dd94
$ pnpm gate
… ✖ 22636 problems (1872 errors, 20764 warnings)
GATE EXIT=1
```

The gate is `db:generate && lint && typecheck && test && i18n:check && rls:check && rls:verify &&
test:e2e`. It stops at **lint**, so the later stages were run individually to get a real signal:

| Stage | Result | Mine? |
|---|---|---|
| `lint` (whole repo) | ✘ 1872 errors | **no** — every error path is under `.claude/worktrees/…` (a full nested checkout eslint has no ignore for) or `docs/agent-results/…*.mts` probe files. Zero from `src/` or `tests/`, proven below. |
| `lint` (my files) | ✓ exit 0 | — |
| `typecheck` | ✓ `tsc --noEmit`, clean | — |
| `test` (vitest) | ✘ 304 failed | **no** — see 2.6 |
| `i18n:check` | ✓ passed | — |
| `rls:check` | ✓ 44/44 models have policies | — |
| `rls:verify` | ✓ isolation measured live, read and write refused at the tenant boundary | — |
| `test:e2e` | ✓ for the specs this card touches (2.4); full suite not reached, lint blocks the gate | — |

Proof no lint error is mine:

```
$ grep -E "^/Users" gate.log | sed 's|…/fabrika/||' | awk -F/ '{print $1"/"$2}' | sort | uniq -c
 434 .claude/worktrees
   2 docs/agent-results
$ grep -E "^(src|tests)/" gate.log | sort -u
(no output)
$ npx eslint src/lib/auth.ts "src/app/[locale]/login/AuthCard.tsx" tests/e2e/identity-strings.spec.ts
eslint-exit=0
```

### 2.6 The 304 unit failures are the brand restore, not this card

80 of the 130 failing test files are duplicates inside `.claude/worktrees/e2e-fix` and
`.claude/worktrees/zztest-validation` — vitest walks the nested checkouts. In the main tree exactly
three files fail, all of them pinning the brand name that commit `9af3f63` changed:

```
FAIL tests/brand-surfaces-render.test.tsx › public footer renders the product name (tr)
  AssertionError: expected '© 2026 FonBridge (FonBridge SaaS). Tü…' not to contain 'FonBridge'
FAIL tests/retired-brand-name.test.ts › no live source file … names the retired brand
  AssertionError: expected [ …(33) ] to deeply equal []
FAIL tests/retired-brand-name.test.ts › neither message catalogue names the retired brand
FAIL tests/document-exporter.test.ts › states that no funding body issued the document
```

Neither file I touched appears in the 33-file offender list, and neither contains the string
`Fabrika`:

```
$ grep -c "Fabrika" src/lib/auth.ts "src/app/[locale]/login/AuthCard.tsx"
src/lib/auth.ts:0
src/app/[locale]/login/AuthCard.tsx:0
```

---

## 3. Files changed

| File | Change |
|---|---|
| `src/lib/auth.ts` | `DEMO_PROFILES` key → `demo@usfinbridge.com`; the comment above it rewritten |
| `src/app/[locale]/login/AuthCard.tsx` | new `DEMO_SEATS` constant; all three buttons read handler argument and visible line from it |
| `tests/e2e/identity-strings.spec.ts` | the pinned address follows the change (one string; the assertion was not weakened) |
| `docs/agent-results/TASK-MTV69TO4K8NVZ-customer-support.md` | this report |
| `docs/agent-results/TASK-MTV69TO4K8NVZ-screenshots/*.png` | 2 frames |

`tests/e2e/identity-strings.spec.ts` is one line outside the stated scope. It asserts the exact string
this card changes, so leaving it would have turned a passing spec red **because of this change** —
that is not an adjacent defect, it is part of the change. Flagged here rather than done quietly.
`smtp-form.tsx` was not opened.

---

## 4. Database — reported, not migrated (decision needed)

Nothing in `prisma/seed.ts` references either address; the demo seats are created at first sign-in by
`authorize()` in `src/lib/auth.ts:203`, which creates the `User`, `Tenant`, `Workspace` and
`Membership` when the address is unknown. So **no migration is needed and none was written.** Two rows
now exist in the shared dev database, and the decision on them is yours:

| `User.id` | email | created | note |
|---|---|---|---|
| `cmtv5vbpm0063swxkf6tf4tvp` | `mehmet@example.com` | 2026-09-10 06:43 UTC | **orphan** — created by the previous card's click test; no button points at it any more |
| `cmtv6gz2u0000gcxk2wco8rc5` | `demo@usfinbridge.com` | 2026-09-10 ~07:00 UTC | created by this card's click test, with tenant `FonBridge SME Ar-Ge Ltd.` |

The orphan is harmless (it is only reachable by typing the address into the form) but it does carry a
tenant and a workspace. **Question for the owner: delete the `mehmet@example.com` row and its tenant,
or leave it?** I have not touched it.

---

## 5. Risks

- **The address lives in two files.** `auth.ts` holds the map key, `AuthCard.tsx` holds `DEMO_SEATS`.
  If they drift, the button prints one address and signs in as another, and the seat silently loses
  its org name and role — exactly the failure 2.1 tests for. `tests/e2e/identity-strings.spec.ts`
  catches the visible half; nothing catches a change to the `auth.ts` key alone except that the
  created tenant would be named `Demo Kuruluşu`.
- **`usfinbridge.com` must stay a company domain.** The moment it lapses, the login page is printing a
  plausible address at a domain someone else can register. The comment in `auth.ts` says so.
- The dev server on **port 3000 answers 500** and was left running — it belongs to another pane and
  was not touched. My own server (port 3100) was started and stopped by me.

---

## 6. Adjacent defects — reported by name, not fixed

1. **The gate can never go green: eslint and vitest both walk `.claude/worktrees/`.**
   `.claude/worktrees/e2e-fix` and `.claude/worktrees/zztest-validation` are full checkouts of this
   repo. eslint finds 434 error-carrying files there and vitest runs 80 duplicate test files. Nothing
   in `eslint.config` or `vitest.config` excludes that directory. Until it does, `pnpm gate` stops at
   lint for everyone, whatever they changed.
2. **The brand restore (`9af3f63`) left its own tests inverted.** `tests/retired-brand-name.test.ts`
   still treats `Fabrika` as live and `FonBridge` as retired, so it lists 33 "offenders" and its
   catalogue check fails; `tests/brand-surfaces-render.test.tsx` asserts the footer does *not* contain
   the name it now correctly contains. 12 failing assertions in the main tree.
3. **`messages/en.json` and `messages/tr.json` still hard-code the retired brand** — the signed-in page
   title reads `Panel — Fabrika` (2.1). `tests/retired-brand-name.test.ts` scans `src/` and
   `next.config.ts` only, so it cannot see the catalogues from its first test; its second test can,
   and that is one of the failures in (2).
4. **`docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts` are linted as source.** Committed evidence
   probes contribute 2 error-carrying files to the repo-wide lint.

---

## 7. Open questions

1. Delete the orphan `mehmet@example.com` user and its tenant, or leave it? (§4)
2. Should the three demo addresses move into a small server-free module (e.g. `src/lib/demo-seats.ts`)
   that both `auth.ts` and `AuthCard.tsx` import, so there is genuinely one source? It is a five-line
   file and it closes the drift risk in §5, but it is a new file and outside this card.

## 8. Next step

Owner decides §7.1 and §7.2. Independently of this card, adjacent defect (1) is the one worth taking
first — no other card's gate can be read honestly until `.claude/worktrees/` is out of lint and test
discovery.
