# TASK-MTTUTNGF1MO9P — Retired brand "FonBridge" in the live interface: read-only inventory

**Agent:** customer-support (CS-EN) · **Sprint:** SPRINT-S12 · **Type:** audit (read-only)
**Scope:** `src/ public/ messages/ prisma/ emails/` · **Code changed:** none · **`messages/*.json` touched:** none
**Date:** 2026-09-10

> Board note: the card's full description could not be read. The `agentdesk_task` MCP surface
> exposes `list_tasks` (titles only), `create_task`, `update_task` and `attach_to_task` — there is
> no `get_task`, and the board store is not on this filesystem (`grep -rl MTTUTNGF1MO9P` over
> `~/Library/Application Support/agentdesk-shell/` and `.agentspace/` returns nothing). This audit
> follows the spec as given in the task prompt. If the card carries acceptance criteria beyond it,
> they were not visible to me.

---

## 1. What was done

Static sweep of the four scan roots for the retired brand, every hit sorted into buckets, `public/`
assets checked **by content rather than filename**, then a real signed-in browser walk (login →
dashboard → billing → admin settings → generated document → module gate) with screenshots, plus a
database check on the one path that static reading could not settle.

**Headline: the repo's own guard against this exact defect — `tests/retired-brand-name.test.ts` —
is 5/5 green while the login screen displays the FonBridge wordmark.** The guard is green because
of where it looks, not because the product is clean. Section 5 shows the three blind spots.

`emails/` does not exist in this repo (`ls: emails: No such file or directory`); the outbound-mail
surface lives in `src/app/[locale]/admin/settings/smtp-form.tsx` and is covered as **B2**.

### Totals

| Scan root | Hits (case-insensitive) |
|---|---|
| `src/` | 27 |
| `prisma/` | 1 |
| `public/` | 0 **as text** — 1 as image content (see B1) |
| `messages/` | 0 |
| `emails/` | directory absent |

`messages/tr.json` and `messages/en.json` contain **zero** occurrences of the retired name; every
brand-bearing catalogue string carries a `{brand}` placeholder. The copy path is genuinely fixed.
What the rename did not close is everything that is *not* a catalogue sentence.

---

## 2. Bucket A — comment / historical record only (9 files) — **correct as-is, do not touch**

These name the retired brand deliberately, as the record of a defect that removed it. All nine are
on the guard's `HISTORICAL_RECORD` allowlist.

