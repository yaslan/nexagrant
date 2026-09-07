---
name: fabrika-css-uppercase-turkish-dotted-i
description: CSS text-transform uppercase under html lang="tr" Turkish-cases hardcoded/untranslated text — English words get an incorrect dotted İ (e.g. "Consortium" → "CONSORTİUM")
metadata:
  type: project
  updatedAt: 2026-09-07
---

## What happens
`src/app/layout.tsx` correctly sets `<html lang={locale}>`. Under `lang="tr"`, the
CSS Text Module Level 3 Turkish/Azerbaijani casing exception makes
`text-transform: uppercase` map lowercase `i` → `İ` (dotted), which is the
**correct** rule for real Turkish words (`konsorsiyum` → `KONSORSİYUM` is right).

The bug shows up specifically when a component ships **hardcoded, untranslated
English text** (not run through `t()`) styled with the Tailwind `uppercase`
class, on a page a Turkish-locale user visits: the same Turkish casing rule
applies to that English text too, so `"Add Role to Consortium"` renders as
`"ADD ROLE TO CONSORTİUM"` — a dotted İ in an English word, visibly wrong.
Confirmed live in a real browser (Playwright, demo tenant) during
[[TASK-MTQWBAJ2T5XSV]] / F15 — see
`docs/agent-results/TASK-MTQWBAJ2T5XSV-blog-yazar.md` for the before/after
screenshots and the exact repro.

## The fix pattern used (consortium/manager.tsx)
Drop the CSS `uppercase` class entirely and put the already-capitalized string
in the translation catalog instead, e.g. `messages/tr.json`:
`"addRoleToConsortium": "KONSORSİYUMA ROL EKLE"`, `messages/en.json`:
`"ADD ROLE TO CONSORTIUM"`. This sidesteps the whole class of bug: Turkish
strings never contain accidental English loanwords, and the visual caps no
longer depends on a browser engine actually implementing the CSS Turkish
casing exception (support is inconsistent on older WebKit/embedded webviews).

## Where else this risk lives (found by grep, NOT fixed — not touched, out of scope for the finding agent)
`grep -rn "uppercase" src/ --include="*.tsx" --include="*.ts"` → 122 hits across
46 files. Of those, ~34 pair the `uppercase` class with hardcoded (non-`t()`)
text rather than a translated string. Full file:line list with English-vs-Turkish
classification is in `docs/agent-results/TASK-MTQWBAJ2T5XSV-blog-yazar.md` §3.
Concrete confirmed-risky ones (hardcoded English + uppercase, contains lowercase
`i`): `[locale]/i18n-check/page.tsx:45`, `settings/api-keys/client.tsx:94`,
`concept-notes/[id]/editor.tsx:85` ("Sections", never translated at all),
`admin/blog/client.tsx:148`.

## Related, opposite-direction bug (JS side, also not fixed)
`String.prototype.toUpperCase()`/`.toLowerCase()` in Node/browser default to a
locale-unaware (effectively en-US) mapping, which does the **reverse** wrong
thing: a Turkish name's lowercase `i` becomes plain `I` instead of `İ`. Found
in `src/components/UserMenu.tsx:99,101` (avatar initials from user name) and
`src/lib/auth.ts:172` (display name from email local-part). Fix would be
`.toLocaleUpperCase('tr')` for genuinely Turkish/user-authored strings — not
applied anywhere in this pass, reported as a task candidate only.
