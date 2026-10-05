# TASK-MULQLQIE3ES6G — be-fb: prompts moved to files (CLAUDE.md rule 5) + M9 MeetingBrief.opportunityId (open decision #14)

Sprint FB-GAP-1 · repo FONBRIDGE · branch `dev` · no push.

## 1. What was done

### A) Prompts in files, one loader, locale-aware

- All 14 prompts that were written inline in 8 files now live in their own files: `src/lib/ai/prompts/<module>/<name>.en.ts`. Each file has one template literal and exports it.
  - m6 `esr-parse` + `esr-parse-system`, `evaluation` + `evaluation-system`
  - m7 `ip-checklist` + `-system`
  - m9 `meeting-brief` + `-system`
  - m10 `standard-doc` + `-system`
  - m2 `concept-note-section`, `section-draft-system`, `section-draft-user`
  - rag `retrieved-context`
- **One loader:** `src/lib/ai/prompts/index.ts`.
  - `renderPrompt(id, vars, locale)` fills `{{name}}` placeholders. Each prompt declares its variables, and the variable types are checked against the prompt id.
  - A missing variable throws, and so does an undeclared placeholder. A half-filled prompt is never sent.
  - Values are inserted in a single pass with no `$&` expansion, which is exactly how a template literal behaves.
- **Locale:** `promptLocale()` (`src/lib/ai/prompts/locale.ts`) finds the language from, in order:
  1. the user's UI locale, from the `X-NEXT-INTL-LOCALE` header that next-intl's middleware sets (a server action is a POST to `/<locale>/…`);
  2. the `NEXT_LOCALE` cookie;
  3. the default `tr`.

  If no text exists in that locale, the loader falls back to `en`.

- **Why `.ts` and not `.md`:** the build uses `output: 'standalone'`. A file read at runtime through a computed path is not traced into the bundle, so a `.md` would work in dev and be missing in prod. An import is traced and type-checked. The card allowed either (".md (or a .ts constant)").
- **Behaviour did not change.** Every prompt exists only in `en`, and the text is byte-identical to what it replaced. That includes the language instructions written into some prompts ("Always write in English…", "in Turkish"). So every locale gets the same output today.
- The CLAUDE.md rule 5 line "not met today" was updated to describe the current state.

### B) M9 — `MeetingBrief.opportunityId`

- Schema changes:
  - `opportunityId String?`
  - relation to `Opportunity`, `onDelete: SetNull`. A brief is the user's own text, so it outlives a hard-deleted opportunity and just becomes unlinked.
  - `@@index([tenantId, opportunityId])`
  - back-relation `Opportunity.meetingBriefs`
- New migration `prisma/migrations/add-meeting-brief-opportunity.sql` plus `.down.sql`, appended to the end of `apply-order.txt`.
  - Idempotent: `ADD COLUMN IF NOT EXISTS`, the FK is added only when a constraint with that name is absent, and `CREATE INDEX IF NOT EXISTS`.
  - The names match the SQL Prisma generates (`prisma migrate diff` output), so `db push` followed by this file does not create duplicates.
- **Route:** `/opportunities/[id]/briefs` now reads through `listBriefsForOpportunity` (`src/modules/m9/server/brief-lists.ts`). It returns two lists:
  - the briefs for this opportunity;
  - the tenant's `opportunityId IS NULL` briefs, shown under the heading **"Fırsata bağlı olmayan kayıtlar"** ("Records not linked to an opportunity") with an explanation line. New i18n keys `m9.list.unlinkedHeading` and `m9.list.unlinkedHint` are in both languages.

  Briefs that belong to other opportunities are not read at all.

- **Existing rows stay NULL.** There is no backfill: which opportunity a brief was for was never stored (`callTopic` was the opportunity title and was not saved), so any guess would attach a brief to the wrong page. On the dev DB the table has 0 rows.
- **Tenant safety:** the FK does not check tenants, because constraint checks bypass RLS. `generateMeetingBrief` therefore refuses an `opportunityId` outside the session tenant **before the LLM is called**. The client always passes `opportunityId`. The parameter is optional, so old callers (tests, scripts) still write unlinked rows.
- **RLS:** unchanged. `MeetingBrief` is already in the `tenant_isolation` list in `prisma/rls.sql`, and the new column is not a tenant key.

## 2. Evidence

### Prompts are byte-identical before and after the move

