import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { rescoreOpportunityG0 } from '../src/lib/scoring/g0-compute';
import { DEFAULT_CRITERIA } from '../src/modules/m6/types';
import seedTenantWorkspace from './seed-tenant-workspace';
import seedCalls from './seed-calls';
import seedOpportunities from './seed-opportunities';
import seedGateDecisions from './seed-gate-decisions';
import seedProposals from './seed-proposals';
import seedEfforts from './seed-efforts';
import seedE11Feedback from './seed-e11-feedback';

// Module catalog — also used to derive the demo tenant's ModuleState rows.
const modules = [
  { id: 'M1', key: 'partner_intelligence', name: 'Partner Intelligence Database', version: '1.0', requires: [], recommends: [], planTiers: ['team', 'business', 'enterprise'], addOnSku: null },
  { id: 'M2', key: 'concept_note', name: 'Concept Note Architectures', version: '1.0', requires: [], recommends: ['M3'], planTiers: ['starter', 'team', 'business', 'enterprise'], addOnSku: null },
  { id: 'M3', key: 'evidence_pack', name: 'Evidence Pack', version: '1.0', requires: [], recommends: [], planTiers: ['starter', 'team', 'business', 'enterprise'], addOnSku: null },
  { id: 'M4', key: 'focal_point', name: 'Focal Point', version: '1.0', requires: ['M1'], recommends: [], planTiers: ['team', 'business', 'enterprise'], addOnSku: null },
  { id: 'M5', key: 'proposal_workflows', name: 'Proposal Production Workflows', version: '1.0', requires: [], recommends: [], planTiers: ['starter', 'team', 'business', 'enterprise'], addOnSku: null },
  { id: 'M6', key: 'evaluator_lens', name: 'Evaluator Lens', version: '1.1', requires: ['M2', 'M11'], recommends: [], planTiers: ['business', 'enterprise'], addOnSku: 'addon_m6' },
  { id: 'M7', key: 'tto_accelerator', name: 'TTO Accelerator', version: '1.3', requires: ['M1', 'M4'], recommends: [], planTiers: ['enterprise'], addOnSku: 'addon_m7' },
  { id: 'M8', key: 'consortium_matching', name: 'Consortium Matching', version: '1.0', requires: ['M1'], recommends: ['M4'], planTiers: ['team', 'business', 'enterprise'], addOnSku: 'addon_m8_pro' },
  { id: 'M9', key: 'meeting_briefs', name: 'Meeting Briefs', version: '1.1', requires: ['M1', 'M4'], recommends: [], planTiers: ['business', 'enterprise'], addOnSku: null },
  { id: 'M10', key: 'followup_docs', name: 'Follow-up Documents', version: '1.2', requires: ['M4'], recommends: ['M9'], planTiers: ['business', 'enterprise'], addOnSku: null },
  { id: 'M11', key: 'full_app_production', name: 'Full Application Production', version: '1.2', requires: ['M2', 'M3', 'M5', 'M8'], recommends: [], planTiers: ['business', 'enterprise'], addOnSku: 'addon_m11' },
];