| File:line | |
|---|---|
| `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx:66` | comment |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx:39` | comment |
| `src/app/[locale]/admin/blog/actions.ts:28` | comment |
| `src/app/api/documents/export/route.ts:21` | comment |
| `src/app/api/invitations/route.ts:12` | comment |
| `src/lib/brand.ts:4` | module docstring |
| `src/lib/document-exporter.ts:217` | comment |
| `src/modules/m10/server/actions.ts:76` | comment |
| `next.config.ts:105` | comment (outside my scan roots; listed for completeness) |

Rewriting these to "Fabrika" would falsify the record and, in the exporter's case, mint a fresh
fabricated identity. Leave them.

---

## 3. Bucket B — USER-VISIBLE (4 findings)

### B1 · `public/logo.png` — the logo image itself still reads "FonBridge"  · severity **P1**

The 600×240 PNG rendered as the product logo **is the old wordmark**. Filename is neutral; only
opening the bytes shows it. Rendered at **8 sites**:

```
src/app/[locale]/(app)/layout.tsx:103          (app top bar)
src/app/[locale]/admin/layout.tsx:76           (admin top bar)
src/app/[locale]/login/AuthCard.tsx:149        (login card)
src/components/PublicFooter.tsx:23             (public footer)
src/components/PublicNavbar.tsx:47             (public navbar — signed out)
src/components/MobileAppHeader.tsx:51, 88      (mobile app header)
src/components/MobileAdminHeader.tsx:47        (mobile admin header)
```

This is the first thing every prospect and every user sees. On the login screen the old wordmark
sits **directly above** the heading "Fabrika Platformuna Giriş" — both brands, one screen.

What makes it sharper: the `alt` text at all 8 sites is already correct
(`tCommon('logoAlt', { brand: PRODUCT_NAME })` → "Fabrika logosu"). A screen-reader user hears
*Fabrika*; a sighted user reads *FonBridge*. The rename fixed the description of the image and
not the image.

**Fix path — neither `PRODUCT_NAME` nor `{brand}`.** `src/lib/brand.ts`'s rule governs *strings*;
this is an asset swap. Replace the bytes of `public/logo.png` with a Fabrika wordmark of the same
dimensions and none of the 8 call sites change. **Needs a design asset → this is a hand-off, not a
code fix.** Recommend one card on design/brand, blocking release-facing screenshots.

### B2 · `noreply@fonbridge.app` is the shipped SMTP sender default · severity **P1**

`src/app/[locale]/admin/settings/smtp-form.tsx`

```
:11   const [user, setUser] = useState('noreply@fonbridge.app');
:14   const [fromEmail, setFromEmail] = useState('noreply@fonbridge.app');
:127  placeholder="noreply@fonbridge.app"
:168  placeholder="noreply@fonbridge.app"
```

The same form, three lines up, already does it right:
`:13 const [fromName, setFromName] = useState(`${PRODUCT_NAME} SaaS`)`. So the form ships a
**split identity** — display name "Fabrika SaaS", address `noreply@fonbridge.app`. An admin who
saves the form without editing sends every team invitation, verification mail and system
notification from a retired domain. Beyond the branding: a sender domain the company may no longer
control fails SPF/DMARC, so those mails land in spam or bounce, and the user-visible symptom is
"invitations never arrive" — a support ticket that reads nothing like a branding bug.

**Fix path — not `PRODUCT_NAME`.** An address cannot be derived from a display name ("Fabrika" →
which domain?). This wants an env-backed default read through `src/lib/env.ts`
(e.g. `SMTP_FROM_ADDRESS`), the same shape `storage.ts:21` already uses for `R2_BUCKET`.
**The real sending domain is a product decision — do not let an agent guess it.** Escalate.

### B3 · `https://storage.fonbridge.app/` hard-coded as the evidence download host · severity **P2, latent**

```
src/lib/storage.ts:54, 90, 101, 112, 126                       (5 sites)
src/app/[locale]/(app)/[workspace]/evidence/actions.ts:92      (1 site — URL rebuilt by hand)
```

This value is written to `Evidence.fileUrl` and reaches the user twice:
`evidence-client.tsx:503` and `:770` render it as the `href` of the download link, and
`evidence-client.tsx:244` writes it into the `FileUrl` column of the CSV the user downloads.

**Not firing today.** `SELECT count(*) FROM "Evidence" WHERE "fileUrl" IS NOT NULL` → **0 rows**
(evidence in this database predates file attachment). Nobody is currently handed one of these
links. It starts the first time anyone uploads an evidence file — so this is a bug waiting on a
user action, not a bug in the current screenshots.

Note the asymmetry inside `storage.ts`: the **bucket** is configurable
(`:21 process.env.R2_BUCKET || 'fonbridge-evidence'`) but the **public host** is a bare literal in
five places. Note also that `evidence/actions.ts:92` reconstructs the URL itself instead of calling
`storage.ts`, which is why the literal lives in two modules and would have to be fixed twice.

**Fix path — not `PRODUCT_NAME`.** A hostname is not the brand string. Add `R2_PUBLIC_HOST` to
`src/lib/env.ts` and have `evidence/actions.ts` call `storage.ts` instead of rebuilding the URL.

### B4 · `mehmet@fonbridge.app` printed on the public login page · severity **P3**

`src/app/[locale]/login/AuthCard.tsx:334` (handler) and `:339` (visible text). Confirmed in the
**served HTML**, so it is rendered, not dead code:

```html
<div class="text-[10px] text-muted font-mono">mehmet@fonbridge.app</div>
```

