import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Database...');

  // 1. ModuleCatalog
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

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
