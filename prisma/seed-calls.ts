import { prisma } from '../src/lib/db';

interface CallData {
  callIdentifier: string;
  title: string;
  budgetCents: bigint;
  currency: string;
  destination: string; // Used as country proxy
  deadline: string;
  programme: string;
  topicIdentifier: string;
}

const callsData: CallData[] = [
  // Horizon Europe (10) — mix EU/TR
  {
    callIdentifier: 'HORIZON-CL5-2026-D4',
    title: 'Innovation Ecosystems',
    budgetCents: BigInt(500_000_00),
    currency: 'EUR',
    destination: 'EU',
    deadline: '2026-10-15T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-CL5-2026-D4-01',
  },
  {
    callIdentifier: 'HORIZON-CL6-2026-D3',
    title: 'Digital & Industry 4.0',
    budgetCents: BigInt(350_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-09-30T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-CL6-2026-D3-01',
  },
  {
    callIdentifier: 'HORIZON-CL2-2026-D1',
    title: 'Health & Wellbeing',
    budgetCents: BigInt(400_000_00),
    currency: 'EUR',
    destination: 'EU',
    deadline: '2026-11-15T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-CL2-2026-D1-01',
  },
  {
    callIdentifier: 'HORIZON-FOOD-2026-01',
    title: 'Food Systems & Circular Economy',
    budgetCents: BigInt(280_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-10-22T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-FOOD-2026-01-01',
  },
  {
    callIdentifier: 'HORIZON-GEO-2026-02',
    title: 'Green Deal & Climate',
    budgetCents: BigInt(450_000_00),
    currency: 'EUR',
    destination: 'EU',
    deadline: '2026-12-01T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-GEO-2026-02-01',
  },
  {
    callIdentifier: 'HORIZON-MSCA-2026-01',
    title: 'Marie Skłodowska-Curie Doctoral Networks',
    budgetCents: BigInt(320_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-09-20T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-MSCA-2026-01-01',
  },
  {
    callIdentifier: 'HORIZON-INFRA-2026-01',
    title: 'Research Infrastructures',
    budgetCents: BigInt(500_000_00),
    currency: 'EUR',
    destination: 'EU',
    deadline: '2026-11-30T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-INFRA-2026-01-01',
  },
  {
    callIdentifier: 'HORIZON-DIGITAL-2026-01',
    title: 'Digital Europe Programme',
    budgetCents: BigInt(350_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-10-10T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-DIGITAL-2026-01-01',
  },
  {
    callIdentifier: 'HORIZON-EIC-2026-01',
    title: 'EIC Accelerator & Pathfinder',
    budgetCents: BigInt(600_000_00),
    currency: 'EUR',
    destination: 'EU',
    deadline: '2026-11-20T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-EIC-2026-01-01',
  },
  {
    callIdentifier: 'HORIZON-CLUSTER1-2026-01',
    title: 'Cluster 1 — Health Bioeconomy',
    budgetCents: BigInt(480_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-09-15T17:00:00Z',
    programme: 'HE',
    topicIdentifier: 'HORIZON-CLUSTER1-2026-01-01',
  },

  // Eurostars (5) — all TR
  {
    callIdentifier: 'EUROSTARS-2026-01',
    title: 'R&D & Innovation Projects',
    budgetCents: BigInt(50_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-11-01T17:00:00Z',
    programme: 'EUROSTARS',
    topicIdentifier: 'EUROSTARS-2026-01-01',
  },
  {
    callIdentifier: 'EUROSTARS-2026-02',
    title: 'Joint Transnational Projects',
    budgetCents: BigInt(45_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-10-15T17:00:00Z',
    programme: 'EUROSTARS',
    topicIdentifier: 'EUROSTARS-2026-02-01',
  },
  {
    callIdentifier: 'EUROSTARS-2026-03',
    title: 'SME Technology Transfer',
    budgetCents: BigInt(60_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-12-10T17:00:00Z',
    programme: 'EUROSTARS',
    topicIdentifier: 'EUROSTARS-2026-03-01',
  },
  {
    callIdentifier: 'EUROSTARS-2026-04',
    title: 'Cross-border Partnerships',
    budgetCents: BigInt(55_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-11-25T17:00:00Z',
    programme: 'EUROSTARS',
    topicIdentifier: 'EUROSTARS-2026-04-01',
  },
  {
    callIdentifier: 'EUROSTARS-2026-05',
    title: 'Innovation in Manufacturing',
    budgetCents: BigInt(58_000_00),
    currency: 'EUR',
    destination: 'TR',
    deadline: '2026-10-20T17:00:00Z',
    programme: 'EUROSTARS',
    topicIdentifier: 'EUROSTARS-2026-05-01',
  },

  // TÜBİTAK (5) — all TR, currency TRY
  {
    callIdentifier: 'TUBITAK-1001-2026-Q4',
    title: 'Generic Support — Basic Research',
    budgetCents: BigInt(200_000_00),
    currency: 'TRY',
    destination: 'TR',
    deadline: '2026-12-15T17:00:00Z',
    programme: 'TUBITAK',
    topicIdentifier: 'TUBITAK-1001-2026-Q4-01',
  },
  {
    callIdentifier: 'TUBITAK-1003-2026-Q4',
    title: 'Scientific and Technological Research Funding',
    budgetCents: BigInt(150_000_00),
    currency: 'TRY',
    destination: 'TR',
    deadline: '2026-11-30T17:00:00Z',
    programme: 'TUBITAK',
    topicIdentifier: 'TUBITAK-1003-2026-Q4-01',
  },
  {
    callIdentifier: 'TUBITAK-1007-2026-Q4',
    title: 'Industry-Focused R&D',
    budgetCents: BigInt(250_000_00),
    currency: 'TRY',
    destination: 'TR',
    deadline: '2026-12-20T17:00:00Z',
    programme: 'TUBITAK',
    topicIdentifier: 'TUBITAK-1007-2026-Q4-01',
  },
  {
    callIdentifier: 'TUBITAK-1509-2026-Q3',
    title: 'Industrial Competitiveness Support Programme',
    budgetCents: BigInt(180_000_00),
    currency: 'TRY',
    destination: 'TR',
    deadline: '2026-10-30T17:00:00Z',
    programme: 'TUBITAK',
    topicIdentifier: 'TUBITAK-1509-2026-Q3-01',
  },
  {
    callIdentifier: 'TUBITAK-1511-2026-Q4',
    title: 'Technology Centres Support',
    budgetCents: BigInt(120_000_00),
    currency: 'TRY',
    destination: 'TR',
    deadline: '2026-12-01T17:00:00Z',
    programme: 'TUBITAK',
    topicIdentifier: 'TUBITAK-1511-2026-Q4-01',
  },
];

export default async function seedCalls() {
  for (const c of callsData) {
    // Create or update Call
    const call = await prisma.call.upsert({
      where: { callIdentifier: c.callIdentifier },
      update: {
        title: c.title,
        budgetCents: c.budgetCents,
        currency: c.currency,
      },
      create: {
        programmeId: c.programme,
        callIdentifier: c.callIdentifier,
        title: c.title,
        openDate: new Date(c.deadline),
        budgetCents: c.budgetCents,
        currency: c.currency,
      },
    });

    // Create or update Topic
    await prisma.topic.upsert({
      where: { identifier: c.topicIdentifier },
      update: {
        title: c.title,
        destination: c.destination,
        status: 'OPEN' as const,
        nextDeadlineAt: new Date(c.deadline),
      },
      create: {
        callId: call.id,
        identifier: c.topicIdentifier,
        title: c.title,
        status: 'OPEN' as const,
        destination: c.destination,
        typeOfAction: 'IA',
        deadlines: [{ stage: 1, at: c.deadline, tz: 'Europe/Brussels' }],
        nextDeadlineAt: new Date(c.deadline),
        keywords: ['research', 'innovation'],
      },
    });
  }

  console.log(`Calls and topics seeded (${callsData.length} calls).`);
}