/**
 * G0 evidence for the demo tenant — TASK-MTQW90XSQ1SU1.
 *
 * `seedOpportunities()` links demo-opp-1..5 to five real imported Horizon Europe topics
 * (demo-topic-1/2/3/5/6). Those topics already carry a real budget and lump-sum/two-stage flags,
 * but every other G0 input was empty for this tenant: no `TopicMatch` (K1), no `TopicStat` (K3),
 * no `ConsortiumSeat`. `extractG0Features()` correctly reports each of those as `missing` rather
 * than guessing, so every opportunity capped at `budgetRoleEconomy`(10) + `lumpSumTwoStage`(8) =
 * 18/100 and the G0 gate (threshold 70) was mathematically unreachable for any opportunity — not
 * a scoring bug, an evidence gap (see `.agentspace/memory/shared/fabrika-g0-score-never-computed.md`).
 *
 * This seeds three of the missing sources with numbers a K1 matcher / K3 import / consortium
 * builder would plausibly produce for these five topics:
 *
 *   - `TopicMatch.fitScore` (K1 topic↔tenant alignment, weight 30) — a real fitScore, not the
 *     `g0ScorerPlaceholderFitScore` write `persistG0` makes, so `loadG0Snapshot` reads it as
 *     `measured` evidence instead of the placeholder-laundering bug described in
 *     `fabrika-g0-evidence-placeholder-laundering`.
 *   - `TopicStat.successRate` (K3 Horizon Dashboard import, weight 15), one row per topic-family
 *     prefix, `country: null` (family-wide average — how K3 stores it for topics that have not
 *     closed yet). Values are demo baseline figures (`source: 'seed-demo-g0-evidence'`), NOT a
 *     real Horizon Dashboard import — grounded in the ~16% Horizon-Europe-wide average documented
 *     next to `BASE_RATE_FULL_MARKS_PCT` in `g0-canonical.ts`, varied per call family the way real
 *     success rates vary (a Missions call runs more competitive than a Cluster call).
 *   - `ConsortiumSeat` rows (feeds `researchAndEndUser`, weight 12) — who is actually being
 *     pursued for the consortium, not a rate or a score.
 *
 * `coordinatorHistory` (15) and `networkCentrality` (10) stay unseeded on purpose: both read
 * `CordisParticipation` keyed by `Tenant.pic`, and this database holds zero `CordisOrganization`
 * / `CordisParticipation` rows — there is nothing real to seed evidence *from*. Without those two
 * features the reachable ceiling is 30+15+12+10+8 = 75/100, so a well-aligned, well-evidenced
 * opportunity can still land under the 70 threshold; that gap is reported, not patched, in
 * `docs/agent-results/TASK-MTQW90XSQ1SU1-ex-en.md`.
 */
async function seedG0DemoEvidence() {
  const TENANT_ID = 'demo-tenant';

  // K1 — alignment (weight 30). Scores vary by how closely each topic's scope matches the
  // renovation/energy-performance capability the demo tenant's other seed data implies.
  const topicMatches: { topicId: string; fitScore: number; note: string }[] = [
    { topicId: 'demo-topic-1', fitScore: 92, note: 'strong overlap: building renovation, energy performance, smart buildings' },
    { topicId: 'demo-topic-2', fitScore: 55, note: 'partial overlap: industrial process heat is adjacent to, not core to, tenant capability' },
    { topicId: 'demo-topic-3', fitScore: 81, note: 'strong overlap: data platforms, whole-life-carbon assessment tooling' },
    { topicId: 'demo-topic-5', fitScore: 38, note: 'weak overlap: citizen engagement / participatory governance sits outside tenant capability' },
    { topicId: 'demo-topic-6', fitScore: 68, note: 'moderate overlap: maintenance/repair is adjacent to renovation, not a core keyword match' },
  ];
  for (const m of topicMatches) {
    const breakdown = {
      method: 'k1-keyword-cosine-mock',
      note: `seed demo K1 match (TASK-MTQW90XSQ1SU1) — ${m.note}`,
    };
    await prisma.topicMatch.upsert({
      where: { tenantId_topicId: { tenantId: TENANT_ID, topicId: m.topicId } },
      update: { fitScore: m.fitScore, breakdown },
      create: { tenantId: TENANT_ID, topicId: m.topicId, fitScore: m.fitScore, breakdown },
    });
  }

  // K3 — base rate (weight 15). One row per topic-family prefix; successRate is derived from
  // proposals/funded rather than typed as a bare percentage, so the two numbers stay consistent.
  const topicStats: { id: string; topicPrefix: string; proposals: number; funded: number }[] = [
    { id: 'demo-stat-cl5-2026-09-d4', topicPrefix: 'HORIZON-CL5-2026-09-D4', proposals: 230, funded: 44 }, // 19.13%
    { id: 'demo-stat-miss-2026-04-cit', topicPrefix: 'HORIZON-MISS-2026-04-CIT', proposals: 185, funded: 12 }, // 6.49% — below the 8% hard rule
    { id: 'demo-stat-neb-2026-01-regen', topicPrefix: 'HORIZON-NEB-2026-01-REGEN', proposals: 142, funded: 15 }, // 10.56%
  ];
  for (const s of topicStats) {
    const successRate = Math.round((s.funded / s.proposals) * 10000) / 100;
    const data = {
      topicPrefix: s.topicPrefix,
      country: null,
      proposals: s.proposals,
      funded: s.funded,
      successRate,
      source: 'seed-demo-g0-evidence',
    };
    await prisma.topicStat.upsert({ where: { id: s.id }, update: data, create: { id: s.id, ...data } });
  }

  // Consortium seats (weight 12) — deliberately partial: opp-1 has both roles, opp-3 and opp-5
  // have one each, opp-2 and opp-4 have none, so `researchAndEndUser` itself stays differentiated.
  const seats: { id: string; opportunityId: string; roleKey: string }[] = [
    { id: 'demo-seat-opp1-research', opportunityId: 'demo-opp-1', roleKey: 'research' },
    { id: 'demo-seat-opp1-end-user', opportunityId: 'demo-opp-1', roleKey: 'end_user' },
    { id: 'demo-seat-opp3-research', opportunityId: 'demo-opp-3', roleKey: 'research' },
    { id: 'demo-seat-opp5-end-user', opportunityId: 'demo-opp-5', roleKey: 'end_user' },
  ];
  for (const s of seats) {
    const data = { tenantId: TENANT_ID, opportunityId: s.opportunityId, roleKey: s.roleKey, required: true, status: 'CONFIRMED' };
    await prisma.consortiumSeat.upsert({ where: { id: s.id }, update: data, create: { id: s.id, ...data } });
  }

  // `seedOpportunities()` already scored each opportunity before this evidence existed (18/100,
  // unscorable evidence). Rescore now so `Opportunity.g0Score` reflects the evidence just written
  // instead of the stale pre-evidence number.
  console.log('G0 evidence seeded for demo tenant — rescoring:');
  for (const oppId of ['demo-opp-1', 'demo-opp-2', 'demo-opp-3', 'demo-opp-4', 'demo-opp-5']) {
    const scored = await rescoreOpportunityG0(TENANT_ID, oppId);
    const label =
      scored?.score === null || scored?.score === undefined
        ? 'unscored (no evidence)'
        : `G0 ${scored.score} → ${scored.decision} (${Math.round(scored.coverage * 100)}% evidence coverage)`;
    console.log(`  ${oppId}: ${label}`);
  }
}

