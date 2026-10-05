# TASK-MTS808DKQTOQ9 — the M10 dual-approval banner

**Agent:** blok-zincir-denet-i · **Wave:** S12/4 · **Run:** 2026-09-08

## 1. The card's claim, measured first

> "Çift onay banner'ı (client.tsx:178-213) hiçbir doküman durumuna bağlı değil ve
> `submitDualApprovalAction`/`departmentApproveAction` (m10/server/actions.ts:210,216)
> repoda hiç çağrılmıyor."

```
$ grep -rn "submitDualApprovalAction\|departmentApproveAction" --include="*.ts" --include="*.tsx" src/ tests/
src/modules/m10/server/actions.ts:210:export async function submitDualApprovalAction(docId: string) {
src/modules/m10/server/actions.ts:216:export async function departmentApproveAction(
tests/m10-dual-approval-action.test.ts:27,57,61,72,82,88,92,95,98,106,109
tests/e2e/m10-audit-identity.spec.ts:10  (a comment, not a call)
```

**Verdict: the claim holds, with one correction.** Both actions had no caller in any
production code path — no component, no route, no other server module. They were not
"never called in the repo": `tests/m10-dual-approval-action.test.ts` exercises both.
So the accurate statement is *dead production code with live unit tests behind it*.

The banner half of the claim is exactly right. Lines 178-213 were four hard-coded
coloured boxes. No prop, no state, no query fed them; they rendered "2. Finans Onayı" /
"3. Hukuk Onayı" for every tenant on every visit, including a tenant with zero
documents and zero approvals.

## 2. What was done — bound, not removed

The card allowed either. Binding was possible for three of the four steps and for the
outcome, so the banner stayed and became real:

| Before | After |
| --- | --- |
| Four static boxes, always the same | Each step renders `done` / `active` / `idle` from the state the actions return |
| No entry point | "Onaya Gönder" on each unsigned document row → `submitDualApprovalAction(docId)` |
| No way to advance | "Finans Onayı Ver" / "Hukuk Onayı Ver" → `departmentApproveAction(state, dept)` |
| Nothing shown when idle | "Şu anda onay akışında doküman yok" and no step lit |
| No record on screen | The real audit trail — timestamp · department · the actor the session carried |
| Nothing persisted | The legal step calls `signDocument`, so step 4 means the row really is signed |

**The honest limit, stated in the UI itself.** No table stores a `DualApprovalState` —
`FollowupDoc` carries only `signedAt`, and `ApprovalRequest` is not wired to this flow
(see §5). Steps 2 and 3 therefore live in the session until the signature is written.
The banner says that in as many words rather than implying a durability that does not
exist. Making the intermediate steps durable needs a schema change, which is outside
this task's file list.

## 3. i18n

Every user-visible string in `client.tsx` moved to `t('m10.…')` — not only the ten lines
the card named, because the evidence bar was "the screen is in English", and ten of
forty strings does not clear it. 58 keys, identical key sets in both locales:

```
$ python3 -c "…flatten m10 in both files…"
tr-only: []   en-only: []   keys: 58
```

The two `toLocaleDateString('tr-TR')` calls now format in the reader's locale.

## 4. Evidence — produced in this run

Dev server: a `git worktree` at commit `0e2149a` on **port 3131** (a shared tree cannot
host a second `next dev`; 3000 and 3120 belong to other agents). Driver:
`scratchpad/drive.ts`, seeding two `FollowupDoc` rows and lifting `demo-tenant` to the
`ultra` plan (M10 is `ultra`-only), and removing both again at the end.

