# TASK-MTRKWBLXUYSHS — Silent failures (P1)

**Agent:** BE-EN (`geli-tirici`) · **Wave:** S12 "Schema Contract" · **Branch:** `dev`

All three reported symptoms were real, and all three had the same root cause:
**code writing to Prisma columns that do not exist**, with the resulting
`PrismaClientValidationError` either killing a cron job or being swallowed into a
`console.warn`. None of it was visible from the test suite, because every
existing test mocked the Prisma client — a mock accepts any column name.

---

## 1. What was done

### (a) `alerts-daily` died every morning — CONFIRMED, fixed
`src/lib/inngest/jobs/alerts-daily.ts:27` asked for `include: { tenant: true }`.
`model SavedSearch` (prisma/schema.prisma) carries only the `tenantId` scalar and
declares no `tenant` relation, so the job threw before reaching the database on
every 08:00 UTC run. **Not one saved-search alert e-mail has ever been sent.**
`search.tenant` was never read anywhere in the file.

- Query is now `select: { id, tenantId, name }`; the owner is fetched by a
  separate query keyed on the scalar id (`ownerEmailQuery`) — the M2 pattern, and
  the same shape the sibling job `credits-monthly-grant.ts` already uses.
- Both query shapes are exported so a test can hand them to the **real** client.
- Only the owner's e-mail is selected now, not the whole user row.
- The per-search loop moved into one `step.run`, as in `credits-monthly-grant`:
  counters mutated across many memoised steps replay back to zero.
- **No longer silent:** a run that ends with failures writes a `SystemAlert`
  (`source: alerts-daily`). A failure to read the searches at all alerts and then
  re-throws — answering `totalSearches: 0` for a query that never ran would be a
  false success.

### (b) SSO domain matching always empty — CONFIRMED, fixed
`src/lib/sso.ts:23` wrote `prisma.tenant.update({ data: { domain } })`.
**`model Tenant` has no `domain` column.** Prisma rejected every call; the
`catch` turned it into `console.warn` and the function returned `success: true`
regardless, so the admin screen showed a green "saved" tick for a write that
never happened. Nothing was ever stored, which is exactly why matching was empty.

- The configuration now goes into `Tenant.settings` — the JSON column the schema
  already documents for tenant configuration — read-then-merged so the existing
  `scoringWeights` / `gateRules` / `aiRegion` keys are not clobbered.
- Failure now returns `{ success: false, reason: 'not_persisted' }` **and** writes
  a `SystemAlert`, instead of being disguised as success.
- `resolveSsoProviderForDomain` now resolves from what an administrator actually
  saved. It previously answered from a hard-coded table of **invented SAML
  endpoints** for İTÜ, METU and Fraunhofer, which ignored every tenant's real
  configuration. That table is removed (it had zero callers). Unknown domains
  fail closed to `ssoEnabled: false` — a password sign-in — rather than being
  redirected to a made-up IdP URL.
- `src/app/[locale]/admin/billing/client.tsx` (SSO section only): the success
  banner now follows what the server reports instead of being set
  unconditionally, with an error state on failure. The form's pre-filled İTÜ
  issuer, ACS URL and placeholder `MIIDdDCCAigCCQ...` certificate are gone — they
  read as a real configuration nobody had entered. Real placeholders replace them.

### (c) Calendar alerts never written — CONFIRMED, fixed
`src/lib/calendar/sync.ts:59` wrote
`systemAlert.create({ severity, type, sourceModule, metadata })`.
`model SystemAlert` has **none** of those columns — it is `level, source,
message, meta`. Every write threw, and because the write sat *inside* the
`catch`, the error escaped the handler that existed to contain it. **No calendar
sync failure was ever recorded.**

- Now routed through `recordAlert()` (`src/lib/observability/system-alert.ts`),
  the module that already owns this table: correct columns, never throws, meta
  sanitised.
- It writes on the **singleton**, not `tx`, on purpose — the caller
  (`src/modules/m9/server/actions.ts:142`) runs this inside a transaction, and an
  alert about a failure must not vanish when that transaction rolls back.