Pre-auth, public, and presented as a real corporate address on a demo-login button. Backed by
**C1**.

**Fix path** — demo fixture data, not a brand-module concern. Fix with C1 in one change: move both
to a neutral example domain, or to whatever B2 settles on.

---

## 4. Bucket C — seed / demo / persisted data · and D — internal keys

**C1 · `src/lib/auth.ts:36`** — demo profile keyed `"mehmet@fonbridge.app"`. The same object's
`orgName` at `:37` already reads `${PRODUCT_NAME} SME Ar-Ge Ltd.`, so the record is half-renamed.
Feeds B4.

**C2 · `prisma/schema.prisma:897`** — `fileBucket String @default("fonbridge-evidence")`.
**Not user-visible**: `fileBucket` appears in exactly one `src/` file, as a write, and is never
read into the UI. But it is already **in the data** — all **44** Evidence rows carry
`fileBucket = 'fonbridge-evidence'`. **Recommendation: leave it.** A bucket name is an infra
identifier, not a brand surface; renaming it orphans every stored object and buys nothing a user
can see.

**C3 · `src/app/[locale]/(app)/[workspace]/evidence/actions.ts:120`** — hard-codes
`fileBucket: 'fonbridge-evidence'`, overriding the env-configurable `R2_BUCKET` that `storage.ts:21`
respects. Config drift rather than a brand leak, but it sits in the same line and would be found
by the same sweep.

**D · localStorage keys — do NOT rename** (`src/components/cart/CartContext.tsx:88`
`fonbridge_cart_items_v2`; `src/lib/hooks/use-read-notifications.ts:21,22,26`
`fonbridge_notifications_updated`, `fonbridge_read_notifs_*`). These are invisible to users, and
renaming them silently empties every existing cart and marks every read notification unread again
— a self-inflicted incident for zero visible benefit. `tests/cart-checkout-signed-out.test.tsx:32`
already pins the cart key.

---

## 5. Why the guard test did not catch any of this

`tests/retired-brand-name.test.ts` exists precisely to stop this defect, and it passes 5/5. Three
blind spots, all structural:

1. **Case-sensitive.** `const RETIRED = 'FonBridge'` with `.includes(RETIRED)`. Every finding above
   carries the *lowercase* form. **Eight files contain `fonbridge` but not `FonBridge`** and are
   therefore invisible to it:
   `evidence/actions.ts`, `admin/settings/smtp-form.tsx`, `login/AuthCard.tsx`,
   `cart/CartContext.tsx`, `lib/storage.ts`, `lib/auth.ts`, `lib/hooks/use-read-notifications.ts`,
   `prisma/schema.prisma`.
2. **Text extensions only.** `sourceFiles()` filters `/\.(ts|tsx|json)$/`, so no binary asset can
   ever be examined. `public/logo.png` (B1 — the worst finding) is excluded by construction.
3. **Roots are `src/` + `next.config.ts` only.** `public/` and `prisma/` are never walked.

