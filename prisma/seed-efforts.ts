import { prisma } from '../src/lib/db';

interface EffortData {
  opportunityIndex: number;
  userId: string;
  hours: number;
  note: string;
}

const TENANT_ID = 'demo-tenant';

// 10+ efforts distributed across 3 proposals
const effortsData: EffortData[] = [
  // Proposal 1 (Opp 1) — 2 efforts
  {
    opportunityIndex: 1,
    userId: 'demo-user-alice',
    hours: 16,
    note: 'Concept Note Draft',
  },
  {
    opportunityIndex: 1,
    userId: 'demo-user-bob',
    hours: 24,
    note: 'Consortium Coordination',
  },

  // Proposal 2 (Opp 2) — 3 efforts
  {
    opportunityIndex: 2,
    userId: 'demo-user-alice',
    hours: 20,
    note: 'Excellence Section',
  },
  {
    opportunityIndex: 2,
    userId: 'demo-user-bob',
    hours: 32,
    note: 'Impact & Implementation',
  },
  {
    opportunityIndex: 2,
    userId: 'demo-user-charlie',
    hours: 12,
    note: 'Document Review',
  },

  // Proposal 3 (Opp 3) — 5 efforts
  {
    opportunityIndex: 3,
    userId: 'demo-user-alice',
    hours: 28,
    note: 'WP Design & Coordination',
  },
  {
    opportunityIndex: 3,
    userId: 'demo-user-bob',
    hours: 36,
    note: 'Technical Specifications',
  },
  {
    opportunityIndex: 3,
    userId: 'demo-user-charlie',
    hours: 24,
    note: 'Partner Contribution Drafting',
  },
  {
    opportunityIndex: 3,
    userId: 'demo-user-alice',
    hours: 16,
    note: 'ESR Score Justification',
  },
  {
    opportunityIndex: 3,
    userId: 'demo-user-bob',
    hours: 20,
    note: 'Final Submission Preparation',
  },
];

export default async function seedEfforts() {
  for (let i = 0; i < effortsData.length; i++) {
    const eData = effortsData[i]!;
    const oppId = `demo-opp-${eData.opportunityIndex}`;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: oppId },
    });
    if (!opportunity) {
      console.warn(`Opportunity not found: ${oppId}`);
      continue;
    }

    const effortId = `demo-effort-${String(i + 1).padStart(2, '0')}`;
    const effortDate = new Date();
    effortDate.setDate(effortDate.getDate() - Math.floor(Math.random() * 14)); // Within last 2 weeks

    await prisma.effort.upsert({
      where: { id: effortId },
      update: {
        hours: eData.hours,
        note: eData.note,
      },
      create: {
        id: effortId,
        tenantId: TENANT_ID,
        opportunityId: opportunity.id,
        userId: eData.userId,
        date: effortDate,
        hours: eData.hours,
        note: eData.note,
      },
    });
  }

  console.log(`Efforts seeded (${effortsData.length} efforts).`);
}