- `tenantId` / `userId` removed from the alert meta. `SystemAlert` has no RLS
  policy (documented in system-alert.ts); the brief and connection ids are the
  tenant-scoped handles a platform admin can join back.
- Also fixed in the same file: `partnerName` is a nullable column, and the title
  template put the literal string **`Meeting: null`** on the user's real calendar.

`src/lib/observability/system-alert.ts` was **not modified** — it was already
correct and is now simply used.

---

## 2. Evidence

### Measurement — one line per symptom, real Prisma client, no database
Prisma validates arguments client-side, before the connection is used. So an
invalid query rejects with `PrismaClientValidationError`, while a valid one gets
as far as the wire. The port used is closed on purpose.

```
BEFORE (the shapes HEAD shipped):
  (a) savedSearch.findMany include:{tenant:true}            -> REJECTED BY SCHEMA
  (b) tenant.update data:{domain}                           -> REJECTED BY SCHEMA
  (c) systemAlert.create {severity,type,sourceModule,meta}  -> REJECTED BY SCHEMA

AFTER (the shapes this task ships):
  (a) savedSearch.findMany SAVED_SEARCH_ALERT_QUERY         -> accepted (reached the wire: PrismaClientKnownRequestError)
  (a) membership.findMany ownerEmailQuery(tenantId)         -> accepted (reached the wire: PrismaClientKnownRequestError)
  (b) tenant.update data:{settings:{sso}}                   -> accepted (reached the wire: PrismaClientKnownRequestError)
  (b) tenant.findFirst settings path [sso,domain]           -> accepted (reached the wire: PrismaClientKnownRequestError)
  (c) systemAlert.create buildAlertRow(...)                 -> accepted (reached the wire: PrismaClientKnownRequestError)
```

The exact validation messages, captured before the fix:

```
(a) Unknown field `tenant` for include statement on model `SavedSearch`.
(b) Unknown argument `domain`. Available options are marked with ?.
(c) Argument `level` is missing.
```

### Each new test proven RED against the code it replaces
A test that has never failed proves nothing, so each was run against `HEAD`.

**(a)** `git show HEAD:...` query restored → `npx vitest run src/lib/inngest`
```
 × accepts the saved-search query — no relation is included
 × selects the tenantId the owner lookup needs, and no relation
AssertionError: expected 'PrismaClientValidationError' not to be 'PrismaClientValidationError'
      Tests  2 failed | 3 passed (5)
```

**(c)** `git show HEAD:src/lib/calendar/sync.ts` → `npx vitest run src/lib/calendar`
```
 × records the failure and does not throw
 × keeps tenant identifiers out of a table that has no RLS policy
 × produces a row the real SystemAlert schema accepts
 × does not put "null" on the calendar for an unnamed partner
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
AssertionError: expected 'Meeting: null' to be 'Meeting'
      Tests  4 failed | 28 passed (32)
```

**(b)** `git show HEAD:src/lib/sso.ts` → `npx vitest run src/lib/sso.test.ts`
```
 × persists the domain into Tenant.settings — a column that exists
 × never writes a `domain` field — Tenant has no such column
 × reports failure instead of a fake success, and raises an alert
 × matches the domain an administrator actually configured
 ... (10 total)
AssertionError: expected { domain: 'itu.edu.tr' } to not have property "domain"
AssertionError: expected true to be false          <- the fake `success: true`
      Tests  10 failed | 5 passed (15)
```

### Gate
```
$ npx vitest run src/lib/inngest src/lib/calendar src/lib/sso.test.ts \
      src/lib/observability tests/billing-iyzico-sso.test.ts
 Test Files  6 passed (6)
      Tests  54 passed (54)

$ npx vitest run          # whole suite
 Test Files  1 failed | 83 passed | 2 skipped (86)
      Tests  4 failed | 936 passed | 8 skipped (948)
 FAIL  tests/m11-partb-editor-buffer.test.tsx   <- NOT MINE, see §4

$ pnpm typecheck
$ tsc --noEmit
(clean — no output, whole working tree)

$ pnpm lint
✖ 82 problems (0 errors, 82 warnings)   <- 0 in my files; all pre-existing warnings elsewhere

$ i18n parity check
tr-only: none   en-only: none   total gap: 0
```