- **Commit 1: `9a669d60`.** It added only `tests/prompt-snapshots.test.ts` and its snapshot.
  - The test runs each of the 14 prompts through its real call site with a mocked `@/lib/llm`, and snapshots the `prompt`, `system` or `messages` that arrive.
  - The snapshot was written against the **old inline code**. The first run printed `Snapshots 8 written`, `Tests 8 passed (8)`.
  - Snapshot sha256: `4ac7f8bd82fb4dadd243f0e1aa01c09df3d868a7e38cc8d7d77ec67412851a54`
- **Commit 2: `3e7bf7ac`.** It moved the prompts. The same test, unchanged, against the same snapshot:
  ```
  Test Files  1 passed (1)
       Tests  8 passed (8)
  $ git diff --quiet HEAD -- tests/__snapshots__/ && echo "snap unchanged vs 9a669d60"
  snap unchanged vs 9a669d60
  ```
  The sha256 was identical, and there was no `Snapshots … written/updated` line.
- Loader contract, `src/lib/ai/prompts/prompts.test.ts`, 21 tests:
  - 14 registry entries equal 14 files;
  - placeholders equal declared variables for each prompt;
  - locale list pinned to `src/i18n/routing.ts`;
  - `tr` falls back to `en`;
  - `$&` and `{{x}}` in values are not expanded;
  - a missing variable throws;
  - `promptLocale` resolves header, then cookie, then default, and uses the default outside a request.

### M9 migration on the shared dev DB (`localhost:5433/fabrika`)

Before:

```
rows [ { total: 0, unlinked: 'no column' } ]   column []   fk []
idx: MeetingBrief_interactionId_key, MeetingBrief_pkey, MeetingBrief_tenantId
rls: relrowsecurity=true relforcerowsecurity=true · policies system_scope, tenant_isolation
```

Applied twice:

```
$ npx prisma db execute --file prisma/migrations/add-meeting-brief-opportunity.sql
Script executed successfully.   run 1 rc=0
Script executed successfully.   run 2 rc=0
```

After:

```
rows [ { total: 0, unlinked: 0 } ]
column [ { column_name: 'opportunityId', is_nullable: 'YES', data_type: 'text' } ]
fk [ { conname: 'MeetingBrief_opportunityId_fkey',
       def: 'FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"(id) ON UPDATE CASCADE ON DELETE SET NULL' } ]
idx: … + MeetingBrief_tenantId_opportunityId_idx
rls: unchanged (true/true · system_scope, tenant_isolation)
```

- **Rollback:** `npx prisma db execute --file prisma/migrations/add-meeting-brief-opportunity.down.sql`. Deploy code without the column first. The down file is idempotent.
- After `pnpm db:generate`, leed-fb (alan-c2) restarted :3000. Their reply: "/tr 200, /tr/kayit 200".

### M9 behaviour: live DB test `tests/m9-brief-opportunity.live.test.ts`, 4/4

It runs over the real `@/lib/db`, with the BYPASSRLS app role asserted:

```
✓ stores the opportunity the brief was generated for
✓ refuses another tenant's opportunity before the model is called or a row is written
✓ lists this opportunity's briefs, and the tenant's unlinked ones separately — nothing else
✓ a hard-deleted opportunity leaves its briefs in place, unlinked (ON DELETE SET NULL)
```

Mutation proof: each test fails when the thing it guards is broken, and passes again once the code is restored.

- Filter changed back to `where: { tenantId }` (the old behaviour): `× lists this opportunity's briefs…`, `1 failed | 3 passed`. After restoring: `4 passed`.
- Ownership check removed (`void opp`): `× refuses another tenant's opportunity…`, `1 failed | 3 passed`. After restoring: `4 passed`.

### Gates (on HEAD `2cc3fdf0`, working tree includes the new files)

```
typecheck rc=0 · lint rc=0 · rls:check rc=0 (47 models, CHECK 4b ok)
i18n-check: ✅ both catalogs agree
scripts/apply-migrations.sh --list → apply-order vs disk rc=0
set -a; source .env; set +a; pnpm test
 Test Files  197 passed | 2 skipped (199)
      Tests  2280 passed | 8 skipped (2288)
```

- **8 skipped:** all are K1 network adapter tests (`tests/adapters.test.ts` ×2, `tests/k1-daily-calls.test.ts` ×4, `tests/sedia-adapter.test.ts` ×2). None are related to this change.
- During the work, typecheck showed `src/lib/agency/cobrand.test.ts:76 TS2532`. That came from fe-fb's `0dde7031` and was fixed in fe-fb's `edfa581e`. I did not touch it.

