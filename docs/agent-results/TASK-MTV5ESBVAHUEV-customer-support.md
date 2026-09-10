# TASK-MTV5ESBVAHUEV — Retired brand, fix round: B3 + B4 + C1 + C3

**Agent:** customer-support (CS-EN) · **Sprint:** SPRINT-S12 · **Type:** bug/cleanup
**Spec read:** `docs/agent-results/TASK-MTTUTNGF1MO9P-customer-support.md` §3–§4 (my own inventory)
**Out of scope by instruction:** B1 (logo asset) and B2 (SMTP sender domain) — boss decision, untouched.
**Date:** 2026-09-10

---

## 1. What was done

Four findings closed, each by removing a hard-coded value rather than by renaming it.

### B3 · the storage host is now configuration, not a literal

`https://storage.fonbridge.app/` was written out in six places — five in `src/lib/storage.ts` and
one in `evidence/actions.ts`, which rebuilt the URL by hand instead of asking the storage module.
All six are gone.

- `R2_PUBLIC_HOST` added to `src/lib/env.ts` (`optionalUrl`, the same shape
  `NEXT_PUBLIC_POSTHOG_HOST` and `IYZICO_BASE_URL` use). `R2_BUCKET` moved into the schema at the
  same time, so `storage.ts` no longer reads `process.env` for either of them (CLAUDE.md "Yapma":
  no direct `process.env`). The R2 **credentials** at `storage.ts:13–20` still read `process.env`;
  moving a secret is a different change and is reported below rather than done here.
- One new function is the single place a stored-file URL is built:

  ```ts
  export function publicObjectUrl(objectKey: string): string | null {
    return PUBLIC_HOST ? `${PUBLIC_HOST}/${objectKey}` : null;
  }
  ```

- **When `R2_PUBLIC_HOST` is unset it returns `null`, and no link is invented.** That is the
  deliberate decision on this card. The alternative — substituting some other plausible host —
  would have kept the defect and only changed which dead domain the user is sent to. With `null`,
  `Evidence.fileUrl` is written as `NULL`, `evidence-client.tsx:501/768` renders no download button,
  and the file is still identified by `r2ObjectKey`. The user is shown nothing instead of a link
  that resolves nowhere.
- `deleteFileFromR2` no longer strips one specific host by `replace()`; it takes the path of any
  absolute URL. A row written before this change still names the retired domain, and a
  host-pinned `replace()` would have left those keys unstripped and deleted nothing.
- **No data migration is needed, and this is measured, not assumed:** `Evidence` holds 50 rows and
  **0** of them carry a `fileUrl` (§2.4). B3 was latent when I filed it and it is still latent; the
  change closes it before the first upload rather than after.

### B4 + C1 · the demo address on the public login page

`mehmet@fonbridge.app` → `mehmet@example.com` in one change, at both ends:
`src/lib/auth.ts:39` (the `DEMO_PROFILES` key) and
`src/app/[locale]/login/AuthCard.tsx:334,339` (the click handler and the visible line).
`example.com` is reserved by **RFC 2606** for exactly this use. No company domain was invented —
and `mehmet@fabrika.app` was specifically avoided: `tests/e2e/identity-honesty.spec.ts:27` lists it
as a forbidden invented identity.

`tests/e2e/identity-strings.spec.ts:86` pinned the old address and was updated to the new one. The
assertion was **not weakened** — it still requires the seat's address to be visible on the login
page, at the same strength, and it still passes for the same reason (§2.5).

### C3 · the bucket has one source again

`evidence/actions.ts:120` wrote `fileBucket: 'fonbridge-evidence'` as a literal, which silently
overrode the deployment's `R2_BUCKET` on every upload. It now writes `EVIDENCE_BUCKET`, exported
from `storage.ts` — the same value the S3 client actually reads and writes.

**The bucket *name* is unchanged, deliberately (C2).** 50 Evidence rows carry it and every stored
object lives under it; a bucket is an infrastructure identifier, not a brand surface. The one
remaining literal is its default in `storage.ts:31`, where the single source belongs.

---

## 2. Evidence

### 2.1 The literals are gone

```
$ grep -rn "storage\.fonbridge\.app" src/ tests/ prisma/ scripts/
0 hits — clean
$ grep -rn "mehmet@fonbridge" src/ tests/ prisma/ scripts/
0 hits — clean
$ grep -rn "'fonbridge-evidence'" src/ tests/ scripts/
src/lib/storage.ts:31:export const EVIDENCE_BUCKET = env.R2_BUCKET || 'fonbridge-evidence';   # the single source
```

