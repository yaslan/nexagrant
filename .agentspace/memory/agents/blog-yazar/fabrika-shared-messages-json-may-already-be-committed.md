---
name: fabrika-shared-messages-json-may-already-be-committed
description: In Fabrika, edits to ANY file you touched — not just shared messages/tr.json or en.json — can vanish from `git diff` before you commit, swept into another parallel agent's unrelated commit. Check diff is actually empty before assuming nothing changed, and verify HEAD's content, not just its message.
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

After adding new i18n keys to `messages/tr.json` and `messages/en.json` (TASK-MTQZMX184PX87), `git status`/`git diff` showed **zero** changes for those two files even though I had just edited them with `Edit`. Reading `git log`, another agent's unrelated commit (`af28b7b`, a consortium-badge fix) already contained my `callDetails`/`callsPage` additions — its `git add` must have swept the whole shared working tree's state of these two files, not just its own keys.

**Reconfirmed same day, wider scope (TASK-MTRHADHCV9W7A):** this isn't limited to the two messages/*.json files. After adding `useTranslations` + ~50 keys to `src/app/[locale]/(app)/[workspace]/approvals/client.tsx`, `git status` showed nothing for that file either — swept into two *other* agents' commits (`02474a8 fix(next-auth): replace window.location.href…` and `fdb127e test(m8): prove "Aday Bul"…`), neither of which mentions approvals or i18n in its message. Verified via `git show HEAD:<path> | grep useTranslations` and a JSON key-count check that the full edit survived intact. **Any file you edit in this shared tree can end up committed under someone else's unrelated message — not just the two json catalogs.**

**Why:** all parallel agents in a Fabrika session share one working tree ([[fabrika-agents-share-one-working-tree]]). `messages/tr.json`/`en.json` are common files every agent appends to. If agent A runs a broad `git add` (or commits at a moment when agent B's edit is sitting unstaged in the same file), agent B's content rides along inside agent A's commit — not as agent B's own commit, but it *is* in `dev` all the same.

**How to apply:** before writing "I need to commit my messages/*.json edits", run `git diff -- messages/tr.json messages/en.json` first. If it's empty, your keys are already on `dev` via someone else's commit — verify with `git show HEAD:messages/tr.json | grep <your-key>` (or parse as JSON) instead of re-adding/re-committing. Don't assume "no diff" means "my edit was lost" — check the committed content before treating it as a problem. This cuts the other way from [[git-add-verify-before-commit]] (which guards against *your* commit sweeping *others'* work) — here it's *your* work riding on someone else's commit, which is harmless but worth noting in the task report so the reviewer isn't confused about which commit did what.