```
[seed] plan pro -> ultra; docs cmts9jepo0000x6xkcrvwak9t, cmts9jepr0001x6xkjoz1bk4m
[01] stage=NONE                       steps=["idle","idle","idle","idle"]
     idle text: Şu anda onay akışında doküman yok. …
[02] stage=PENDING_FINANCE_APPROVAL   steps=["done","active","idle","idle"]
     subject: Akıştaki doküman: NDA (Gizlilik Anlaşması) v1 — akışa alan: Alice
     audit:   08.09.2026 09:02:54 · FINANCE · Alice — Doküman … Akışına Gönderildi
[03] stage=PENDING_LEGAL_APPROVAL     steps=["done","done","active","idle"]
[04] stage=APPROVED_AND_SIGNED        steps=["done","done","done","done"]
     audit:   … · LEGAL · Alice — LEGAL Departmanı Onayı Verildi
[db]  FollowupDoc cmts9jepo…  signedAt=2026-09-08T06:02:54.299Z
[05] after reload stage=NONE; submit button for the signed doc: 0
[06] EN leftovers with Turkish letters (TÜBİTAK excluded):
     ["Opportunity: District renovation pilot — İzmir"]   ← the tenant's own data
[07] EN stage=PENDING_FINANCE_APPROVAL steps=["done","active","idle","idle"]
[cleanup] docs deleted; plan back to pro
```

Screenshots in `TASK-MTS808DKQTOQ9-screenshots/`:

| File | Shows |
| --- | --- |
| `01-tr-no-document-in-flow.png` | nothing in the flow → no step lit |
| `02-tr-stage2-finance-pending.png` | after one real click: step 1 done, step 2 next |
| `03-tr-stage3-legal-pending.png` | finance signed off; audit line names Alice |
| `04-tr-stage4-signed.png` | workflow complete, all four done |
| `05-tr-after-reload-signature-persists.png` | reload: the row still reads "İmzalandı" |
| `06-en-screen-in-english.png` | the same screen in English |
| `07-en-stage2-finance-pending.png` | the flow advancing in English |

Gate on the committed tree: `pnpm lint` clean, `pnpm typecheck` clean,
`pnpm test` → **100 passed | 2 skipped (102 files), 1145 passed | 8 skipped (1153)**.
No test was loosened or skipped.

`tests/e2e/m10-audit-identity.spec.ts` asserts the banner heading text; the Turkish
string is byte-identical to the one it looked for, so that spec keeps passing.

## 5. Defects found on the way — reported, not fixed

1. **`src/lib/dual-approval.ts:210-260` — the approvals subsystem writes nothing.**
   `createApprovalRequest`, `approveApprovalRequest`, `rejectApprovalRequest` and
   `cancelApprovalRequest` build a plain object with `id: \`req-${Date.now()}\`` and
   return it. Prisma is never touched, although `model ApprovalRequest`
   (`prisma/schema.prisma:1228`) exists for exactly this. Everything the 4-Eyes
   approvals screen shows through
   `src/app/[locale]/(app)/[workspace]/approvals/actions.ts` is therefore a fabricated
   record that disappears on reload. This is the same class of defect as this card and
   is larger; it deserves its own task.

2. **`src/lib/dual-approval.ts:96-106` — the submission is logged as a finance
   approval.** `submitForDualApproval` writes its first audit line with
   `department: 'FINANCE', action: 'APPROVED'` for the act of *submitting*. The
   screenshot at step 03 shows the consequence: two "FINANCE" lines, one of which is
   nobody's approval. An audit trail should not record an approval that did not happen.

3. **`src/modules/m10/server/actions.ts:216` — `departmentApproveAction` takes the
   whole prior state from the client.** The actor is server-derived, so no one can sign
   under another name, but `docId` and `stage` arrive from the browser. Harmless while
   nothing persists; it must not stay that way once defect 1 is fixed.

4. **`src/modules/m10/server/actions.ts:110,175` — `contentUrl` is a made-up URL.**
   Every document row links to `https://storage.fabrika.app/docs/…`, a host that stores
   nothing. Not touched here.

## 6. Note on the shared tree

`messages/tr.json` and `messages/en.json` carry my `m10` namespace, but they were swept
into commit `37202a5` ("fix(m11): …") by another agent's broad `git add` before this
session resumed. Nothing of mine was lost and nothing of theirs was disturbed; the keys
are in `main` history under someone else's commit message. My own commits
(`144a47b`, `0e2149a`) touch `client.tsx` only.