A guard that scans only `.ts|.tsx|.json` under `src/`, case-sensitively, cannot see a wordmark
baked into a PNG. It is worth saying plainly: **this is a green gate over a visibly broken
surface**, which is the failure mode the sprint keeps finding. Widening it is a code change and
therefore out of my read-only scope — recommend a follow-up card:
case-insensitive match; add `public/` and `prisma/` as roots; and for `public/`, assert on a
maintained manifest of brand assets (a binary cannot be grepped, so the check has to be "these
assets were reviewed at this hash").

---

## 6. Evidence

### 6.1 Static sweep

```
$ for d in src public messages prisma emails; do printf "%-10s %s\n" "$d" \
    "$(grep -rniE 'fon[[:space:]_-]?bridge' $d/ 2>/dev/null | wc -l | tr -d ' ')"; done
src        27
public     0
messages   0
prisma     1
emails     0          # ls: emails: No such file or directory
```

```
$ file public/logo.png
public/logo.png: PNG image data, 600 x 240, 8-bit/color RGBA, non-interlaced
$ grep -rn "logo\.png" src/ | wc -l
8
```

### 6.2 The guard is green while the brand leaks

```
$ npx vitest run tests/retired-brand-name.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  485ms
```

```
$ for f in $(grep -rliE "fonbridge" src/ prisma/); do
    grep -q "FonBridge" "$f" || echo "  $f"; done
  src/app/[locale]/(app)/[workspace]/evidence/actions.ts
  src/app/[locale]/admin/settings/smtp-form.tsx
  src/app/[locale]/login/AuthCard.tsx
  src/components/cart/CartContext.tsx
  src/lib/storage.ts
  src/lib/auth.ts
  src/lib/hooks/use-read-notifications.ts
  prisma/schema.prisma
```

### 6.3 Served HTML — login page (pre-auth)

```
$ curl -s http://localhost:3000/tr/login | grep -oE "...fonbridge\.app..."
...font-mono">mehmet@fonbridge.app</div>...

$ curl -s http://localhost:3000/tr/login | grep -oE "<title>[^<]*</title>"
<title>Fabrika</title>                    # tab title CLEAN
                                          # alt="Fabrika logosu" x3 CLEAN
```

### 6.4 Database

```
rows with fileUrl: 0                      # B3 latent, not firing today
┌─────────┬──────────────────────┬───────┐
│ (index) │ fileBucket           │ count │
├─────────┼──────────────────────┼───────┤
│ 0       │ 'fonbridge-evidence' │ 44    │   # C2 already in the data
└─────────┴──────────────────────┴───────┘
```

### 6.5 Browser walk (signed in as `admin@yasinaslan.com.tr`, workspace `default`)

Next.js 16.3.4 dev on `localhost:3000`, AgentSpace internal browser (Chromium), headed.

| # | Screenshot | Surface | Verdict |
|---|---|---|---|
| 1 | `01-login-two-brands.png` | `/tr/login` | **DIRTY** — FonBridge wordmark in navbar **and** login card, directly above "Fabrika Platformuna Giriş" |
| 2 | `02-dashboard-topbar.png` | `/tr/default/dashboard` | **DIRTY** — FonBridge logo in app top bar |
| 3 | `03-billing.png` | `/tr/default/settings/billing` | copy **CLEAN** ("Fabrika Beta çalışma alanı…"); top-bar logo dirty |
| 4 | `04-admin-smtp-fonbridge.png` | `/tr/admin/settings` | **DIRTY** — `noreply@fonbridge.app` as a live field value; FonBridge logo beside "Admin" |
| 5 | `05-generated-doc-clean.png` | `/api/documents/export?type=NDA&format=pdf` | **CLEAN — the requested clean frame** |
| 6 | `06-module-gate.png` | `/tr/default/evidence` | copy **CLEAN** ("…Fabrika ekibiyle görüşün."); module off for this tenant |

Screenshots: `docs/agent-results/assets/TASK-MTTUTNGF1MO9P/`

**The clean frame (#5)** — every brand-bearing line of a downloaded document resolves to the new
name, in the header, the provenance warning, the body and the page footer:

- header: *Fabrika Beta*
- provenance: *"Bu belge Fabrika Beta tarafından **Fabrika**'da hazırlanmıştır."*
- body: *"…**Fabrika**'da üretilmiş bir taslaktır."*
- footer: *"**Fabrika** — Ufuk Avrupa & TÜBİTAK doküman üretim motoru | Sayfa 1 / 1"*

The `{brand}` + `withBrand()` path works exactly as `src/lib/brand.ts` designed it. Evidence CSV
download **filename** is likewise clean: `${PRODUCT_NAME}_Evidence_Pack_<date>.csv`.

I could not walk the evidence download link live — the Evidence Pack module is `off` for this
tenant (#6) and, independently, no Evidence row carries a `fileUrl` (6.4). B3 rests on static
reading plus that DB check, and is reported as latent rather than observed.

---

## 7. Adjacent defects — reported by name, NOT fixed (sprint rule)

1. **`src/app/layout.tsx:16`** — `title: 'Fabrika'` re-typed as a literal instead of reading
   `PRODUCT_NAME`. The name is right today; the mechanism is exactly the one `brand.ts` exists to
   prevent. One-line fix, someone else's card.
2. **`src/app/favicon.ico`** — still the stock Next.js triangle (verified by converting the .ico
   and viewing it). Neither brand. The browser tab carries a framework default.
3. **`src/app/[locale]/(app)/[workspace]/settings/modules/client.tsx:624`** — hard-coded Turkish
   sentence, CLAUDE.md rule 8. Belongs to **TASK-MTU64MMEQC0WV** (@ex-en, i18n sweep).
4. **`src/app/[locale]/login/AuthCard.tsx:328`** — hard-coded `Giriş →`. Same card as #3.
5. **`tests/retired-brand-name.test.ts`** — the three blind spots in §5. This is the root cause of
   everything above surviving the rename, and it deserves its own card.

---

## 8. Changed files

**None.** Read-only audit, as the card requires. No source file, no `messages/*.json`, no asset was
modified. The only additions are this report and its screenshots under `docs/agent-results/`.

---

## 9. Risks

- **B1 is a design hand-off, not a code fix.** No agent should generate a replacement logo. Until a
  Fabrika wordmark exists, every screenshot in release notes and every marketing capture carries the
  dead brand.
- **B2 must not be guessed.** Substituting a plausible domain into the SMTP default would look like
  a fix and silently break outbound mail. It needs the real sending domain from a human.
- **Bucket D must not be swept up** by a well-meaning find-and-replace across `fonbridge`. A global
  rename empties every user's cart. If anyone runs a bulk fix, D has to be excluded explicitly.
- **C2 likewise** — renaming the storage bucket orphans 44 rows' worth of stored objects.
- B3's severity depends on whether `fonbridge.app` DNS is still controlled. I did not probe it;
  that is a question for whoever holds the domain registrar account.

## 10. Open questions

1. What is the real sending domain for B2 — and is `fonbridge.app` still owned and serving?
2. Does a Fabrika wordmark asset exist anywhere, or does B1 need to be commissioned?
3. Is the `fonbridge-evidence` bucket the live production bucket? If so, C2/C3 are strictly
   do-not-touch and should be documented as intentional rather than left looking like a miss.

## 11. Next step

Split into four cards, in this order: **B1** (design — blocks anything user-facing),
**B2** (needs the domain decision), **§5 guard widening** (stops the recurrence),
then **B3 + B4/C1** together as one cleanup. C2/C3/D: document as deliberate, close.

---

## Platform statement

**Verified on macOS** — Darwin 25.6.0 (arm64), zsh, Node v26.5.0, pnpm, Next.js 16.3.4 (Turbopack)
dev server on `localhost:3000`, AgentSpace internal browser (Chromium), signed-in session.

**Windows / Linux: not run.** Reason: single macOS workstation available; no isolated Windows or
Linux environment in this session.

**Cross-platform assessment, from the code:** every finding is platform-independent by
construction — they are static asset bytes (`public/logo.png`, `favicon.ico`), string literals in
`.ts`/`.tsx`, and a Prisma column default. None sits on a platform-conditional path: no process
kill, no shell or binary name, no OS path separator, no DPI or screen-size branch, no
microphone/camera permission, no keyboard-shortcut copy. `public/logo.png` is a raster served
through `next/image` and renders the same wordmark on any OS and browser; `favicon.ico` is a
multi-size ICO that Chrome, Firefox and Safari read identically on all three platforms. The SMTP
default (B2) and the storage host (B3) are server-side values and do not vary by client OS at all.
**Therefore the observed behaviour reproduces on Windows and Linux unchanged**, and nothing here
needs per-platform re-verification.

One macOS-only tool was used for *inspection only*: `sips` converted `src/app/favicon.ico` to PNG
so it could be viewed. That is an audit step, not product code — it touched no shipped file and has
no cross-platform consequence. On Linux/Windows the same check would use ImageMagick or a browser
tab.
