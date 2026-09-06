---
name: project-fabrika-setup
description: Fabrika MVP architecture, tech stack, key conventions and setup patterns
metadata:
  type: project
  updatedAt: 2026-09-06
---

# Fabrika Project Setup & Conventions

## Project Identity
- **Name:** Fabrika — European project pipeline SaaS (multi-tenant)
- **Target:** KOBİs, consulting firms, university project offices applying to EU funding
- **Tech Stack:** Next.js 15 + TypeScript (strict) + Prisma + PostgreSQL + pgvector
- **UI Languages:** Turkish (default) + English (next-intl)
- **Code/schema/commits:** English only

## Architecture Layers (K1–K6)
1. **K1** — Funding calls aggregation (SEDIA, Eurostars, TÜBİTAK; daily via Inngest)
2. **K2** — CORDIS projects (monthly; Python worker via FastAPI)
3. **K3** — Baseline rates (manual upload to TopicStat)
4. **K4** — Outreach integrations (Portal, EEN, LinkedIn)
5. **K5** — Pipeline/CRM (Opportunity, Proposal, ConsortiumSeat, Gate workflow)
6. **K6** — AI adapter (Anthropic SDK + OpenAI-compatible; RAG via pgvector)

## Modules (M1–M11)
- State machine: `off → dev → pilot → on`
- Stored in `ModuleState` table per tenant
- Each module has manifest in `src/modules/<id>/manifest.ts`
- Logic via events (`src/core/events`) and contracts, not direct imports

## Multi-Tenancy Rules (MUST follow)
1. Every data table has `tenantId` (no exceptions)
2. All queries go through `withTenant(prisma, tenantId)` wrapper (`SET LOCAL app.tenant_id`)
3. RLS politkies in `prisma/rls.sql` — tables without RLS fail PR
4. Inngest jobs fetch tenants explicitly; don't use `withTenant()` (server context, not request)

## Inngest Job Orchestration
- **Client:** `src/lib/inngest/client.ts` (singleton with `apiKey`, `signingKey` from env)
- **5 jobs in `src/lib/inngest/jobs/`:**
  - `k1-daily-calls`: 2 AM UTC daily
  - `k2-monthly-cordis`: 1st month, 4 AM UTC
  - `alerts-daily`: 8 AM UTC
  - `credits-monthly-grant`: 1st month, 6 AM UTC
  - `m4-weekly-summary`: Monday 9 AM UTC
- **Handler:** `/api/inngest` (POST)
- **Env vars:** `INNGEST_API_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `WORKER_URL`
- **Note:** MVP schemas only (no real calls); jobs return structured results

## Project Rules (from CLAUDE.md)
- **No:** `any`, `// @ts-ignore`, direct `process.env` reads (use `src/lib/env.ts`), F&T Portal auto-send
- **Yes:** Zod validation at API boundaries, Server Actions small, saf functions in `src/core/`/`src/modules/*/server/`
- **Naming:** kebab-case files, PascalCase React components, camelCase DB fields, singular table names
- **Tests:** mandatory for gate rules, scoring functions, module state machine; e2e "happy path" per module
- **i18n:** all user-visible text via `t('key')`, new keys added to tr + en JSONs same PR

## File Conventions
- Server actions: small wrapper, business logic in `src/lib/*/` or `src/core/*/`
- Each new table: migration + RLS + seed (if needed) + `docs/DATA_MODEL.md` update in same PR
- Comments only for "WHY non-obvious"; never comment "WHAT the code does" or "added for issue #X"
- No backwards compat hacks (rename unused vars, re-export, `// removed` comments)

## Workspace Commands
```bash
pnpm dev              # Next.js :3000
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # seed.ts (plans, modules, demo tenant)
pnpm db:rls           # apply RLS policies
pnpm test             # vitest
pnpm test:e2e         # playwright
pnpm lint && pnpm typecheck
pnpm worker:dev       # Python worker
pnpm jobs:k1          # manual K1 trigger
```

## Key Files
- `PROJECT.md` — source of truth (product spec, roles, layers, acceptance criteria)
- `CLAUDE.md` — this workspace's rules and commands
- `docs/ROADMAP.md` — epics, sprints, open decisions
- `docs/ARCHITECTURE.md` — detailed layer specs
- `docs/INNGEST.md` — job setup, testing, debugging
- `.env.example` — all env vars (check before adding new ones)

## Testing Patterns
- **Unit:** gate rules, scoring, module state-machine logic
- **Integration:** Prisma + RLS (negative tests: tenant A can't see B's data)
- **E2E:** one "happy path" flow per module (Playwright)
- Run: `pnpm test -- <pattern>`

## Money & Billing
- All amounts: `Int` (minor unit, e.g., cents) + `currency` field
- Calculations: `src/lib/money.ts`
- Plans: Keşif €0 / Başlangıç €59 / Ekip €249 / İşletme €599 / Kurumsal €1.500+
- AI credits: plan-based monthly grant + per-usage deduction via `AiUsageLog`

## AI/LLM Policy
- All calls through `src/core/k6-ai/llm.ts` (adapter pattern)
- Every call → `AiUsageLog` entry (tenant, user, module, tokens, credits, promptHash)
- Prompts in `src/core/k6-ai/prompts/*.md`, not inline
- User data never sent for training; cache allowlist only
- Default: Anthropic SDK; OpenAI-compatible adapter for fallback

## Evidence & Proof
- Every stat/ratio shown to user must link to `Evidence` or `TopicStat` record
- No hardcoded numbers in code ("current ") approval rates, percentages, etc.)

## Time Handling
- **DB:** UTC always
- **Deadlines:** `deadlineAt` (UTC) + `deadlineTz` ("Europe/Brussels") columns
- **UI:** display in user's timezone, show Bruksel time as reference

## Status: MVP Week 1 Monday
- E0 skeleton done (env/Next/Prisma/Auth.js stubs)
- E1 Tenant/auth/RLS in progress
- Inngest backbone complete (today: job schemas, no real calls yet)