Everything that still matches `fonbridge` is on the do-not-touch list from the inventory:

```
src/components/cart/CartContext.tsx:88          fonbridge_cart_items_v2          # D — renaming empties every cart
src/lib/hooks/use-read-notifications.ts:21,22,26 fonbridge_read_notifs_*         # D — renaming un-reads every notification
src/lib/storage.ts:31                            bucket default                  # C2 — infra identifier
prisma/schema.prisma:897                         fileBucket default              # C2 — 50 rows carry it
tests/{cart-checkout-signed-out,notifications-read-store,e2e/hydration-clean}    # the tests that pin D
```

### 2.2 The login page, before and after (served HTML)

Same URL, same server, `curl` before the edit and after it:

```
BEFORE  lass="text-[10px] text-muted font-mono">mehmet@fonbridge.app</div></div><sp
AFTER   lass="text-[10px] text-muted font-mono">mehmet@example.com</div></div><sp

$ curl -s localhost:3000/tr/login | grep -ic fonbridge      →  0
$ curl -s localhost:3000/en/login | grep -ic fonbridge      →  0
$ curl -s localhost:3000/tr/giris | addresses rendered      →  admin@yasinaslan.com.tr
                                                               ayse@tto.edu.tr
                                                               mehmet@example.com
```

### 2.3 Behaviour when `R2_PUBLIC_HOST` is undefined — measured, three ways

```
A. unset (the repo as it ships)
   R2_PUBLIC_HOST set?  : no (undefined)
   publicObjectUrl(key) : null                       ← no link invented
   EVIDENCE_BUCKET      : fonbridge-evidence         ← unchanged, as intended

B. set, with a trailing slash
   R2_PUBLIC_HOST set?  : "https://files.example.org/"
   publicObjectUrl(key) : https://files.example.org/t1/org-default/certificate/2026/ab12_belge.pdf
                                                     ← no doubled separator

C. set to a non-URL (a config typo)
   ❌ Invalid environment variables: R2_PUBLIC_HOST: Invalid URL
   Error: Invalid environment variables — R2_PUBLIC_HOST: Invalid URL
```

Case C is loud and names the variable — the house behaviour of `env.ts`, shared with every other
`optionalUrl` setting. It is listed under Risks because it fails at import, i.e. at boot.

### 2.4 Database — no migration required

```
Evidence rows total        : 50
Evidence rows with fileUrl : 0
fileBucket distribution    : [ { fileBucket: 'fonbridge-evidence', c: 50 } ]
```

### 2.5 Tests — including the deliberate break

New: `tests/storage-public-url.test.ts` (5 cases). Proven to bite before it was trusted — the old
hard-coded host was put back on purpose:

