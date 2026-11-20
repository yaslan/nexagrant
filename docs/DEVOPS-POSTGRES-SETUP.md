# DevOps — Postgres Setup (Defne)

**Task ID:** TASK-MTQ32X4CFRMR5  
**Sprint:** S8  
**Owner:** Defne (DevOps)  
**Date:** 2026-09-06

---

## Yapılacaklar

### 1. Docker Installation
```bash
# macOS
brew install docker
# or Docker Desktop: https://www.docker.com/products/docker-desktop

# Verify
docker --version
docker ps
```

### 2. Start Postgres + pgvector
```bash
cd /Users/macbook/AgentSpace/fabrika
docker-compose up postgres-vector
# Runs: pgvector/pgvector:pg16 on port 5432
# User: fabrika | Pass: fabrika_pass | DB: fabrika_db
```

### 3. Database Setup
```bash
pnpm db:migrate
pnpm db:seed
```

`pnpm db:seed` always writes the reference data (plans, module catalogue,
add-ons, programmes, concept templates, Interreg rubrics, blog launch posts).
The demo tenant and its users, calls and opportunities are written only when
`SEED_DEMO` is on. Unset fails closed: on only when `NODE_ENV` is explicitly
`development` or `test`, off with `NODE_ENV=production` and off when `NODE_ENV`
is not set at all — a `pnpm db:seed` from a server shell writes no demo tenant
(FO-296). `SEED_DEMO=true` is always obeyed and in production prints a warning
(FO-251). Local development: `.env.example` has `NODE_ENV=development`, so a
copied `.env` keeps the demo on. A production seed therefore prints
`Skipping demo data (SEED_DEMO is off) — reference data only.`

Expected seed output (development, demo on):
```
Seeding Database...
Tenant and users seeded (Fabrika Beta with alice, bob, charlie).
Calls and topics seeded (20 calls).
Opportunity seeded: ...
Opportunities seeded (5 opportunities).
Gate decisions seeded (15 decisions).
Proposals seeded (3 proposals).
Efforts seeded (10 efforts).
Seeding completed with E10 data.
```

### 4. Verify Seed
```bash
psql -h localhost -U fabrika -d fabrika_db -c "SELECT COUNT(*) as calls FROM public.Call;"
# Expected: 20+
```

`DB_CONNECT_TIMEOUT_MS` (`.env`, optional) sets how long the pool waits for a connection; blank = 1000 ms. Raise it only on a loaded test machine; the gate sets 10000 by itself.

`DB_TX_MAX_WAIT_MS` (`.env`, optional) sets how long a tenant transaction (`withTenant`) may wait for a free connection before Prisma gives up with P2028; blank = 2000 ms, the Prisma default. Raise it only on a loaded test machine (CI and the gate set 10000); a caller's explicit `maxWait` is never overridden.

### 5. Start Dev Server
```bash
pnpm dev
# Open http://localhost:3000
# Login: alice@fabrika.local / password
# Dashboard: E10.1 KPI should show real data (6 KPI + seed counts)
```

---

## Doğrulama

- [x] Docker running (docker ps)
- [x] Postgres healthy (pg_isready)
- [x] Migrations applied (pnpm db:migrate)
- [x] Seed counts OK (20 calls, 5 opp, 15 decisions, 10 efforts)
- [x] Dev server runs (pnpm dev)
- [x] Dashboard real data (not in-memory fallback)

---

## Kanıt Dosyası

`docs/agent-results/TASK-MTQ32X4CFRMR5-devops-defne.md`
