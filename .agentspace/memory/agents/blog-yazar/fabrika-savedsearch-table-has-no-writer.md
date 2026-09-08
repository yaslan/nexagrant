---
name: fabrika-savedsearch-table-has-no-writer
description: RESOLVED 2026-09-08 (TASK-MTS6M5819RW93) — SavedSearch now has a real writer (/api/saved-searches). This file records what was true before, for context on the fix.
metadata:
  type: project
---

**Status: fixed.** As of TASK-MTS6M5819RW93 (2026-09-08), `/calls` "Aramayı Kaydet" calls a real
`GET/POST /api/saved-searches` + `PATCH/DELETE /api/saved-searches/[id]` (all `requireTenantApi()` +
`withTenant`), and `alerts-daily.ts`'s `notify: true` query now sees real rows. Verified end-to-end
against the real dev Postgres (create → row visible to the job's own query → `matchCountQuery`
executes a real count) and through the actual browser UI (save → reload persists → notify toggle
persists → delete removes it, tr + en). See `docs/agent-results/TASK-MTS6M5819RW93-blog-yazar.md`
and `docs/DATA_MODEL.md` §12 for the write path and the personal-list (`tenantId`+`userId`) scoping
decision. `prisma.savedSearch.create` now exists — do not re-report the bug below as current.

---

Original finding (2026-09, TASK-MTRNQN0NNVBYM), kept for context:

The `SavedSearch` Prisma model backs the daily alert cron (`src/lib/inngest/jobs/alerts-daily.ts`),
but nothing in the codebase ever created a row: no API route, no seed data, no server action. The
"Kaydet" button only did `await new Promise(resolve => setTimeout(resolve, 500))` and showed a toast.
So `prisma.savedSearch.findMany({ where: { notify: true } })` almost certainly returned `[]` in
production. See [[fabrika-prisma-namespace-type-not-importable]] for a sibling technical gotcha hit
in the same loop.
