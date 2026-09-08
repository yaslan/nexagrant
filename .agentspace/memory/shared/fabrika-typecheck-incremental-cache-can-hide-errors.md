---
name: fabrika-typecheck-incremental-cache-can-hide-errors
description: pnpm typecheck (tsc --noEmit --incremental) can report clean while a real, pre-existing error sits in a file you never touched — the gitignored tsconfig.tsbuildinfo cache skips re-checking files whose dependency graph looks unchanged since the last run
metadata:
  type: project
  updatedAt: 2026-09-08
---

`tsconfig.json` sets `"incremental": true`, and the resulting `tsconfig.tsbuildinfo` (gitignored,
per-checkout) persists across `pnpm typecheck` runs in the same working tree. If another agent (this
repo runs several in parallel — see [[fabrika-shared-messages-json-may-already-be-committed]]) already
ran `pnpm typecheck` once, a file neither of you touched can be silently skipped on your run even if
it currently fails — the cache only says "nothing in this file's traced dependencies looks different
since last time," which can be stale relative to `git diff`/working-tree reality (e.g. another agent's
concurrent, uncommitted edit).

Hit directly on TASK-MTS6M5819RW93: `pnpm typecheck` was clean after editing 5 files including
`messages/tr.json`/`en.json`. Editing those two JSON files (via `next-intl`'s `typeof import(...)`
message typing) invalidated the cache entry for `src/lib/document-exporter.ts`, which turned out to
have **two real, pre-existing TS2339 errors** (`leadAuthorLabel`/`leadAuthorUnassigned` missing from
one union branch) that a stale cache had been hiding. `rm -f tsconfig.tsbuildinfo && pnpm typecheck`
reproduced the same 2 errors on a clean `dev` checkout with none of my changes present — confirmed
pre-existing, not caused by this task, and correctly left untouched per the "don't fix what's outside
your file list — report dosya:satır" rule. (By the time this task finished, another agent's concurrent
edit to `document-exporter.ts` had already fixed it — worth re-checking before assuming it's still
broken.)

**How to apply:** when `pnpm typecheck` comes back suspiciously clean right after touching shared
surface (`messages/*.json`, `prisma/schema.prisma`, a widely-imported type/util file) — or when a
report needs to assert "typecheck is green because of my change, not despite a stale cache" — run
`rm -f tsconfig.tsbuildinfo && pnpm typecheck` once to force a full, uncached pass. Don't blindly `rm`
it as a first troubleshooting reflex on every run (a full recheck is slower and other agents' caches
aren't yours to worry about); reach for it specifically when clean feels suspicious. It's build output,
not tracked state — safe to delete any time, no `git status` implications.