```
### RED (regression reinstated) ###
 ❯ tests/storage-public-url.test.ts (5 tests | 3 failed)
   × returns null when R2_PUBLIC_HOST is unset
AssertionError: expected 'https://storage.fonbridge.app/tenant-…' to be null
- Expected: null
+ Received: "https://storage.fonbridge.app/tenant-1/org-default/certificate/2026/ab12cd34_belge.pdf"
   × builds the URL from the configured origin
   × does not double the separator when the origin ends in a slash

### GREEN (regression reverted) ###
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Real browser, real click — the renamed demo seat still signs in end to end:

```
$ node <probe>.mjs                       # Playwright, headless Chromium, dev server :3000
login page shows demo seat : mehmet@example.com
landed on                  : http://localhost:3000/tr/default/dashboard
page contains "fonbridge"  : false
```

Screenshots: `docs/agent-results/assets/TASK-MTV5ESBVAHUEV/01-login-demo-seat-example-com.png`,
`02-signed-in-after-demo-login.png`. **Note what #02 also shows:** the top-left wordmark still
reads *FonBridge*. That is B1, excluded from this card by instruction, and the screenshot is the
proof it was left alone.

E2E over the surfaces this change touches — all green, including the two evidence-upload specs that
now run through `publicUrl = null`:

```
✓ evidence-fabrication.spec.ts        an upload with no readable metadata does not gain invented metadata
✓ evidence-unverified-badge.spec.ts   a document nothing has verified is not shown as verified
✓ evidence-unverified-badge.spec.ts   a fresh upload is recorded as unverified, not valid
✓ identity-honesty.spec.ts            (3 tests)
✓ identity-strings.spec.ts            (5 tests, incl. the updated assertion)
11 passed (12.8s)
```

### 2.6 `pnpm gate` — run on the working tree over HEAD `e33432c`

Stages, in order. `gate` is an `&&` chain, so every stage before `test:e2e` passed:

```
db:generate ✅   lint ✅ (0 errors; 2 pre-existing warnings in docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts, not mine)
typecheck   ✅   tsc --noEmit, no output
test        ✅   143 passed | 2 skipped (145 files) · 1696 passed | 8 skipped (1704 tests)
i18n:check  ✅   both catalogs agree and every key used in src/ resolves
rls:check   ✅   44/44 tenant-scoped models have policies
rls:verify  ✅   isolation really measured with the fabrika_app role — cross-tenant read and write refused
test:e2e    ❌   17 failed | 131 passed | 1 skipped | 4 did not run
```

**The gate is RED, and none of the 17 failures is mine — proven, not asserted.** In a shared
worktree I cannot stash, so I ran the counter-experiment on my own files only:

```
A. WITH my changes      invoice-write-path.spec.ts:131 ✘   :192 ✘   m9-ics-download.spec.ts:67 ✘  (3 failed, 2 passed)
   $ git checkout HEAD -- <my 6 tracked files> ; mv tests/storage-public-url.test.ts aside
B. WITHOUT my changes   invoice-write-path.spec.ts:131 ✘   :192 ✘   m9-ics-download.spec.ts:67 ✘  (3 failed, 2 passed)
   $ restore
