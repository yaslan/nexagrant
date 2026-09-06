import 'dotenv/config';
import { prisma } from '../src/lib/db';

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

  await seedDemoTenant();

  console.log('Seeding completed.');
}

/**
 * 6. Demo tenant — DEVELOPMENT ONLY (prisma/seed.md §6).
 * Every write is keyed on a deterministic `demo-*` id so the block is idempotent:
 * running the seed twice updates the same rows instead of creating duplicates.
 */
async function seedDemoTenant() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping demo tenant (NODE_ENV=production).');
    return;
  }

  const TENANT_ID = 'demo-tenant';
  const WORKSPACE_ID = 'demo-workspace';

  const tenant = {
    name: 'Demo KOBİ',
    slug: 'demo-kobi',
    country: 'TR',
    orgType: 'SME' as const,
    locale: 'tr',
    timezone: 'Europe/Istanbul',
  };
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: tenant,
    create: { id: TENANT_ID, ...tenant },
  });

  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: { name: 'Ana Çalışma Alanı' },
    create: { id: WORKSPACE_ID, tenantId: TENANT_ID, name: 'Ana Çalışma Alanı', slug: 'main' },
  });

  // 3 users with distinct roles
  const demoUsers = [
    { id: 'demo-user-owner', email: 'owner@demo.fabrika.test', name: 'Demo Owner', role: 'TENANT_OWNER' as const },
    { id: 'demo-user-manager', email: 'manager@demo.fabrika.test', name: 'Demo Pipeline Manager', role: 'PIPELINE_MANAGER' as const },
    { id: 'demo-user-writer', email: 'writer@demo.fabrika.test', name: 'Demo Writer', role: 'WRITER' as const },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, locale: 'tr' },
      create: { id: u.id, email: u.email, name: u.name, locale: 'tr' },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT_ID, userId: u.id } },
      update: { role: u.role },
      create: { tenantId: TENANT_ID, userId: u.id, role: u.role },
    });
  }

  // Team plan subscription + module states (M1–M5 + M8 ON, rest OFF)
  await prisma.subscription.upsert({
    where: { tenantId: TENANT_ID },
    update: { planId: 'team', status: 'ACTIVE' },
    create: { tenantId: TENANT_ID, planId: 'team', status: 'ACTIVE', billingInterval: 'month' },
  });

  const onModules = ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'];
  for (const m of modules) {
    const status = onModules.includes(m.id) ? 'ON' : 'OFF';
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: m.id } },
      update: { status },
      create: { tenantId: TENANT_ID, moduleId: m.id, status },
    });
  }

  // Calls + topics referenced by the demo opportunities
  await prisma.call.upsert({
    where: { callIdentifier: 'HORIZON-CL5-2026-09' },
    update: { title: 'Horizon Europe Cluster 5 — 2026 Calls' },
    create: {
      id: 'demo-call-cl5',
      programmeId: 'HE',
      callIdentifier: 'HORIZON-CL5-2026-09',
      title: 'Horizon Europe Cluster 5 — 2026 Calls',
      openDate: new Date('2026-05-06T00:00:00Z'),
    },
  });
  await prisma.call.upsert({
    where: { callIdentifier: 'HORIZON-MISS-2026-04' },
    update: { title: 'Horizon Europe Missions — 2026 Calls' },
    create: {
      id: 'demo-call-miss',
      programmeId: 'HE',
      callIdentifier: 'HORIZON-MISS-2026-04',
      title: 'Horizon Europe Missions — 2026 Calls',
      openDate: new Date('2026-04-15T00:00:00Z'),
    },
  });

  const demoTopics = [
    { id: 'demo-topic-1', callId: 'demo-call-cl5', identifier: 'HORIZON-CL5-2026-09-D4-01', title: 'Energy-efficient building renovation at district scale', deadline: '2026-09-15T17:00:00Z' },
    { id: 'demo-topic-2', callId: 'demo-call-cl5', identifier: 'HORIZON-CL5-2026-09-D4-02', title: 'Industrial heat decarbonisation pilots', deadline: '2026-09-15T17:00:00Z' },
    { id: 'demo-topic-3', callId: 'demo-call-cl5', identifier: 'HORIZON-CL5-2026-09-D4-03', title: 'Smart grid flexibility for renewables', deadline: '2026-09-15T17:00:00Z' },
    { id: 'demo-topic-4', callId: 'demo-call-cl5', identifier: 'HORIZON-CL5-2026-09-D4-04', title: 'Circular construction materials', deadline: '2026-09-15T17:00:00Z' },
    { id: 'demo-topic-5', callId: 'demo-call-miss', identifier: 'HORIZON-MISS-2026-04-CIT-02', title: 'Climate-neutral cities: citizen engagement', deadline: '2026-04-22T17:00:00Z' },
    { id: 'demo-topic-6', callId: 'demo-call-miss', identifier: 'HORIZON-NEB-2026-01-REGEN-02', title: 'New European Bauhaus: regenerative neighbourhoods', deadline: '2026-01-28T17:00:00Z' },
  ];
  for (const t of demoTopics) {
    const data = {
      callId: t.callId,
      title: t.title,
      status: 'FORTHCOMING' as const,
      typeOfAction: 'IA',
      isTwoStage: false,
      deadlines: [{ stage: 1, at: t.deadline, tz: 'Europe/Brussels' }],
      nextDeadlineAt: new Date(t.deadline),
      keywords: ['energy', 'climate', 'urban'],
    };
    await prisma.topic.upsert({
      where: { identifier: t.identifier },
      update: data,
      create: { id: t.id, identifier: t.identifier, ...data },
    });
  }

  // 5 opportunities spanning gates G0–G3
  const demoOpps = [
    { id: 'demo-opp-1', topicId: 'demo-topic-1', title: 'District renovation pilot — İzmir', stage: 'G0' as const, g0Score: 0.42 },
    { id: 'demo-opp-2', topicId: 'demo-topic-2', title: 'Industrial waste-heat recovery consortium', stage: 'G1' as const, g0Score: 0.61 },
    { id: 'demo-opp-3', topicId: 'demo-topic-3', title: 'Grid flexibility platform', stage: 'G2' as const, g0Score: 0.74 },
    { id: 'demo-opp-4', topicId: 'demo-topic-5', title: 'Citizen engagement for climate-neutral Bursa', stage: 'G3' as const, g0Score: 0.81 },
    { id: 'demo-opp-5', topicId: 'demo-topic-6', title: 'Regenerative neighbourhood design', stage: 'G1' as const, g0Score: 0.55 },
  ];
  for (const o of demoOpps) {
    const data = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      topicId: o.topicId,
      title: o.title,
      stage: o.stage,
      status: 'ACTIVE' as const,
      intendedRole: 'partner',
      ownerId: 'demo-user-manager',
      g0Score: o.g0Score,
    };
    await prisma.opportunity.upsert({ where: { id: o.id }, update: data, create: { id: o.id, ...data } });
  }

  // Gate decisions: one recorded pass per gate the opportunity has already cleared
  const gateOrder = ['G0', 'G1', 'G2', 'G3'] as const;
  for (const o of demoOpps) {
    const reached = gateOrder.indexOf(o.stage);
    for (let i = 0; i <= reached; i++) {
      const gate = gateOrder[i]!;
      const id = `${o.id}-${gate.toLowerCase()}`;
      const data = {
        tenantId: TENANT_ID,
        opportunityId: o.id,
        gate,
        passed: true,
        inputs: { score: o.g0Score, source: 'seed' },
        ruleVersion: '1.0',
        decidedBy: 'demo-user-manager',
      };
      await prisma.gateDecision.upsert({ where: { id }, update: data, create: { id, ...data } });
    }
  }

  // 20 evidence records across the eight categories
  const evidenceKinds = ['corporate', 'financial', 'certificate', 'infrastructure', 'performance', 'ethics', 'partner', 'personnel'];
  for (let i = 1; i <= 20; i++) {
    const id = `demo-evidence-${String(i).padStart(2, '0')}`;
    const kind = evidenceKinds[(i - 1) % evidenceKinds.length]!;
    const data = {
      tenantId: TENANT_ID,
      kind,
      category: `CAT-0${((i - 1) % 8) + 1}`,
      title: `Demo evidence ${i} (${kind})`,
      body: `Seeded ${kind} evidence record #${i} for the demo tenant. Replace with real documents before any customer demo.`,
      language: 'tr',
      status: 'VALID',
      confidentiality: 'INTERNAL',
      createdBy: 'seed',
    };
    await prisma.evidence.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // 6 relationships with varying warmth
  const warmths = ['cold', 'warm', 'hot', 'active', 'warm', 'cold'];
  for (let i = 1; i <= 6; i++) {
    const id = `demo-relationship-${i}`;
    const data = {
      tenantId: TENANT_ID,
      kind: i % 2 === 0 ? 'partner' : 'ncp',
      ownerUserId: 'demo-user-manager',
      counterpartName: `Demo Counterpart ${i}`,
      counterpartEmail: `contact${i}@partner.demo.test`,
      warmth: warmths[i - 1]!,
      nextStep: 'Follow-up call',
    };
    await prisma.relationship.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  console.log('Demo tenant seeded (3 users, 5 opportunities, 20 evidence, 6 relationships).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
