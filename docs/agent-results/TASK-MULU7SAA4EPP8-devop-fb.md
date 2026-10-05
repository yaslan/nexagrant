# TASK-MULU7SAA4EPP8: FB CI migration (devop-fb)

Sprint FB-GAP-1. TASK-MULS4IW4MZYZO (migration idempotency) was merged into this card. Sources: `TASK-MULT4H6G6LCQG-crw-fb.md` Ö-3 / K-10, `TASK-MULREXNKPS3BF-devop-fb.md` §4.2.

**Summary:** CI now applies the migrations too, and runs them twice. The 16 agency-invite tests really run in CI: [run 36495283061](https://github.com/yaslan/fonbridge/actions/runs/36495283061), and the `Prepare database` and `Test` steps are green. Along the way two more defects surfaced that the card did not list:

- `add-marketplace-order.sql` no longer runs on today's schema.
- The 2 CHECK constraints of `AgencyInviteCode` were never installed in any environment where `db push` ran first.

Both are fixed.

## 1. What was done

1. **Migrations made idempotent** (commit `754aa884`):
   - `add-calendar-connections/migration.sql`: `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. The policy block was already `DROP … IF EXISTS`.
   - `add-feedback.sql`: `COMMENT ON COLUMN "sentryStatus"` now runs inside a DO block, only if the column exists. `rename-feedback-alert-columns.sql` renames this column, which is why the second run failed.
   - `add-m10-dual-approval-persistence/migration.sql`: the FK is added inside `DO $$ … IF NOT EXISTS (pg_constraint …)`.
   - **Extra, `add-marketplace-order.sql`:** `MarketplaceListing` was only ever in schema.prisma and left with ADR-0005, so on today's schema the FK line failed with `relation "MarketplaceListing" does not exist`. The FK is now added only when `to_regclass('"MarketplaceListing"')` exists. There is no net effect, because the next file, `drop-marketplace.sql`, drops the table again. On old databases where the table exists, behaviour is unchanged.
   - **Extra, `add-agency-invite-code.sql`:** the CHECKs `AgencyInviteCode_maxUses_positive` and `AgencyInviteCode_usedCount_bounds` were defined inline in `CREATE TABLE IF NOT EXISTS`. When `db push` builds the table first (CI, a README setup), that statement is skipped and **the CHECKs never landed**. They are now separate guarded `ALTER TABLE … ADD CONSTRAINT` statements. This is the "second line" behind `redeem_agency_invite`: it caps the counter at the limit even when someone writes around the function.
2. **`scripts/apply-migrations.sh`** (commit `22c4d508`): applies every forward migration with `psql -X -q -v ON_ERROR_STOP=1 -f`, in the order given in `prisma/migrations/apply-order.txt`.
   - **Ordering rule:** neither README nor RELEASE_CHECKLIST defines one (the checklist only says "sırayla koşulabilir"). I set it and documented it: the order in which each file first reached the repo (`git log --diff-filter=A --format=%aI -- <file> | tail -1`). That is the order the files were written against. Dependencies I checked hold: add-feedback → rename-feedback-alert-columns, add-invoice → write-path → fx-rate, add-marketplace-order → drop-marketplace.
   - The order lives in a list rather than being computed from git, because CI does a shallow checkout (`fetch-depth: 1`) and has no git history.
   - A new migration goes at the **end** of the list, in the same commit. If the list and the files on disk disagree, the script applies **nothing** and exits 1, naming the difference. `--list` only prints the order.
   - It strips Prisma's `?schema=` parameter from the URL, because psql rejects it.
   - It **does not replace** `db push`: the migrations do not create the base tables. On an empty DB, running the script alone fails at file 1 with `relation "Evaluation" does not exist` (evidence 2.1).
   - A row was added to the `scripts/README.md` table.
3. **ci.yml "Prepare database"** now runs: `db push` → `db:rls-role` → `psql --version` → `apply-migrations.sh` → `apply-migrations.sh` → `db:rls` → `db:seed`.
   - Why after `db:rls-role`: the migrations' `GRANT … TO fabrika_app` blocks only run if the role exists.
   - Why before `db:rls`: rls.sql re-creates the `system_scope` policies that `redeem_agency_invite` relies on.
   - Why two runs: production also applies these files again (RELEASE_CHECKLIST §1). The second run is the idempotency gate, and either run failing fails the job.
   - The rationale is written as a comment in the yml.
4. **`tests/agency-invite.live.test.ts`** (commit `9869650f`):
   - The "function missing" branch now goes through `skipOrFailInCi` and sits outside the try block, so in CI it fails under its own message instead of a misleading "database unavailable" prefix.
   - K-10: all 16 `if (!ready) return expect(skipReason).toBeTruthy()` lines were removed. A single `beforeEach((ctx) => { if (!ready) ctx.skip(skipReason) })` replaces them, so locally the result reads **16 skipped**, not "passed".
5. **Schema drift** was measured with `prisma migrate diff` (§4). Nothing was fixed there.

## 2. Evidence

Environment: a temporary `pgvector/pgvector:pg16` container of my own (`devopfb-mig-u7s`, port 55439) and a clean clone in scratchpad. The shared `fabrika-postgres` and the `:3000` server were not touched. psql is not installed on this Mac, so a local shim runs psql 16.15 from the same image (`docker run … psql`). In CI, the psql that ships with `ubuntu-latest` runs.

### 2.1 The script on an empty DB, and twice after the CI sequence

```
## A: script alone on an empty DB (without db push)
==> [1/24] add-m6-evaluator-lens.sql
psql:prisma/migrations/add-m6-evaluator-lens.sql:23: ERROR:  relation "Evaluation" does not exist
exit=3                                   ← why db push has to come first

## Empty DB + no fabrika_app role; ci.yml "Prepare database" run block extracted from YAML and run with bash -e
pnpm exec prisma db push / pnpm db:rls-role / psql --version /
scripts/apply-migrations.sh / scripts/apply-migrations.sh / pnpm db:rls / pnpm db:seed
prepare exit=0
🚀  Your database is now in sync with your Prisma schema.
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
psql (PostgreSQL) 16.15
==> [1/24] add-m6-evaluator-lens.sql … ==> [24/24] drop-marketplace.sql
apply-migrations: 24 files applied       ← run 1, 0 ERROR
==> [1/24] add-m6-evaluator-lens.sql … ==> [24/24] drop-marketplace.sql
apply-migrations: 24 files applied       ← run 2, 0 ERROR
✅ prisma/rls.sql applied. Policies in public: 27 → 112
Seeding completed with E10 data.
```

Before the fix (HEAD `1fd89006`, same sequence): run 1 exited 3 at `add-marketplace-order.sql:54: ERROR: relation "MarketplaceListing" does not exist`.

On be-fb's `9b373fb4` (it added `fix-agency-invite-rejection-audit.sql` to the end of the list), the same run from an empty DB gave:

```
==> [25/25] fix-agency-invite-rejection-audit.sql
apply-migrations: 25 files applied      ← run 1
==> [25/25] fix-agency-invite-rejection-audit.sql
apply-migrations: 25 files applied      ← run 2
Tests  16 passed (16)                   ← agency-invite, CI=true
```

be-fb's K-6 commit `9b373fb4` (the new `fix-agency-invite-rejection-audit.sql`, added to the end of `apply-order.txt`) is local and unpushed right now. This report is pushed on top of it, and that push's CI run is written in §2.5.

### 2.2 What now exists in the DB (after db push + migrations)

```
CHECK: AgencyInviteCode_maxUses_positive, AgencyInviteCode_usedCount_bounds, Criterion_weight_check,
       Invoice_fx_required_for_foreign_currency, Reviewer_role_check, Reviewer_status_check,
       Score_score_check, Subscription_price_lock_complete
functions: note_agency_invite_rejection, redeem_agency_invite (+ lifetime_licence_count)
```

A DB that only had `db push` had **none** of these CHECKs and neither agency function.

### 2.3 Test: three scenarios

```
### S1 full DB, CI=true (verbose): 16 × ✓, each test name listed
 Test Files  1 passed (1)      Tests  16 passed (16)
### S2 function DROPped, locally (CI unset)
 Test Files  1 passed (1)      Tests  16 skipped (16)      ← K-10: no longer "passed"
### S3 function DROPped, CI=true
Error: agency-invite.live: refusing to skip in CI — add-agency-invite-code.sql is not applied (scripts/apply-migrations.sh). …
 Test Files  1 failed (1)                                   ← Ö-3: no more false green in CI
```

Full gate locally (origin/dev `6d1df9e1` + my changes, DB prepared as in 2.1, `CI=true`):

```
lint=0  typecheck=0  test=0
 Test Files  175 passed | 2 skipped (177)
      Tests  2014 passed | 8 skipped (2022)
```

The 8 skipped tests are in `adapters.test.ts` (2), `k1-daily-calls.test.ts` (4) and `sedia-adapter.test.ts` (2), which need an external network or key. Not related to this work.

### 2.4 CI

- Push: `6d1df9e1..9869650f dev -> dev` (my 3 commits plus the local team commits that were waiting on top of them).
- Run: **https://github.com/yaslan/fonbridge/actions/runs/36495283061** (head `9869650f`).

```
Validate Prisma schema | success
Generate Prisma client | success
Prepare database       | success
Lint                   | success
Typecheck              | success
Test                   | success
E2E Test               | failure (7 failed · 168 passed · 2 did not run; se-fb's area, see below)
```

Log excerpt:

```
psql (PostgreSQL) 16.15 (Ubuntu 16.15-1.pgdg24.04+2)
==> [1/24] add-m6-evaluator-lens.sql … ==> [24/24] drop-marketplace.sql
apply-migrations: 24 files applied            ← run 1
apply-migrations: 24 files applied            ← run 2
✅ prisma/rls.sql applied. Policies in public: 27 → 112
Seeding completed with E10 data.
[Test]  ✓ tests/agency-invite.live.test.ts (16 tests) 2033ms
[Test]  Test Files  176 passed | 2 skipped (178)
[Test]       Tests  2029 passed | 8 skipped (2037)
```

E2E comparison (`gh run view --log`, list of failing tests):

| Run                                                                                     | Head                 | E2E                       | Failing                                                                                                                                            |
| --------------------------------------------------------------------------------------- | -------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [36491973080](https://github.com/yaslan/fonbridge/actions/runs/36491973080) (before)    | `6d1df9e1`           | 6 failed · 169 passed     | auth ×2, evidence-fabrication, evidence-unverified-badge, **invoice-foreign-currency-export:230**, m8-matching                                     |
| [36495283061](https://github.com/yaslan/fonbridge/actions/runs/36495283061) (this card) | `9869650f`           | 7 failed · 168 passed     | evidence ×2, m8-matching (pre-existing), identity-strings:116 (click timeout), plan-storefront ×3 (`waitForLoadState('networkidle')` 60 s timeout) |
| [36495597483](https://github.com/yaslan/fonbridge/actions/runs/36495597483)             | `47c7a821` (+ se-fb) | **1 failed · 176 passed** | identity-strings:116 only                                                                                                                          |

- `invoice-foreign-currency-export.spec.ts:230 › the database itself refuses a foreign-currency invoice with no rate` was ✘ before; in this run it is **✓ (154 ms)**. The CHECK constraint now comes from the migration.
- None of the new failures in this run is a DB or constraint error. The plan-storefront ones are `networkidle` timeouts, and on the next run (se-fb's networkidle→hydration commit on top of mine) they pass. The auth ×2 failures went away with be-fb's `f7a36779`. The one remaining `identity-strings:116` is a UI click timeout and belongs to se-fb/be-fb.

### 2.5 CI after be-fb's migration

<<RUN2>>

## 3. Changed files

- `prisma/migrations/add-calendar-connections/migration.sql`
- `prisma/migrations/add-feedback.sql`
- `prisma/migrations/add-m10-dual-approval-persistence/migration.sql`
- `prisma/migrations/add-marketplace-order.sql`
- `prisma/migrations/add-agency-invite-code.sql`
- `prisma/migrations/apply-order.txt` (new)
- `scripts/apply-migrations.sh` (new, 100755)
- `scripts/README.md`
- `.github/workflows/ci.yml`
- `tests/agency-invite.live.test.ts`
- `docs/agent-results/TASK-MULU7SAA4EPP8-devop-fb.md` (this report)

Commits: `754aa884`, `22c4d508`, `9869650f` (after rebase). Each was made with `git commit -- <paths>`, and `git show --stat` confirmed that only my paths went in. `src/` and `tests/e2e` were not touched.

## 4. Schema drift (migrations ↔ schema.prisma), listed only, **not fixed**

Method: there is no baseline migration that creates the base tables, so "a DB built only from migrations" cannot exist. I measured two layers instead.

- **(a)** The CI DB (push + migrations) → `schema.prisma`.
- **(b)** A second DB, where after push I dropped (CASCADE) the 16 tables that some migration creates itself, so those tables were built by the migrations. Then `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`.

(b) is the closer model of production, because production built these tables from the migrations.

| #   | Where                   | Drift (migration version → schema.prisma)                                                                                                                                         | Layer | Effect                                                                                                                                                                                                                                                       |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-1 | `MeetingBrief`          | The migration adds an extra index `MeetingBrief_tenantId` that is not in the schema                                                                                               | a, b  | Harmless. The next `db push`/`migrate` would drop it.                                                                                                                                                                                                        |
| D-2 | `CalendarConnection`    | `tokenExpiresAt`, `lastSyncAt`, `createdAt`, `updatedAt`: `TIMESTAMP` (µs) vs `TIMESTAMP(3)`                                                                                      | b     | Precision difference. Prisma does not notice.                                                                                                                                                                                                                |
| D-3 | `CalendarConnection`    | `updatedAt` has a DB default of `now()`; the schema has none (`@updatedAt`)                                                                                                       | b     | Same family as 4.1, the other way round: inserts without a value succeed in production but fail on a pushed DB.                                                                                                                                              |
| D-4 | `CalendarConnection`    | Index names `CalendarConnection_tenantId`/`_userId` vs `…_tenantId_idx`/`…_userId_idx`                                                                                            | a, b  | Name difference. After a push, `IF NOT EXISTS` does not match on name, so in (a) there are **2 duplicate indexes** (`pg_indexes`: `…_tenantId` + `…_tenantId_idx`, `…_userId` + `…_userId_idx`). `migrate diff` does not report this. Harmless but wasteful. |
| D-5 | `Feedback`              | `updatedAt` DB default `now()`; not in the schema                                                                                                                                 | b     | Like D-3                                                                                                                                                                                                                                                     |
| D-6 | `TenantBillingIdentity` | `updatedAt` DB default `now()`; not in the schema                                                                                                                                 | b     | Like D-3                                                                                                                                                                                                                                                     |
| D-7 | `PlanVersion`           | `modules` default `'[]'` (`List([])`) in the schema; none in the migration                                                                                                        | b     | An insert without `modules` fails in production.                                                                                                                                                                                                             |
| D-8 | Plan FKs                | `PlanVersion_planId`, `PlanFeature_planVersionId`, `PlanAssignment_planId`, `PlanAssignment_tenantId` and `Subscription_planVersionId`: `ON UPDATE CASCADE` missing in migrations | b     | An id update on the parent table fails in production (NO ACTION). Ids are cuid and not updated, so low risk.                                                                                                                                                 |

Objects that exist **only in migrations** and that Prisma cannot express, **by design**: the CHECKs in 2.2, the functions `redeem_agency_invite`, `note_agency_invite_rejection` and `lifetime_licence_count`, and the per-file `tenant_isolation` policies. They reach CI now through this card.

Note on the (b) method: `DROP … CASCADE` also dropped the FK `Subscription_planVersionId_fkey`. The migration re-created it, and D-8 shows its `ON UPDATE` difference.

## 5. Risks

- **Running `apply-migrations.sh` against production also applies `drop-marketplace.sql`.** It is destructive, and the K-11 row-count guard (crw-fb) has not been added yet. The script is designed for CI and new environments. Before anyone runs it against production, K-11 has to be closed or `drop-marketplace` applied deliberately and on its own. The RELEASE_CHECKLIST §1 flow ("12 files, by hand") has not changed; the checklist is out of scope for this card.
- `docs/RELEASE_CHECKLIST.md` §1 still says "12 files" (it is 25 today) and does not mention the script. That is a docs update and outside this card's scope; I suggest a follow-up card.
- I edited existing migration files (additive guards only). No DB where they already ran changes behaviour: every change is a no-op when the object exists, or a `to_regclass` condition.
- The CI job got 2 × 24 psql calls longer: a few seconds in total.

## 6. Open questions / notes

- **invoice-foreign-currency-export e2e:** the diagnosis on the card is correct. `tests/e2e/invoice-foreign-currency-export.spec.ts:252` expects `rejects.toThrow(/Invoice_fx_required_for_foreign_currency/)`. That CHECK comes only from `add-invoice-fx-rate.sql` and was **missing** on the DB that only had `db push`. It exists in the CI DB now. Direct proof, inside a transaction that is rolled back:
  ```
  INSERT INTO "Invoice" (…, currency) VALUES (…, 'EUR')   -- no fxRate
  ERROR:  new row for relation "Invoice" violates check constraint "Invoice_fx_required_for_foreign_currency"
  ```
  So this e2e should now turn green in CI. I did not touch E2E (it is se-fb's area); the result is in the E2E step of the run above.
- Should the D-2…D-8 drift be fixed by writing new migrations, or by aligning schema.prisma? Owner: be-fb.

## 7. Next step

1. se-fb: check whether the invoice-foreign-currency-export result in the E2E step of this run has turned green.
2. be-fb: fix drift D-3, D-5, D-6 and D-7 (differences in defaults can break production writes).
3. Follow-up card: update RELEASE_CHECKLIST §1 to the script and apply-order.txt, and close K-11 first.

## Platform statement

Verified on **macOS** (Darwin 27.0.0, Node 26.5, pnpm 11.25, Docker `pgvector/pgvector:pg16`, psql 16.15 through the container) and in **GitHub Actions ubuntu-latest (Linux)** (the run above).

- `apply-migrations.sh` is bash. It is written to be compatible with macOS bash 3.2 (the non-empty array under `set -u`, process substitution `<(…)`) and GNU bash on Linux. It needs `psql` on PATH, or an alternative binary via `PSQL=…`.
- **Windows was not run:** there is no Windows machine here. From the code, it will not run under native cmd/PowerShell (a bash script). It runs under Git Bash or WSL if psql is present. CI has no Windows job, so the CI path is unaffected.
- The migration SQL and the test change are platform-independent.
