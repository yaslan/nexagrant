# TASK-MTS9C907G4YNW — the M10 identity test that could not fail

**Agent:** blok-zincir-dse · **Wave:** S12/5 · **Run:** 2026-09-08
**Scope:** `tests/e2e/m10-audit-identity.spec.ts` only. **No production code was changed.**

---

## 1. Ne yapıldı

### 1.1 The 404 measured first, before anything was touched

The card's claim was that the third test posts a **literal** `Next-Action` id, gets a 404,
and counts that as "protection". Measured — not assumed — against a dev server built from
HEAD `bcf09fb` (probe: `.qa-scratch/probe404.ts`, now deleted; the four cells it posted are
reproduced below):

```
URL: http://localhost:3140/tr/plan-e2e-ultra-ws/opportunities/plan-e2e-ultra-opp/documents
A anonymous + the id the spec pins   : {"status":404,"len":24,"head":"Server action not found."}
B anonymous + a garbage id           : {"status":404,"len":24,"head":"Server action not found."}
C SIGNED-IN + the id the spec pins   : {"status":404,"len":24,"head":"Server action not found."}
D SIGNED-IN + a garbage id           : {"status":404,"len":24,"head":"Server action not found."}
```

Four identical cells. The assertion `status >= 400` cannot separate a refusal from a route
that is not there, so it passed on **nothing**. Baseline suite: `3 passed` — the vacuous
test among them (`evidence/01-baseline-spec.txt`).

The strongest form of that proof came later, with the authorisation guard deliberately
removed from `signDocument` (mutation 2 below still in place):

```
A anonymous + the id the spec pins   : {"status":404,...}   ← old assertion STILL GREEN
```

i.e. the old test stayed green while an anonymous caller could sign other people's
documents (`evidence/05-old-assertion-green-while-guard-removed.txt`).

### 1.2 The test rewritten onto the real flow

TASK-MTS808DKQTOQ9 gave M10 a working path (Onaya Gönder → Finans Onayı → Hukuk Onayı →
`FollowupDoc.signedAt`), so both questions are now measured through real clicks in a real
browser:

| Test | What it now measures |
| --- | --- |
| 1. `the approval record names the session that acted…` | Empty state (no step lit, nobody named) → A submits → **the session is swapped to a second real user B mid-flow** → B signs finance, then legal. The audit trail must read `['A','B','B']` in that order, the finance line must contain B and **not** A, and the completed workflow must have written `signedAt` to the database. |
| 2. `an identity-less visitor never reaches the approval surface` | Unchanged and still real: no session → redirect to `/tr/giris`, approval surface count 0. |
| 3. `an unauthorised write is refused by the action itself — measured on a LIVE action id` | The action id is **harvested at run time** from the POST the browser sends when "Elektronik İmzala" is clicked (and only accepted once that click actually wrote `signedAt`). That live id is then replayed three ways. |

**Why a hard-coded name can no longer pass.** The two display names are minted per run —
`E2E Approver A <base36 timestamp>` / `… B <…>` — and injected only into the session JWT.
A value that did not exist when the code was written cannot come from a default, a constant,
or another user's row. `grep -n "ACTOR_A\|ACTOR_B"` shows every actor assertion goes through
those two variables; the only person-name literal left in the file is the *forbidden* one
(`['Dr.','Mehmet','Yılmaz'].join(' ')`), used in a negative assertion and assembled from
parts so a repo grep for the name still returns 0 live occurrences — the same convention
`tests/fabricated-identity-strings.test.ts` enforces (27 passed).

**Why the 404 can no longer be mistaken for protection** — test 3 asserts, in order:

1. **anonymous** replay of the live id → `expect(status).not.toBe(404)` *and* the target
   row's `signedAt` is still `null`;
