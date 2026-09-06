---
name: inngest-setup-complete
description: Inngest job orchestration is set up with 5 scheduled jobs and strong typing; ready for cloud credentials
metadata:
  type: project
  updatedAt: 2026-09-06
---

## Inngest Setup Complete (Sprint S3)

Inngest backbone for Fabrika is implemented and tested:

**What's done:**
- 5 jobs defined in `src/lib/inngest/jobs/` with cron triggers (UTC)
- Event schemas (I/O validation) in `src/lib/inngest/events.ts` (Zod)
- Handler: `/api/inngest` endpoint wired to all functions
- Documentation: `docs/INNGEST_SETUP.md`
- TypeScript strict + ESLint: clean
- Tests: all passing

**Jobs:**
- **k1-daily-calls** (2 AM UTC) — fetch & normalize calls
- **k2-monthly-cordis** (1st month 4 AM UTC) — trigger Python worker
- **alerts-daily** (8 AM UTC) — email saved search matches
- **credits-monthly-grant** (1st month 6 AM UTC) — batch credit grant
- **m4-weekly-summary** (Mondays 9 AM UTC) — focal point actions

**Blockers for go-live:**
1. `.env.local` needs `INNGEST_API_KEY` + `INNGEST_SIGNING_KEY` from inngest.com
2. TODOs in alerts-daily (actual match query) and m4 (email template)
3. Python worker URL (`WORKER_URL`) must be reachable for K2

**How to test:**
- Without cloud keys: jobs log but don't run (dev mode)
- With inngest-cli: `inngest dev` runs local scheduler
- Manual trigger: Inngest dashboard → Fabrika app → Functions → Run

**Pitfalls to avoid:**
- Database connection pool must be sized for concurrent job steps (15+ parallel Prisma calls)
- Email domain (`EMAIL_FROM`) must be Resend-verified before prod
- K2 worker auth (`WORKER_TOKEN`) matches both sides' .env

**Next team:** [[k1-k2-workers]], [[stripe-webhooks]]
