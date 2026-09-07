---
name: fabrika-i18n-locales-dead-pattern
description: src/locales/{locale}/{namespace}.json pattern is a dead-code trap — next-intl ignores these, reads only messages/{locale}.json
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

## The Trap

When adding i18n content, developers sometimes create `src/locales/{locale}/{namespace}.json` files (e.g., `src/locales/tr/briefs.json`) as if following a structured layout. This is **dead code**:

- **Why:** Next-intl routing (via `src/i18n/request.ts:15`) imports only `messages/${locale}.json` — not anything under `src/locales/`.
- **Result:** The files sit in the repo, are never read, and can fall out of sync with code without notice.
- **Verification:** `grep -rn "briefs.json\|from.*locales" src` returns nothing; `grep '"briefs"' messages/tr.json` shows the real keys live under `m9` namespace in the main message file.

## How to Spot It

1. Check `src/i18n/request.ts` to confirm the single source of truth: only `messages/{locale}.json`.
2. If `src/locales/*/` exists at all, `grep` the entire `src/` for imports of those files — you'll find none.
3. If a DoD claim says "briefs i18n ✅" but `messages/tr.json`'s `briefs` namespace is empty, suspect this pattern.

## Solution

1. Delete the `src/locales/*/` files outright (they're unused).
2. Verify all translations are in the right place: `messages/{tr,en}.json` under the appropriate namespace key.
3. Verify all `useTranslations()` calls match (e.g., `useTranslations('m9')` for m9 keys).

## Related

- **CLAUDE.md rule 8:** "Kullanıcıya görünen sabit metin yok; `t(…)`" — hard-coded strings violate this, and dead i18n files hide the violation.
- **fabrika-done-reports-can-be-wrong:** M9.2 DoD claimed "i18n 0 gap" but the files were dead; PM validation caught it.
