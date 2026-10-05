# TASK-MTRH86RCGVEGC — Evidence module: fabricated accreditation (pass 2)

**Agent:** geli-tirici · **Date:** 2026-09-07 · **Branch:** dev
**Commits:** `eb537c1` (this pass) · `583d440` + content carried in `8c459d6` (pass 1)

---

## Summary

The evidence module made two different unbacked claims. Both are now gone.

1. **Invented certificate metadata** — fixed in pass 1, re-verified today by grep and a
   passing browser test.
2. **A green "verified/valid" badge on documents nothing had verified** — still live at
   the start of this pass. Found, filmed, fixed, and pinned with unit tests.

`pnpm gate` is green end to end.

---

## (a) Audit — every point that produced fabricated accreditation

Command from the card:

```
$ grep -rn "TÜRKAK\|TSE\|doğrulan\|verified\|accreditation" src/modules/m3 src/app
src/app/[locale]/page.tsx:632:                : 'Accelerate proposal writing timelines ... with verified CORDIS network data ...'
src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:618:              { title: 'Part A İdari Kurum Formları', desc: 'Tüm konsorsiyum ortaklarının PIC numaraları ve finansal temsilcileri doğrulandı.', status: true },
src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx:142:            was the only one of the two claiming it had been verified. */}
src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx:592:                    placeholder="TÜRKAK / İTO / BSI"
src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx:738:                     information security and EU data protection are verified" — with a
src/app/[locale]/(app)/[workspace]/marketplace/client.tsx:24:  verifiedReviewer?: boolean;
src/app/[locale]/(app)/[workspace]/marketplace/client.tsx:103:        verifiedReviewer: kind === 'consultancy',
src/app/[locale]/(app)/[workspace]/tto/client.tsx:425:                Bileşenlerin laboratuvarda ve ilgili sanayi ortamında doğrulanması. ...
src/app/api/webhooks/iyzico/route.ts:13: * touches the database until the `x-iyz-signature-v3` header has been verified
```

`src/modules/m3/` contains only `manifest.ts` — no fabrication there. The evidence
module's real code lives in `src/app/[locale]/(app)/[workspace]/evidence/`,
`src/components/evidence/`, `src/lib/evidence-ai.ts`, `src/lib/evidence-health.ts`.

### Inside my scope

| # | File:line | What it fabricated | State |
|---|---|---|---|
| 1 | `src/lib/evidence-ai.ts` (whole `extractEvidenceMetadata`) | Fixed certificate body, a named accreditation body, a fixed certificate number, `Math.random()` document number, dates off the clock, a "doğrulanmış" tag, 2 source-less claims | **Fixed, pass 1** |
| 2 | `evidence/actions.ts` | Persisted all of the above; mirrored the claims into `Claim` rows at `confidenceScore: 0.95` | **Fixed, pass 1** |
| 3 | `evidence-client.tsx` drawer | `\|\| 'TSE / Akredite Kurul'`, `\|\| 'DOC-992182'` placeholders rendered as real values | **Fixed, pass 1** |
| 4 | `evidence-client.tsx` claims panel | One hard-coded green ✓ per document: "…kurumsal bilgi güvenliği ve AB veri koruması doğrulanmıştır." | **Fixed, pass 1** |
| 5 | `components/evidence/EvidenceDrawer.tsx` | 3 hard-coded "evidence" citations (invented ISO number, a 15% grid-loss result, "verified SME status"), each with a one-click **Insert Claim** into a concept note; also the DB-failure fallback | **Fixed, pass 1** |
| 6 | `evidence-client.tsx:140` badge | TR label "Doğrulanmış Geçerli" vs EN "Valid" — only TR claimed verification | **Fixed, pass 1** |
| 7 | `evidence/actions.ts:118` | `status: 'VALID'` hard-coded on every upload | **Fixed, this pass** |
| 8 | `evidence-client.tsx` `getStatusBadge()` | Badge computed from `validUntil` only; `UNVERIFIED`/`REJECTED` fell through to the green tick | **Fixed, this pass** |
| 9 | `src/lib/evidence-health.ts` | Counted by expiry only, so unverified docs fed "1 Geçerli Belge" and the 0–100 readiness score | **Fixed, this pass** |
| 10 | `evidence-client.tsx:243` CSV export | `${i.status \|\| 'VALID'}` — a missing status exported as VALID | **Fixed, this pass** |

