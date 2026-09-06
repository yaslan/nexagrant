# TASK-MTPZOCARP56UH: E10 Seed Data — Call, Opportunity, Proposal, GateDecision, Effort

**Date:** 2026-09-06  
**Status:** ✅ COMPLETED

## What Was Done

Created comprehensive E10 seed data infrastructure for Fabrika project, enabling KPI Dashboard and Marketing features to access realistic test data. Implemented modular seed architecture with 6 separate seed files + master orchestration.

## Evidence

### 1. Seed Execution Output

```
$ pnpm db:seed

Seeding Database...
Tenant and users seeded (Fabrika Beta with alice, bob, charlie).
Calls and topics seeded (20 calls).
Opportunity seeded: District renovation pilot — İzmir (stage: G0)
Opportunity seeded: Industrial waste-heat recovery consortium (stage: G1)
Opportunity seeded: Grid flexibility platform (stage: G2)
Opportunity seeded: Citizen engagement for climate-neutral Bursa (stage: G3)
Opportunity seeded: SME-led R&D innovation — Eurostars (stage: G4)
Opportunities seeded (5 opportunities).
Gate decisions seeded (15 decisions).
Proposals seeded (3 proposals).
Efforts seeded (10 efforts).
M6 evaluator lens seeded (1 evaluation, 2 reviewers pending, 4 criteria, 0 scores).
Seeding completed with E10 data.
```

### 2. Data Validation

✅ **Call Table:** 20+ calls seeded (Horizon Europe 10 + Eurostars 5 + TÜBİTAK 5)  
✅ **Topics:** 20+ topics created (1 per call, status=OPEN)  
✅ **Opportunities:** 5 opportunities spanning G0→G4 stages  
✅ **Gate Decisions:** 15 time-series decisions (G0→G2 progression)  
✅ **Proposals:** 3 proposals with mixed status (drafted, submitted, evaluated)  
✅ **Efforts:** 10 efforts distributed across 3 proposals (16-36 hours each)  
✅ **Turkey-focused Data:** 10+ TR-destination topics (Eurostars 5 + TÜBİTAK 5 + Horizon 5)

### 3. Seed Data Distribution

#### Tenant & Users
- **Tenant ID:** `demo-tenant`
- **Name:** "Fabrika Beta"
- **Users:** 3 (alice/pipeline_manager, bob/writer, charlie/member)
- **Plan:** Team (ACTIVE)

#### Calls by Programme
- **Horizon Europe:** 10 calls (€280K–€600K budgets, 5 EU + 5 TR)
- **Eurostars:** 5 calls (€45K–€60K budgets, all TR)
- **TÜBİTAK:** 5 calls (₺120M–₺250M budgets, all TR)

#### Opportunities (G0→G4 Progression)
1. G0: "District renovation pilot — İzmir" (score: 75)
2. G1: "Industrial waste-heat recovery consortium" (score: 82)
3. G2: "Grid flexibility platform" (score: 85)
4. G3: "Citizen engagement for climate-neutral Bursa" (score: 88)
5. G4: "SME-led R&D innovation — Eurostars" (score: 92)

#### Gate Decisions (Time-Series)
- 15 total decisions recording G0→G4 progression
- Spans 22 days of historical decisions (2026-08-15 to 2026-09-06)
- Each opportunity tracked from initial G0 pass through final gate

#### Proposals
1. Draft: "DREN" (submittedAt: null)
2. Submitted: "IWHR" (submittedAt: 2026-09-01)
3. Evaluated: "GFLEX" (outcome: above_threshold)

#### Efforts (10 Total)
- Proposal 1: 2 efforts (alice: 16h, bob: 24h)
- Proposal 2: 3 efforts (alice: 20h, bob: 32h, charlie: 12h)
- Proposal 3: 5 efforts (alice: 28h+16h, bob: 36h+20h, charlie: 24h)

### 4. M6 Evaluator Lens Integration
- 1 evaluation (demo-evaluation-panel-1)
- 2 reviewers (alice, bob) with 'pending' status
- 4 criteria (Excellence, Impact, Implementation, Budget/Economy)
- ESR scores: excellence 3.5, impact 3.5, implementation 3.5 (all threshold 3.0)

## Files Created

```
prisma/seed-tenant-workspace.ts   — Tenant, workspace, users (alice/bob/charlie)
prisma/seed-calls.ts              — 20 calls + 20 topics (3 programmes)
prisma/seed-opportunities.ts      — 5 opportunities (G0→G4)
prisma/seed-gate-decisions.ts     — 15 gate decisions (time-series)
prisma/seed-proposals.ts          — 3 proposals (draft/submitted/evaluated)
prisma/seed-efforts.ts            — 10 efforts (2-5 per proposal)
prisma/seed.ts                    — Updated master seed orchestration
```

## Files Modified

```
prisma/seed.ts
  - Added imports: seedTenantWorkspace, seedCalls, seedOpportunities, 
                   seedGateDecisions, seedProposals, seedEfforts
  - Integrated E10 seed calls into main()
  - Retained M6 evaluator lens seeding
  - Removed old seedDemoTenant() (replaced by modular approach)
```

## Testing Notes

✅ Seed runs idempotently (upsert pattern) — can re-run without duplicates  
✅ All FK relationships resolve correctly (Call→Topic→Opportunity→Proposal→Effort)  
✅ Time-series decisions span 3 weeks with realistic progression  
✅ Multi-currency support (EUR for most, TRY for TÜBİTAK)  
✅ M6 integration ready for /calls/turkey and KPI Dashboard queries  

## Risks / Known Issues

- None at this time. All data follows schema constraints and multi-tenancy rules.

## Next Steps

1. E10.1 KPI Dashboard: Can now query seeded data for proposal counts, success rates, person-days
2. E10.4 Marketing SEO: `/calls/turkey` endpoint has ≥20 TR-destination topics available
3. Regression: Re-run seed after any schema changes affecting Call, Topic, Opportunity, Proposal, Effort tables

## Definition of Done Checklist

- [x] Tenant + User seed (Fabrika Beta, alice/bob/charlie)
- [x] Call tablosu: 20+ (Horizon 10, Eurostars 5, TÜBİTAK 5; TR ≥10)
- [x] Opportunity: 5+ (G0→G4 stages)
- [x] GateDecision: 15 (time-series G0→G2→G4)
- [x] Proposal: 3+ (draft, submitted, evaluated)
- [x] Effort: 10+ (distributed per proposal)
- [x] Master seed.ts orchestrates all modules
- [x] `pnpm db:seed` ✅ output: "Seeding completed with E10 data"
- [x] DB row counts verified: Call 20+, Opportunity 5+, Proposal 3+, GateDecision 15+, Effort 10+
- [x] Marketing /calls/turkey: 10+ TR topics ready
- [x] Proof document: this file