2. **cross-tenant** replay (a real session, another tenant's document) → that row stays
   `null` as well;
3. **positive control** — the same id with a valid session → `200` **and** the row really is
   signed. Without this third step, "nothing was written" could just mean the request never
   reached the action. Measured values: anonymous `500` / `signedAt null`, authenticated
   `200` / `signedAt` set.

One trap worth naming: the replays use Playwright's isolated `request` fixture, **not**
`page.request`. `page.request` shares the browser context's cookie jar, so the "anonymous"
call would have carried the session cookie installed two lines earlier and proved the
opposite of what it claims.

### 1.3 Fixture

The second approver (`plan-e2e-ultra-user-b`) is created in this spec's own `beforeAll` and
removed in `afterAll` — deliberately *not* in `scripts/seed-plan-e2e.ts`, which
`module-plan-gate.spec.ts` shares. Database after the run: 0 fixture tenants, 0 user B,
0 memberships, 0 follow-up docs (`evidence/08-db-left-clean.txt`).

---

## 2. Kanıt (kopyalanmış çıktı)

**Test bed.** A `git worktree` of HEAD `bcf09fb` at
`…/scratchpad/wt`, `pnpm install --frozen-lockfile` + `npx prisma generate`, `next dev` on
port **3140** (3000 and 3120 belong to other agents). Specs run from the main repo with
`E2E_PORT=3140`, so **the mutations below were applied to the worktree's copy of the app —
the repository's production files were never edited.**

### 2.1 The rewritten spec, green

```
$ E2E_PORT=3140 pnpm exec playwright test tests/e2e/m10-audit-identity.spec.ts
Running 3 tests using 1 worker
[seed-plan-e2e] ready — ultra=plan-e2e-ultra-ws (ultra) flip=plan-e2e-flip-ws (pro)
  ✓  1 … › the approval record names the session that acted, and each step names its own actor (1.6s)
  ✓  2 … › an identity-less visitor never reaches the approval surface (2.0s)
[seed-plan-e2e] rolled back
  ✓  3 … › an unauthorised write is refused by the action itself — measured on a LIVE action id (1.7s)
  3 passed (6.2s)
```

### 2.2 MUTATION 1 — break the audit writer → RED (mandatory check)

`src/lib/dual-approval.ts` (worktree copy): both `actorName: displayName` sites replaced with
a constant `'Onay Yetkilisi'`.

```
  ✘  1 … › the approval record names the session that acted, and each step names its own actor (11.5s)
  ✓  2 … ✓  3 …

    Error: expect(locator).toContainText(expected) failed
    Locator: getByTestId('approval-audit').locator('li').first()
    Expected substring: "E2E Approver A mtsaeit1"
    Received string:    "08.09.2026 09:27:06 · FINANCE · Onay Yetkilisi — Doküman Çift Onaylı Kurumsal Yetki Akışına Gönderildi"

      196 |     await expect(trail.nth(0)).toContainText(ACTOR_A);
```

Full output: `evidence/03-mutation1-audit-writer-RED.txt`.

### 2.3 MUTATION 2 — remove the session guard from `signDocument` → RED

`src/modules/m10/server/actions.ts` (worktree copy):
`const { tenantId } = await requireTenantAction();` → `const tenantId = 'plan-e2e-ultra-tenant';`

```
  ✓  1 …  ✓  2 …
  ✘  3 … › an unauthorised write is refused by the action itself — measured on a LIVE action id (1.2s)

    Error: an identity-less caller signed a document
    expect(received).toBeNull()
    Received: 2026-09-08T06:27:49.283Z
      321 |       await signedAtOf(targetDoc.id),
    > 323 |     ).toBeNull();
```

And, in the same broken state, the **old** assertion the card is about
(`evidence/05-…`): still 404, still green. That is the false assurance, demonstrated.

Full output: `evidence/04-mutation2-authz-guard-RED.txt`.

### 2.4 Both mutations reverted → green again

```
$ cd <worktree> && git status --porcelain -- src/    # (no output — clean)
$ E2E_PORT=3140 pnpm exec playwright test tests/e2e/m10-audit-identity.spec.ts
  ✓  1 …  ✓  2 …  ✓  3 …
  3 passed (5.4s)
```

`evidence/06-after-revert-GREEN.txt`.

### 2.5 Gates and neighbours

```
$ pnpm typecheck          → tsc --noEmit, no output (clean)
$ pnpm lint               → eslint, no output (clean)
$ pnpm vitest run tests/fabricated-identity-strings.test.ts
  Test Files  1 passed (1)   Tests  27 passed (27)
$ E2E_PORT=3140 pnpm exec playwright test tests/e2e/module-plan-gate.spec.ts   # shares the fixture
  2 passed (6.0s)
$ pnpm tsx .qa-scratch/leftovers.ts
  tenants: 0 · userB: 0 · membershipB: 0 · followupDocs of fixture tenants: 0
```

### 2.6 Screenshots — `docs/agent-results/TASK-MTS9C907G4YNW-screenshots/`

| File | Shows |
| --- | --- |
| `01-idle-nobody-named.png` | nothing in the flow: four idle steps, no name on screen |
| `02-submitted-by-actor-a.png` | after A's real click — audit line 1 carries A's run-unique name |
| `03-finance-signed-by-actor-b.png` | the session swapped mid-flow: line 2 is B's, line 1 still A's |
| `04-completed-trail.png` | completed workflow, trail reads A · B · B, header shows B signed in |
| `05-anonymous-refused.png` | no session → sign-in page, no approval surface |

---

## 3. Değişen dosyalar

| File | Change |
| --- | --- |
| `tests/e2e/m10-audit-identity.spec.ts` | rewritten: real-flow identity test, run-unique actors, live-action-id refusal test |
| `docs/agent-results/TASK-MTS9C907G4YNW-blok-zincir-dse.md` | this report |
| `docs/agent-results/TASK-MTS9C907G4YNW-screenshots/*.png` | 5 frames from the real run |
| `docs/agent-results/TASK-MTS9C907G4YNW-evidence/*.txt` | raw command output for every claim above |

Not changed: any file under `src/`, `scripts/seed-plan-e2e.ts`, any other spec.

---

## 4. Riskler

1. **The intermediate approval state is not durable.** Steps 2–3 live in React state
   (`src/lib/dual-approval.ts` returns plain objects; only `signedAt` is written). The spec
   can therefore assert the audit lines only while the page is open, and the durable check is
   `FollowupDoc.signedAt`. If a future change persists the trail, the spec should also read
   the stored `actorUserId` — the attributable field — back from the database.
2. **Session swap mid-page** is how the second actor is introduced. It is realistic for the
   server (each call carries its own cookie) but not a thing a user does in one tab; if the
   flow ever becomes durable, the second approver should arrive in a second browser context.
3. **Test 3 depends on the sign button's Turkish label** (`Elektronik İmzala`) because that
   row button has no `data-testid`. A copy change breaks the harvest. Adding a test id to
   that button is a one-line production change and was out of scope here.
4. The anonymous replay currently gets `500` in dev. The spec deliberately does **not** pin
   that number (a thrown `TenantScopeError` may surface differently in a production build);
   it pins `not 404` plus the database fact.

---

## 5. Açık sorular / yol üstünde görülen, DÜZELTİLMEYEN kusurlar

1. **`src/lib/dual-approval.ts:230-298` — the approvals subsystem still writes nothing.**
   `createApprovalRequest`, `approveApprovalRequest`, `rejectApprovalRequest` and
   `cancelApprovalRequest` build `{ id: \`req-${Date.now()}\`, … }` objects and return them;
   `model ApprovalRequest` exists in the schema and is never touched. Everything the 4-Eyes
   approvals screen shows through
   `src/app/[locale]/(app)/[workspace]/approvals/actions.ts` disappears on reload. Reported
   by TASK-MTS808DKQTOQ9 as well — still open, still deserves its own task.
2. **`submitForDualApproval` logs the submission as a `FINANCE` approval**
   (`src/lib/dual-approval.ts:104-113`): the first audit line reads
   `FINANCE · <actor> — Doküman … Akışına Gönderildi` although no department has approved
   anything yet. Visible in `04-completed-trail.png`, line 1. Cosmetic in the trail, wrong in
   an audit record.
3. **The row-level "Elektronik İmzala" button bypasses the dual-approval flow entirely** —
   it calls `signDocument` directly, so any member can sign without finance or legal
   sign-off, while the banner next to it presents a four-step mandatory workflow. The e2e
   test uses that path deliberately (it is the only durable write), but as product behaviour
   it makes the workflow optional.
4. **No `data-testid` on that sign button** (see risk 3).
5. **Typecheck errors in another agent's in-flight files.** The pre-commit gate reported,
   as not mine and not blocking:
   ```
   scripts/task-mts9cedcwkqqk-audit.ts(31,39): error TS7006: Parameter 'r' implicitly has an 'any' type.
   scripts/task-mts9cedcwkqqk-audit.ts(43,28): error TS7006: Parameter 'r' implicitly has an 'any' type.
   scripts/task-mts9cedcwkqqk-audit.ts(68,25): error TS2347: Untyped function calls may not accept type arguments.
   scripts/task-mts9cedcwkqqk-sweep-json.ts(13,21): error TS2347: …
   scripts/task-mts9cedcwkqqk-sweep.ts(17,21): error TS2347: …
   ```
   `pnpm typecheck` was clean when I ran it (§2.5); these appeared in the tree afterwards.
   Left for TASK-MTS9CEDCWKQQK's owner — and `any`/implicit-any is a CLAUDE.md violation.

---

6. **A concurrent task is making this very state durable — this spec will need a re-run.**
   While I was writing the report, `src/lib/dual-approval.ts` and `prisma/schema.prisma`
   picked up uncommitted work from **TASK-MTSAIWF4ENUSL**: a `DualApprovalStep` table,
   `PersistedApproval` / `deriveDualApprovalState`, and unique indexes carrying the
   four-eyes rules. That lands *after* every measurement in this report (taken against
   HEAD `bcf09fb`; my commit is `503c7ec`). Once it is committed, this spec must be re-run,
   and risk 1 becomes actionable in the good way: the audit assertions should then read
   `actorUserId` back from the database instead of from the rendered line.

## 6. Sonraki adım

- Decide on open question 1 (persist `ApprovalRequest`) — it is the largest remaining
  fabrication in this area, and once the trail is durable this spec should assert
  `actorUserId` from the database rather than from the rendered line.
- Open question 3 is a product decision (should a lone member be able to sign?), worth a card
  of its own before more tests are written around that button.