Remaining hits are **not** fabrication: lines 142/738 are my own explanatory comments,
and line 592 is an `<input placeholder>` — a typing hint on an empty field the user
fills in, not a stored or asserted value.

Out-of-scope hits are reported under **Open questions**, not touched.

---

## (b) The fake badge, filmed in a real browser

`Evidence.status` is a real verification column. The schema
(`prisma/schema.prisma`) documents it as:

```
status  String  @default("VALID")  // UNVERIFIED | VALID | EXPIRING_SOON | EXPIRED | REJECTED
```

Nothing read it. I seeded one row whose status column literally says `UNVERIFIED`, and
uploaded a second file through the real form, in a real browser, signed in as
`owner@demo.fabrika.test`.

**BEFORE — `badge-before/03-fresh-upload.png`:** both cards carry the green ✓
**"Geçerli"** badge — the row marked `UNVERIFIED`, and a file uploaded seconds earlier
that nobody had checked. The header read **"1 Geçerli Belge"**, score **60/100**.

Before-run output:

```
✘  1 … a document nothing has verified is not shown as verified (11.8s)
✘  2 … a fresh upload is recorded as unverified, not valid (2.2s)
```

---

## (c) The fix

**`src/lib/evidence-status.ts` (new)** — one pure `evidenceBadge()` rule:

- Only `VALID` and `EXPIRING_SOON` count as verified.
- A missing, empty or unrecognised status falls to `UNVERIFIED` — never to verified.
  "We do not know" has to fall to the safe side; that default *was* the bug.
- Expiry outranks verification state (an expired certificate is expired either way).
- `REJECTED` is reported as a refusal, not folded into "unverified".
- The expiry warning is not offered as a substitute for verification: an unverified
  document near its expiry stays `UNVERIFIED`, because "10 days left" would imply the
  certificate behind it had been accepted.

The list badge **and** the health score both call it, so the header cannot say "1 valid
document" about a row the list badges as unverified.

`actions.ts` now records `status: 'UNVERIFIED'` on upload — an upload is not a
verification — and the CSV export no longer defaults a missing status to `VALID`.

The green badge is reachable **only** through the real `status` column, i.e. only when a
verification field actually says so, exactly as the card required.

---

## (d) After

**AFTER — `badge-after/02-unverified-row.png` and `badge-after/03-fresh-upload.png`:**
the same view; both cards now carry a neutral grey **"Doğrulanmamış"** badge, and the
header reads **"0 Geçerli Belge"**.

```
Running 2 tests using 1 worker
  ✓  1 … a document nothing has verified is not shown as verified (1.3s)
  ✓  2 … a fresh upload is recorded as unverified, not valid (2.0s)
  2 passed (4.1s)
```

The pass-1 regression spec also still passes against today's build:

```
  ✓  1 … an upload with no readable metadata does not gain invented metadata (3.3s)
  1 passed (4.1s)
```

Grep gate from pass 1, re-run today:

```
$ grep -n "Math.random\|ISO-27001-2025-9921\|TÜRKAK" src/lib/evidence-ai.ts
grep exit=1   (no match)
```

### Frames (all captured 2026-09-07)

| Path | Shows |
|---|---|
| `badge-before/03-fresh-upload.png` | green ✓ "Geçerli" on two unverified documents; "1 Geçerli Belge" |
| `badge-after/02-unverified-row.png` | grey "Doğrulanmamış"; "0 Geçerli Belge" |
| `badge-after/03-fresh-upload.png` | both documents "Doğrulanmamış" |
| `before/04-detail-drawer.png` | pass-1 fabrication: invented issuer, `DOC-209763`, a full fake ISO 27001 text, green ✓ compliance claim |
| `04-detail-drawer.png` | pass-1 after: honest empty states |