Baseline before the work was `934 passed`; it is now `936 passed` plus the 20 new
assertions in my files, with no test loosened to get there.

---

## 3. Files changed

| File | Change |
|---|---|
| `src/lib/inngest/jobs/alerts-daily.ts` | dropped the phantom `include`, scalar-id owner lookup, single-step loop, `SystemAlert` on failure |
| `src/lib/inngest/jobs/__tests__/alerts-daily.test.ts` | **new** — 5 tests, contract asserted against the real client |
| `src/lib/calendar/sync.ts` | alert routed through `recordAlert` (real columns), tenant ids out of meta, `Meeting: null` fixed |
| `src/lib/calendar/__tests__/sync.test.ts` | rewritten — the old mocked assertion locked in the unwritable shape |
| `src/lib/sso.ts` | persist to `Tenant.settings`, honest failure + alert, real domain resolution, invented IdP table removed |
| `src/lib/sso.test.ts` | **new** — 15 tests incl. Tenant schema contract |
| `src/app/[locale]/admin/billing/client.tsx` | SSO section only: banner follows the server, fabricated defaults removed |
| `tests/billing-iyzico-sso.test.ts` | mock corrected — it echoed back a column that does not exist |
| `messages/tr.json`, `messages/en.json` | 4 new SSO keys, both languages |

**Scope note.** The card listed `billing/client.tsx` for symptom (b), but the root
cause lives in `src/lib/sso.ts` — the client could not be fixed without it, and no
other card owns that file. `src/lib/observability/system-alert.ts` was left
untouched. `src/modules/m8/server/schema-contract.test.ts`,
`src/lib/document-exporter.ts` and `src/modules/m11/*` were not touched.

---

## 4. Defects in other cards' files — reported, NOT fixed

- **`src/modules/m11/ui/PartBCollaborativeEditor.tsx:80-81`** — newly added
  `useTranslations('UserIdentity')` / `useTranslations('PartBEditor')` are not
  wrapped in a `NextIntlClientProvider` by `tests/m11-partb-editor-buffer.test.tsx`,
  so all 4 tests in that file fail with next-intl's "no context was found". The
  file is modified in the working tree by another agent; the test file is
  unmodified at HEAD, so the tree change is what broke it. Left alone.

---

## 5. Risks

- **Behaviour change, deliberate:** `resolveSsoProviderForDomain` no longer
  returns the hard-coded İTÜ / METU / Fraunhofer entries. It has zero callers in
  the repo, so there is no regression path, but any future caller must configure
  domains through the admin screen rather than relying on that table.
- **Not persisted:** the x509 certificate still has nowhere to live. The function
  masks it in the response as before; it is not stored. This is now visible
  rather than hidden, but SAML sign-in cannot actually be completed until a
  column or secret store exists for it. Flagged, not invented.
- `alerts-daily` still reports `matchCount = 0` — the pre-existing `TODO: fetch
  actual new matches since lastRunAt` is untouched and out of this card's scope.
  The job will now genuinely send "no new opportunities" mail to tenant owners on
  the next 08:00 UTC run, where before it sent nothing at all. **Worth a
  deliberate decision before this reaches production.**
- No migration was written and `prisma/schema.prisma` was not touched: every fix
  moves code onto columns that already exist. Nothing to roll back at the DB
  level; reverting the commit fully reverts the behaviour.

## 6. Open questions

1. `alerts-daily` becoming live mail for the first time (see Risks) — should the
   `matchCount` TODO be closed before the cron is allowed to send?
2. Where should the x509 certificate be stored — a new `SsoConfig` table, or a
   secret store outside Postgres? That is a schema decision, not a card-2 fix.

## 7. Next step

Await review. If the mail-sending risk is a concern, the smallest gate is to keep
`RESEND_API_KEY` unset in the target environment — the job already skips the send
and still records `lastRunAt` and alerts.
