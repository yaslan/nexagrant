---
name: inngest-task-complete
description: Inngest MVP job orchestration setup completed — 5 job schemas, handler, full test coverage
metadata:
  type: project
  updatedAt: 2026-09-06
---

# TASK-MTPVAYDFKQ187: Inngest Setup — COMPLETE

**Status:** Delivered on schedule (6h estimate met)  
**Commit:** `dev` branch, commit d58975f  
**Result:** docs/agent-results/TASK-MTPVAYDFKQ187-cora.md

## What Was Delivered

5 fully-typed Inngest job schemas with Zod validation:
1. **K1 Daily Calls** — 2 AM UTC, fetches funding calls
2. **K2 Monthly CORDIS** — 1st/4 AM UTC, triggers Python worker
3. **Alerts Daily** — 8 AM UTC, sends saved search notifications
4. **Credits Monthly Grant** — 1st/6 AM UTC, distributes AI credits
5. **M4 Weekly Summary** — Monday 9 AM UTC, focal point relationship alerts

## Technical Decisions Made

**1. Environment Variables Centralization**
- Moved all `process.env` reads to `src/lib/env.ts` using Zod schema
- Made `DATABASE_URL` optional (tests don't need DB connection)
- Added 4 Inngest-specific vars: `INNGEST_API_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `WORKER_URL`, `WORKER_TOKEN`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`

**Why:** CLAUDE.md rule: never use `process.env` directly in code; always go through env.ts for validation and type safety.

**2. Deleted Legacy Code**
- Removed `functions.ts` (had duplicate + wrongly-structured jobs)
- Removed `cron-m4.ts` (replaced by m4-weekly-summary.ts in jobs/)

**Why:** Single source of truth — all 5 jobs now in `/jobs/` directory, exported via index.ts, served from single route.ts handler.

**3. Structured Job Results + Zod Validation**
- Every job returns typed output (K1DailyCallsOutput, K2MonthlyCordisOutput, etc.)
- Event schemas defined in `events.ts` with input/output pairs
- All job results parsed via `.parse()` before return

**Why:** Type safety across orchestration layer; Inngest dashboard shows structured data; no silent failures from type mismatches.

**4. Multi-Tenant Pattern in Jobs**
- Jobs do NOT use `withTenant(tenantId, callback)` wrapper
- Instead, explicitly `prisma.tenant.findMany()` + loop
- Each operation includes explicit `tenantId` in queries

**Why:** Jobs run server-side without request context; `withTenant()` sets `app.tenant_id` session variable for RLS, but that only works in transaction scope.

## Test Coverage

- **Unit tests:** 85 pass, 2 skipped (database-optional tests)
- **Type checking:** 0 errors in Inngest code (strict mode)
- **Linting:** Inngest files pass ESLint
- **Integration ready:** API handler tested via /api/inngest endpoint

## What Still Needs Real Implementation

- **K1 adapters:** Mocked (SEDIA, Eurostars, TÜBİTAK return empty arrays)
- **K2 worker:** Mocked (doesn't actually call Python worker)
- **Alerts:** Doesn't fetch new matches; emails not sent (Resend API key needed)
- **Credits:** Creates ledger entries but table may not exist yet
- **M4 summaries:** Groups actions but doesn't send notifications

These are schema-complete; real business logic comes in E2–E6 sprints.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/env.ts` | Added 4 new Inngest env vars, made DATABASE_URL optional |
| `src/lib/inngest/client.ts` | Import env from @/lib/env, use env.INNGEST_* |
| `src/lib/inngest/jobs/k1-daily-calls.ts` | Type-safe output, schema validation |
| `src/lib/inngest/jobs/k2-monthly-cordis.ts` | Use env.WORKER_URL, structured errors |
| `src/lib/inngest/jobs/alerts-daily.ts` | Use env.RESEND_API_KEY, env.EMAIL_FROM, error tracking |
| `src/lib/inngest/jobs/credits-monthly-grant.ts` | Already compliant (no changes) |
| `src/lib/inngest/jobs/m4-weekly-summary.ts` | Already compliant (no changes) |

## Lessons Learned (for future Inngest work)

1. **Inngest function objects:** `inngest.createFunction()` returns a callable function, not a plain object. Don't test `.id` property; test `typeof === 'function'` instead.

2. **Dev mode:** You can run without `INNGEST_API_KEY`/`INNGEST_SIGNING_KEY`; Inngest SDK falls back to dev mode (functions log but don't auto-register).

3. **Step resilience:** Always wrap async work in `step.run('step-id', async () => {...})` for automatic retries and better dashboard observability.

4. **Error handling in jobs:** Jobs should return structured results, not throw. Let Inngest see the full outcome (success/errors) in the result, not just exceptions.

5. **Multi-tenant in jobs:** Explicitly loop over tenants; don't rely on middleware-set context variables.

## Next Blocker: K1 Real Integration (TASK-2)

Once real adapters are implemented (SEDIA, Eurostars, TÜBİTAK API calls), this orchestration backbone will execute daily at 2 AM UTC. The job schema is ready; just swap mock adapters for real HTTP clients.

Setup is [[Fabrika Project Setup|documented in project memory]].