---

## (e) Unit test — the required one

`tests/evidence-status.test.ts`, 14 tests. The one the card names:

```ts
it('does not print a valid badge for an unverified document', () => {
  // A long expiry date is not evidence that anyone checked the file.
  expect(evidenceBadge({ status: 'UNVERIFIED', validUntil: IN_A_YEAR }, NOW))
    .toEqual({ kind: 'UNVERIFIED' });
});
```

plus: no valid badge with no expiry and no verification; a missing/null/empty status is
unverified; an unrecognised status is unverified; a refusal reads as a refusal; the
green badge only for a verified document; the expiry warning is not a substitute for
verification; expiry still reported for unverified documents; an unparseable date is
ignored rather than read as expired; and three `calculateEvidenceHealthScore` tests
(an unverified document does not count towards `validCount`, a verified one does, and an
unverified library scores below the same library once verified).

---

## `pnpm gate`

```
$ pnpm lint && pnpm typecheck && pnpm test && pnpm rls:check && pnpm rls:verify

✖ 84 problems (0 errors, 84 warnings)      ← 0 errors; warnings pre-existing, not mine

$ tsc --noEmit                              ← clean

 Test Files  73 passed | 2 skipped (75)
      Tests  779 passed | 8 skipped (787)   ← was 765; +14 from this task

$ tsx scripts/check-rls.ts
✅ SUCCESS: All 40 tenant-scoped models have RLS policies registered.

$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 40 · RLS açık tablo: 43 · tenant_isolation politikası: 40
✅ Veritabanı 40 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

First `pnpm gate` attempt died on `ENOENT: .tmp-billing-flow.spec.ts` — another agent's
scratch file deleted mid-run. Re-ran; green. Not my file, not touched.

---

## Open questions (found, deliberately NOT fixed — out of my scope)

1. **`src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:618`**
   — hard-coded `status: true` next to *"Tüm konsorsiyum ortaklarının PIC numaraları ve
   finansal temsilcileri doğrulandı."* A completed-verification claim about consortium
   partners, backed by nothing. Same class as this ticket, one module over.

2. **`src/app/[locale]/(app)/[workspace]/marketplace/client.tsx:103`** —
   `verifiedReviewer: kind === 'consultancy'`. A "verified reviewer" badge derived from
   a listing category rather than from any verification record.

3. **Existing rows keep `status: 'VALID'`.** Uploads before `eb537c1` were written
   `VALID` by the old hard-coding, and `Evidence.status` still carries
   `@default("VALID")` in `prisma/schema.prisma`. New uploads are correct, but historical
   rows will still show the green badge, and a row created by any other path picks up the
   VALID default. Fixing this properly is a data migration plus a default change
   (`@default("UNVERIFIED")`), which touches the shared schema — I did not do it while
   other agents hold `prisma/schema.prisma` open. **This is the one part of the ticket
   that is not fully closed.**

4. **There is no way to verify a document in the product.** Nothing can move a row from
   `UNVERIFIED` to `VALID` — no reviewer action, no UI. The badge is now honest, but the
   verification workflow it reports on does not exist yet.

5. **`src/lib/evidence-ai.ts` still has no OCR.** Field extraction is off by design
   (pass 1). A real LLM path exists at `src/lib/ai/llm.ts` (AiUsageLog + CreditLedger),
   but with no document reader an LLM given only a file name reproduces the original
   fabrication. The `rawText` extension point is in place for when OCR lands.

---

## Files changed this pass

```
src/lib/evidence-status.ts                              (new, 88 lines)
src/lib/evidence-health.ts
src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx
src/app/[locale]/(app)/[workspace]/evidence/actions.ts
tests/evidence-status.test.ts                           (new, 14 tests)
tests/e2e/evidence-unverified-badge.spec.ts             (new, 2 tests)
messages/tr.json, messages/en.json                      (Evidence.badge.* only)
```

`messages/*.json` also held another agent's in-flight pricing copy. I staged **only my
`badge` hunks** via `git apply --cached` with a filtered patch; their 22 lines were left
unstaged and untouched.