### Browser E2E: not run

- `playwright.config.ts` has `reuseExistingServer: false`, so `pnpm test:e2e` starts its own `next dev`. The card forbids opening a second next dev.
- :3000 has no demo sign-in either: `/api/auth/providers` lists only google and microsoft-entra-id. So I could not sign in and click through by hand.
- Code-level impact on the existing M9 specs (`m9-briefs-form`, `m9-ics-download`, `m9-brief-persistence`, `m9-brief-generate-failure`):
  - The briefs those specs seed have no `opportunityId`, so they now appear under the "unlinked" heading.
  - The active brief is the first linked one, otherwise the first unlinked one, so the viewer still opens the same brief.
  - The generated brief goes to the top of the linked list.
  - No spec asserts on the list heading text.

  Leed-fb should run `pnpm test:e2e tests/e2e/m9-*` in their own gate run.

## 3. Changed files

- `9a669d60`: `tests/prompt-snapshots.test.ts`, `tests/__snapshots__/prompt-snapshots.test.ts.snap`
- `3e7bf7ac`:
  - `src/lib/ai/prompts/{index.ts,locale.ts,prompts.test.ts}` and 14 `*/*.en.ts` files
  - `src/lib/rag.ts`
  - `src/modules/{m2,m6,m7,m9,m10}/server/actions.ts`
  - `src/modules/m6/server/esr-parser.ts`
  - `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts`
  - `CLAUDE.md` (rule 5 line)
- `2cc3fdf0`:
  - `prisma/schema.prisma`
  - `prisma/migrations/add-meeting-brief-opportunity{.sql,.down.sql}`
  - `prisma/migrations/apply-order.txt`
  - `src/modules/m9/server/{actions.ts,brief-lists.ts}`
  - `src/types/db-rows.ts`
  - `…/opportunities/[id]/briefs/{page.tsx,client.tsx}`
  - `messages/{tr,en}.json` (only the 2 new keys)
  - `docs/DATA_MODEL.md` §8.2
  - `docs/ROADMAP.md` (#14 closed, #19 partly closed)
  - `tests/m9-brief-opportunity.live.test.ts`
- This report.

## 4. Risks

- **`promptLocale()` in production:** the header name is confirmed from the package: `HEADER_LOCALE_NAME = 'X-NEXT-INTL-LOCALE'` in next-intl `shared/constants.js`. Whether the header is present on a real server-action request was **not measured**, because there is no e2e. That has no effect today: with only `en` text, every locale gives the same output.
- **The FK does not check tenants.** The protection is in the action, and it is the only write path. Anyone who adds a new write path must repeat the check. There is a note in the schema comment and in DATA_MODEL.
- **m2 `String(topic?.title)`:** when there is no topic, the prompt still says "undefined (undefined)", exactly as before. This was a byte-for-byte move, not a fix.
- **Old `.replace('{{…}}', str)` quirk:** in `m6/esr-parse` and `m6/evaluation`, a user value containing `$&` or `$'` used to be expanded. It is now inserted as written. The snapshot inputs contain no `$`, so they are unaffected. This is a deliberate small fix, covered by a test in `prompts.test.ts`.

## 5. Open questions

- **ROADMAP #19, still open:** should the language instructions written into the prompts (concept-notes "Always write in English…", m7 "in Turkish", m10's Turkish document type) be taken out and bound to the locale, and should `.tr` variants be written? Either is a change in model behaviour and needs a product decision. The loader is ready for it: adding a `<name>.tr.ts` and registering it in `index.ts` is enough.
- Should the language come from the UI locale (as now) or from `User.locale` / `Tenant.locale` in the DB? The DB option costs one extra query per LLM call. I chose the UI locale.

## 6. Next step

- leed-fb: run the E2E for `tests/e2e/m9-*` in the gate run.
- Product: decide on the prompt-language question (#19 remainder).

## Platform statement

- **Verified on:** mac (Darwin 27.0.0, zsh, Node + vitest 4.1.11, Postgres 16 on localhost:5433).
- **Code paths:** they are platform-independent.
  - The prompt loader uses static `import`s: no file-path handling, no shell, no processes.
  - `promptLocale` only reads HTTP headers and cookies.
  - The migration is plain SQL, applied through `prisma db execute` (no psql needed).
- **Windows/Linux:** not run; no machine was available. Going by the code, I expect the same behaviour, because nothing in this change is platform-specific.
- **Browser E2E:** not run on any platform (reason in §2).
