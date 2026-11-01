---
title: "TASK-MUPE1WNXJGYXT: Dev-branch health check and vitest results"
decision: accepted
type: DevOps/Testing
platform: mac
---

## Summary

Completed dev-branch health check (Sprint FB-GAP-1):
1. Switched from cs-fb/g1-pool-timeout → dev, committed 3 agent reports
2. Ran full vitest suite
3. Postgres :5433 is not running (connection refused) — tests requiring DB connection skipped or failed

## What Changed

### Git Commits
- **d8451c35** (dev): Added 3 reports (TASK-MUMACETT8NSI4-devop-fb.md, TASK-MUOKWIF6MNTM4-se-fb.md, TASK-MUPBPMGSN0WYK-qae-fb.md)
- **d57e2bb5** (dev HEAD): G-1 merge already in place

### Branches Consolidated
- Switched from `cs-fb/g1-pool-timeout` (027a84c9) to `dev` (d57e2bb5), preserving 3 reports in untracked state
- Reports committed with git add (not git add -A)

## Test Results

### Vitest Run: `pnpm test`

**Summary:**
- **Total Files:** 109 test files scanned
- **Failed:** 43 tests across 5 files (database unavailable)
- **Skipped:** Multiple live tests (20–36 per file) due to Postgres connection failure

**Failures by File:**

1. **src/lib/billing/plan-admin.test.ts** (25 FAILED)
   - All tests require DB (beforeEach → prisma.auditEvent.deleteMany, afterEach cleanup)
   - Error: `PrismaClientKnownRequestError` in afterEach cleanup
   - Examples: "refuses to edit a published version", "publishing archives...", "assigns private plan to tenant"

2. **src/lib/billing/plan-repository.test.ts** (10 FAILED)
   - Error in beforeEach: `prisma.tenant.create()` fails
   - Reason: `PrismaClientKnownRequestError`
   - Affected: "should fetch published version", "should list public plans", etc.

3. **tests/api-key-rate-limit.live.test.ts** (4 FAILED)
   - Live tests requiring database
   - Examples: "counts each request on key row", "429 with Retry-After"

4. **tests/bearer-token-hash.live.test.ts** (3 FAILED)
   - Live DB tests

5. **tests/billing-checkout-auth.test.ts** (1 FAILED)
   - Error stack: `connect ECONNREFUSED ::1:5433` and `127.0.0.1:5433`
   - getPilotState → startTransaction → pg-pool connection failure

**Skipped (Database Unavailable):**
- tests/agency-report.live.test.ts (5 skipped)
- tests/agency-invite.live.test.ts (18 skipped)
- tests/oauth-registration.live.test.ts (20 skipped, 2629ms timeout)
- tests/agency-funnel.live.test.ts (13 skipped)
- tests/seat-assignment-authz.live.test.ts (27 skipped)
- tests/action-missing-id.live.test.ts (36 skipped)
- tests/deleted-tenant-sessionless.live.test.ts (5 skipped)
- + additional .live.test.ts files

### Root Cause
Postgres :5433 is not running. pg-pool unable to establish connection:
- IPv6 loopback (::1:5433): ECONNREFUSED
- IPv4 loopback (127.0.0.1:5433): ECONNREFUSED

## Risks & Observations

1. **Docker daemon timeout:** `docker compose ps` and `docker info` timeout (120s+). Docker Desktop may need restart or inspection for hung processes.

2. **DB Connection String:** DATABASE_URL may be pointing to :5433 (non-standard port) for test environments. Verify against compose file and .env.*.

3. **13 Files With Prior Failures (Task Note):** The task mentions "prior 13 failed files." This run shows 5 files with failures + 20+ files with database-unavailable skips. Full investigation requires Postgres running.

4. **Vite Config Warning:** `__dirname` in vitest.config.mts:6 — should use `import.meta.dirname` for future Vite versions (non-blocking).

## Verification Checklist

- [x] Switched from cs-fb/g1-pool-timeout to dev without data loss
- [x] Committed 3 agent reports to dev (d8451c35)
- [x] Vitest suite executed (43 failures due to missing DB)
- [x] No code changes made (health check only)
- [x] Git log validated (6 commits ahead of origin/dev)

## Platform Coverage

**Tested:** macOS (Darwin 27.0.0, zsh)

Docker Desktop 4.90.0 running. Build & test infrastructure supports Linux/Windows in CI. No platform-specific code changes required for this task.

---

**Next:** Start Postgres :5433 and re-run vitest to validate previously-failing tests now pass with G-1 merge in place.