async function main() {
  console.log('Seeding Database...');

  // 1. ModuleCatalog

  for (const m of modules) {
    await prisma.moduleCatalog.upsert({
      where: { key: m.key },
      update: m,
      create: m,
    });
  }

  // 2. Plan
  const plans = [
    { id: 'free', name: 'Discover', monthlyCents: 0, yearlyCents: 0, currency: 'EUR', seats: 1, workspaces: 1, aiCreditsMonthly: 10, modules: ['M3', 'M5'] },
    { id: 'starter', name: 'Starter', monthlyCents: 5900, yearlyCents: 56600, currency: 'EUR', seats: 2, workspaces: 1, aiCreditsMonthly: 100, modules: ['M3', 'M5', 'M2'] },
    { id: 'team', name: 'Team', monthlyCents: 24900, yearlyCents: 239000, currency: 'EUR', seats: 6, workspaces: 1, aiCreditsMonthly: 500, modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'] },
    { id: 'business', name: 'Business', monthlyCents: 59900, yearlyCents: 575000, currency: 'EUR', seats: 15, workspaces: 5, aiCreditsMonthly: 2000, modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8', 'M6', 'M9', 'M10', 'M11'] },
    { id: 'enterprise', name: 'Enterprise', monthlyCents: 150000, yearlyCents: 1440000, currency: 'EUR', seats: 999, workspaces: 999, aiCreditsMonthly: 10000, modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'] },
  ];

  for (const p of plans) {
    await prisma.plan.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }

  // 3. AddOnCatalog
  const addOns = [
    { sku: 'addon_m6', name: 'Evaluator Lens', monthlyCents: 9900, oneTimeCents: null, currency: 'EUR', grantsModule: 'M6', grantsSeats: 0, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_m11', name: 'Full Application', monthlyCents: 14900, oneTimeCents: null, currency: 'EUR', grantsModule: 'M11', grantsSeats: 0, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_m7', name: 'TTO Accelerator', monthlyCents: 12900, oneTimeCents: null, currency: 'EUR', grantsModule: 'M7', grantsSeats: 0, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_m8_pro', name: 'Consortium Matching Pro', monthlyCents: 7900, oneTimeCents: null, currency: 'EUR', grantsModule: 'M8', grantsSeats: 0, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_workspace', name: 'Extra Workspace', monthlyCents: 4900, oneTimeCents: null, currency: 'EUR', grantsModule: null, grantsSeats: 0, grantsCredits: 0, grantsWorkspaces: 1 },
    { sku: 'addon_seat_starter', name: 'Extra Seat (Starter)', monthlyCents: 1900, oneTimeCents: null, currency: 'EUR', grantsModule: null, grantsSeats: 1, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_seat_team', name: 'Extra Seat (Team)', monthlyCents: 2900, oneTimeCents: null, currency: 'EUR', grantsModule: null, grantsSeats: 1, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_seat_business', name: 'Extra Seat (Business)', monthlyCents: 3900, oneTimeCents: null, currency: 'EUR', grantsModule: null, grantsSeats: 1, grantsCredits: 0, grantsWorkspaces: 0 },
    { sku: 'addon_credits_250', name: '250 AI Credits', monthlyCents: null, oneTimeCents: 4900, currency: 'EUR', grantsModule: null, grantsSeats: 0, grantsCredits: 250, grantsWorkspaces: 0 },
  ];

  for (const a of addOns) {
    await prisma.addOnCatalog.upsert({
      where: { sku: a.sku },
      update: a,
      create: a,
    });
  }

  // 4. Programme
  const programmes = [
    { id: 'HE', name: 'Horizon Europe', sourceKey: 'horizon' },
    { id: 'DEP', name: 'Digital Europe', sourceKey: 'digital' },
    { id: 'EUROSTARS', name: 'Eurostars', sourceKey: 'eurostars' },
    { id: 'EUREKA', name: 'Eureka', sourceKey: 'eureka' },
    { id: 'CETP', name: 'CETPartnership', sourceKey: 'cetp' },
    { id: 'DUT', name: 'DUT Partnership', sourceKey: 'dut' },
    { id: 'ERASMUS', name: 'Erasmus+', sourceKey: 'erasmus' },
    { id: 'EIT', name: 'EIT', sourceKey: 'eit' },
    { id: 'TUBITAK', name: 'TÜBİTAK', sourceKey: 'tubitak' },
  ];

  for (const p of programmes) {
    await prisma.programme.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }

  // 5. ConceptTemplates (E8)
  const conceptTemplates = [
    { key: 'cetp_pre', name: 'CETPartnership Pre-proposal', version: '1.0', schema: [
      { key: 'excellence', labelKey: 'Excellence', maxWords: 1000, promptKey: 'Write the excellence section focusing on objectives.' },
      { key: 'impact', labelKey: 'Impact', maxWords: 1000, promptKey: 'Write the impact section focusing on outcomes.' },
      { key: 'implementation', labelKey: 'Implementation', maxWords: 1000, promptKey: 'Write the implementation section.' }
    ]},
    { key: 'dut_pre', name: 'DUT Pre-proposal', version: '1.0', schema: [
      { key: 'relevance', labelKey: 'Relevance', maxWords: 1500, promptKey: 'Address the DUT call topics.' },
      { key: 'impact', labelKey: 'Impact', maxWords: 1000, promptKey: 'Detail the expected impact.' },
      { key: 'implementation', labelKey: 'Implementation', maxWords: 500, promptKey: 'Summarize the implementation plan.' }
    ]},
    { key: 'eurostars_summary', name: 'Eurostars Summary', version: '1.0', schema: [
      { key: 'project_description', labelKey: 'Project Description', maxWords: 500, promptKey: 'Describe the project and its goals.' },
      { key: 'market_potential', labelKey: 'Market Potential', maxWords: 500, promptKey: 'Analyze the market potential and business case.' }
    ]},
    { key: 'he_stage1_blind', name: 'Horizon Europe Stage 1 (Blind)', version: '1.0', schema: [
      { key: 'excellence', labelKey: 'Excellence (Part A)', maxWords: 4000, promptKey: 'Write the excellence section anonymously (no partner names).' },
      { key: 'impact', labelKey: 'Impact (Part B)', maxWords: 4000, promptKey: 'Write the impact section anonymously.' }
    ]},
    { key: 'eic_step1', name: 'EIC Accelerator Step 1', version: '1.0', schema: [
      { key: 'innovation', labelKey: 'Innovation & Market', maxWords: 1000, promptKey: 'Describe the breakthrough innovation and market.' },
      { key: 'team', labelKey: 'Team', maxWords: 500, promptKey: 'Describe the founding team.' }
    ]},
    { key: 'hopon', name: 'Hop-on Facility', version: '1.0', schema: [
      { key: 'excellence', labelKey: 'Excellence', maxWords: 1000, promptKey: 'Explain how the new partner adds value.' },
      { key: 'implementation', labelKey: 'Implementation', maxWords: 1000, promptKey: 'Detail the work packages for the new partner.' }
    ]},
    { key: 'generic', name: 'Generic Concept Note', version: '1.0', schema: [
      { key: 'summary', labelKey: 'Executive Summary', maxWords: 500, promptKey: 'Provide an executive summary of the project.' },
      { key: 'objectives', labelKey: 'Objectives', maxWords: 1000, promptKey: 'List the main objectives.' },
      { key: 'impact', labelKey: 'Expected Impact', maxWords: 1000, promptKey: 'Describe the expected impact.' }
    ]}
  ];

  for (const t of conceptTemplates) {
    const existing = await prisma.conceptTemplate.findFirst({ where: { key: t.key } });
    if (existing) {
      await prisma.conceptTemplate.update({ where: { id: existing.id }, data: { name: t.name, schema: t.schema, version: t.version } });
    } else {
      await prisma.conceptTemplate.create({ data: t });
    }
  }

  // E10 Seed Data
  await seedTenantWorkspace();
  await seedCalls();
  await seedOpportunities();
  await seedG0DemoEvidence();
  await seedGateDecisions();
  await seedProposals();
  await seedEfforts();
  await seedM6EvaluatorLens();

  // E11.2 Feedback
  await seedE11Feedback();

  console.log('Seeding completed with E10 data.');
}

/**
 * M6 Evaluator Lens panel — DEVELOPMENT ONLY (TASK-MTPZH6T9L6E2E).
 *
 * Layers a panel evaluation onto rows the E10 seed already created:
 * demo-proposal-3 (GFLEX, on demo-opp-3) reviewed by alice and bob.
 * Every write is keyed on a deterministic id and upserted, so running the
 * seed twice updates the same rows instead of creating duplicates.
 *
 * Seeded state: 1 evaluation (draft) / 2 reviewers (both pending) / 4 criteria / 0 scores.
 */
async function seedM6EvaluatorLens() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping M6 evaluator lens seed (NODE_ENV=production).');
    return;
  }

  const TENANT_ID = 'demo-tenant';
  const PROPOSAL_ID = 'demo-proposal-3'; // GFLEX — HORIZON-CL5 grid flexibility platform
  const OPPORTUNITY_ID = 'demo-opp-3';
  const EVALUATION_ID = 'demo-evaluation-panel-1';

  const proposal = await prisma.proposal.findUnique({ where: { id: PROPOSAL_ID } });
  if (!proposal) {
    console.log('Skipping M6 evaluator lens seed (demo-proposal-3 not found).');
    return;
  }

  // Official ESR marks, 0-5 per criterion. M6.3 compares the panel score against `total`.
  // Only filled in when absent, so a hand-edited ESR record is never overwritten.
  if (!proposal.esrScores) {
    await prisma.proposal.update({
      where: { id: PROPOSAL_ID },
      data: { esrScores: { excellence: 3.5, impact: 3.5, implementation: 3.5, total: 3.5, threshold: 3.0 } },
    });
  }

  const evaluationData = {
    tenantId: TENANT_ID,
    opportunityId: OPPORTUNITY_ID,
    proposalId: PROPOSAL_ID,
    userId: 'demo-user-alice',
    readerType: 'PANEL',
    status: 'draft', // no reviewer has submitted yet
    avgScore: null,
  };
  await prisma.evaluation.upsert({
    where: { id: EVALUATION_ID },
    update: evaluationData,
    create: { id: EVALUATION_ID, ...evaluationData },
  });

  const panelReviewers = [
    { id: 'demo-reviewer-alice', userId: 'demo-user-alice', role: 'evaluator' },
    { id: 'demo-reviewer-bob', userId: 'demo-user-bob', role: 'coordinator' },
  ];
  for (const r of panelReviewers) {
    const data = { tenantId: TENANT_ID, evaluationId: EVALUATION_ID, userId: r.userId, role: r.role, status: 'pending' };
    await prisma.reviewer.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } });
  }

  for (const c of DEFAULT_CRITERIA) {
    const id = `demo-criterion-${c.name.toLowerCase()}`;
    const data = { tenantId: TENANT_ID, evaluationId: EVALUATION_ID, name: c.name, weight: c.weight, order: c.order };
    await prisma.criterion.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  console.log('M6 evaluator lens seeded (1 evaluation, 2 reviewers pending, 4 criteria, 0 scores).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
