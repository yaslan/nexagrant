/**
 * Seed script for ConceptTemplate records.
 * 
 * Run with: npx tsx prisma/seed-templates.ts
 * 
 * These are the 7 templates defined in the ROADMAP.
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const templates = [
  {
    key: 'he_stage1_blind',
    name: 'Horizon Europe – Stage 1 (Blind Evaluation)',
    version: '1.0',
    schema: {
      sections: [
        { key: 'excellence', labelKey: 'Excellence', maxWords: 2000, promptKey: 'excellence' },
        { key: 'impact', labelKey: 'Impact', maxWords: 1500, promptKey: 'impact' },
        { key: 'implementation', labelKey: 'Implementation', maxWords: 1500, promptKey: 'implementation' },
      ],
    },
  },
  {
    key: 'cetp_pre',
    name: 'Clean Energy Transition Partnership – Pre-proposal',
    version: '1.0',
    schema: {
      sections: [
        { key: 'summary', labelKey: 'Project Summary', maxWords: 500, promptKey: 'summary' },
        { key: 'objectives', labelKey: 'Objectives & Ambition', maxWords: 1000, promptKey: 'objectives' },
        { key: 'methodology', labelKey: 'Methodology', maxWords: 1200, promptKey: 'methodology' },
        { key: 'impact', labelKey: 'Expected Impact', maxWords: 800, promptKey: 'impact' },
      ],
    },
  },
  {
    key: 'dut_pre',
    name: 'Driving Urban Transitions – Pre-proposal',
    version: '1.0',
    schema: {
      sections: [
        { key: 'challenge', labelKey: 'Urban Challenge', maxWords: 600, promptKey: 'challenge' },
        { key: 'solution', labelKey: 'Proposed Solution', maxWords: 1000, promptKey: 'solution' },
        { key: 'consortium', labelKey: 'Consortium & Work Plan', maxWords: 800, promptKey: 'consortium' },
      ],
    },
  },
  {
    key: 'eurostars_summary',
    name: 'Eurostars – Project Summary',
    version: '1.0',
    schema: {
      sections: [
        { key: 'abstract', labelKey: 'Abstract', maxWords: 300, promptKey: 'abstract' },
        { key: 'innovation', labelKey: 'Innovation & Market', maxWords: 800, promptKey: 'innovation' },
        { key: 'workplan', labelKey: 'Work Plan', maxWords: 600, promptKey: 'workplan' },
      ],
    },
  },
  {
    key: 'eic_step1',
    name: 'EIC Accelerator – Step 1 (Short Application)',
    version: '1.0',
    schema: {
      sections: [
        { key: 'problem', labelKey: 'Problem & Solution', maxWords: 500, promptKey: 'problem' },
        { key: 'market', labelKey: 'Market Opportunity', maxWords: 500, promptKey: 'market' },
        { key: 'team', labelKey: 'Team & Capabilities', maxWords: 400, promptKey: 'team' },
        { key: 'funding', labelKey: 'Funding Needs', maxWords: 300, promptKey: 'funding' },
      ],
    },
  },
  {
    key: 'hopon',
    name: 'Hop-On Facility',
    version: '1.0',
    schema: {
      sections: [
        { key: 'justification', labelKey: 'Justification for Joining', maxWords: 800, promptKey: 'justification' },
        { key: 'contribution', labelKey: 'Expected Contribution', maxWords: 600, promptKey: 'contribution' },
        { key: 'capacity', labelKey: 'Capacity Building', maxWords: 400, promptKey: 'capacity' },
      ],
    },
  },
  {
    key: 'tubitak_1071',
    name: 'TÜBİTAK 1071 – Uluslararası Destek',
    version: '1.0',
    schema: {
      sections: [
        { key: 'ozet', labelKey: 'Proje Özeti', maxWords: 500, promptKey: 'ozet' },
        { key: 'amac', labelKey: 'Amaç ve Hedefler', maxWords: 800, promptKey: 'amac' },
        { key: 'yontem', labelKey: 'Yöntem', maxWords: 1000, promptKey: 'yontem' },
        { key: 'beklenen_etki', labelKey: 'Beklenen Etki', maxWords: 600, promptKey: 'beklenen_etki' },
      ],
    },
  },
];

async function main() {
  console.log('Seeding ConceptTemplate records...');

  for (const t of templates) {
    await prisma.conceptTemplate.upsert({
      where: { id: t.key }, // using key as id for simplicity
      update: { name: t.name, schema: t.schema, version: t.version },
      create: { id: t.key, key: t.key, name: t.name, schema: t.schema, version: t.version },
    });
    console.log(`  ✓ ${t.key}`);
  }

  console.log('Done. 7 templates seeded.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