```

Identical, down to the test ids. Corroborating: none of the 8 failing spec files mentions
`mehmet`, `storage`, `R2_`, `publicObjectUrl` or `fileBucket` (`m9-ics-download` matches "evidence"
only in prose). The m9 failures are a fixture collision —
`Unique constraint failed on the constraint: User_email_key` at
`tests/e2e/fixtures/m9-tenant.ts:61`, i.e. leftover database state, not code. The invoice failures
sit on `src/lib/efatura.ts` / the invoice export route, which were dirty in the tree from a
neighbour's card when the gate started and were committed mid-run.

---

## 3. Changed files

| File | What |
|---|---|
| `src/lib/env.ts` | `R2_PUBLIC_HOST` + `R2_BUCKET` added to the schema, with the reasoning |
| `src/lib/storage.ts` | `publicObjectUrl()`, exported `EVIDENCE_BUCKET`, 5 literals removed, host-agnostic key extraction |
| `src/app/[locale]/(app)/[workspace]/evidence/actions.ts` | calls `publicObjectUrl()` / `EVIDENCE_BUCKET`; builds no URL of its own |
| `src/lib/auth.ts` | demo profile key → `mehmet@example.com` (+ why) |
| `src/app/[locale]/login/AuthCard.tsx` | demo handler + visible line → `mehmet@example.com` |
| `tests/e2e/identity-strings.spec.ts` | pinned address updated (assertion unchanged in strength) |
| `tests/storage-public-url.test.ts` | **new** — 5 cases over `publicObjectUrl` / `EVIDENCE_BUCKET` |
| `docs/agent-results/TASK-MTV5ESBVAHUEV-customer-support.md` + 2 screenshots | this report |

Not touched, by instruction: `public/logo.png` (B1), `src/app/[locale]/admin/settings/smtp-form.tsx`
(B2), `prisma/schema.prisma` (C2), the localStorage keys (D), the nine historical-record comments
(bucket A), `messages/*.json`.

---

## 4. Risks

1. **A malformed `R2_PUBLIC_HOST` takes the app down at boot**, not at the upload. `optionalUrl`
   throws from `env.ts` at import time. This is the existing house pattern and the message names the
   variable, but whoever sets it must know that `files.example.org` (no scheme) is a fatal typo.
2. **Uploads before `R2_PUBLIC_HOST` is set record no `fileUrl`.** The file is stored and keyed;
   only the public link is absent, and it fills in for later uploads once the host is configured.
   Rows created in the gap will need a backfill if links matter for them — cheap today (0 rows),
   less cheap after the first production uploads. Whoever configures R2 should set this at the same
   time.
3. **`EVIDENCE_BUCKET` now follows `R2_BUCKET` on the write path too.** That is the point of C3, but
   it means a deployment that sets `R2_BUCKET` to something new starts recording that name in
   `fileBucket`, where previously every row said `fonbridge-evidence` regardless. Rows written
   before and after would then disagree — correctly, but a reader should expect it.
4. **The gate cannot be shown green from my side.** It is red for reasons in other people's cards
   (§2.6). Anyone reading "gate: red" on this commit needs §2.6, not just the exit code.
5. Shared worktree: my commit names only my own paths. Neighbours had uncommitted work in
   `src/lib/llm.ts`, `src/modules/m6/server/comparison.ts`, `src/lib/brand.ts` and
   `src/app/[locale]/admin/settings/smtp-form.tsx` throughout.

---

## 5. Adjacent defects — reported by name, NOT fixed

1. **`/api/evidence/mock-upload` does not exist.** `storage.ts:86,103` hands the browser that URL as
   the dev-mode upload target, and `evidence-client.tsx:186` branches on it — but there is no route
   under `src/app/api/evidence/`. The dev upload path posts into a 404.
2. **`uploadFileToR2()` (`storage.ts:134`) uploads nothing.** It sleeps 300 ms, makes up an object
   key and returns a URL. `createEvidence()` then writes that key to `r2ObjectKey` as though a file
   were stored. Same defect class as B3 — a truthful-looking value with nothing behind it.
3. **`getPresignedDownloadUrl()` has no caller** anywhere in `src/`. It is exported, maintained and
   dead; the download links read `Evidence.fileUrl` directly, which is why the presigned path never
   protects anything.
4. **R2 credentials still read `process.env` directly** (`storage.ts:13–20`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), against the CLAUDE.md rule. Left alone deliberately:
   secrets are a different card from brand strings.
5. **`tests/e2e/fixtures/m9-tenant.ts:61` is not idempotent** — it upserts by `id` while `email` is
   unique, so a leftover row with the same address fails the whole m9 suite (§2.6). It is a fixture
   bug, and it is currently costing four e2e tests on every gate run.
6. Still open from the inventory and unrelated to this card: **the guard test's three blind spots**
   (`tests/retired-brand-name.test.ts` is case-sensitive, scans only `.ts|.tsx|.json`, and never
   walks `public/` or `prisma/`). It is 5/5 green and saw none of B3, B4, C1 or C3. Until it is
   widened, nothing stops these literals coming back.

---

## 6. Open questions

1. What is the real public host for R2 — is there a Fabrika-branded storage domain, or does the
   deployment intend to serve evidence through the app instead? (Answering it also settles risk 2.)
2. Are the four demo seats meant to survive at all outside development? A public login page that
   offers one-click sign-in as a tenant owner is a bigger question than which domain it prints.

## 7. Next step

- Someone with the domain answers should set `R2_PUBLIC_HOST` in the deployment; nothing in the code
  needs to change for it.
- Adjacent defects 1–3 belong together on one "the evidence upload path is a mock" card — they are
  the same untruth in three functions.
- Defect 5 (the m9 fixture) is blocking four e2e tests for everybody, every run.
- The guard widening (§5.6) is still the thing that prevents the next round of this.

---

## Platform statement

**Verified on macOS** — Darwin 25.6.0 (arm64), zsh, Node v26.5.0, pnpm, Next.js dev server on
`localhost:3000`, Playwright/Chromium headless, PostgreSQL via the repo's `DATABASE_URL`.

**Windows / Linux: not run.** Reason: a single macOS workstation; no isolated Windows or Linux
environment in this session.

**Cross-platform assessment, from the code:** every line changed is platform-independent. They are
a zod schema entry, string construction from an environment variable, a `new URL().pathname` call,
a Prisma field value and two email literals. No process is killed, no shell or binary is named, no
OS path separator is used (`publicObjectUrl` joins URL segments with `/`, which is not a filesystem
path), no DPI, screen-size, clipboard, keyboard-shortcut or device-permission branch is involved.
`env.ts` reads `process.env`, which Node populates identically on all three platforms.
**The behaviour reproduces unchanged on Windows and Linux**, and none of it needs per-platform
re-verification. The one platform-sensitive thing in the vicinity — the dev server and Playwright
browser used to take the evidence — is tooling, not shipped code.
