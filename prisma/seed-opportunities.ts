import { prisma } from '../src/lib/db';

interface OpportunityData {
  title: string;
  topicIdentifier: string;
  coordinatorId: string;
  stage: 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
  g0Score: number;
  g3Score?: number;
}

const TENANT_ID = 'demo-tenant';
const WORKSPACE_ID = 'demo-workspace';

const opportunitiesData: OpportunityData[] = [
  {
    title: 'District renovation pilot — İzmir',
    topicIdentifier: 'HORIZON-CL5-2026-D4-01',
    coordinatorId: 'demo-user-alice',
    stage: 'G0',
    g0Score: 75,
  },
  {
    title: 'Industrial waste-heat recovery consortium',
    topicIdentifier: 'HORIZON-CL6-2026-D3-01',
    coordinatorId: 'demo-user-bob',
    stage: 'G1',
    g0Score: 82,
  },
  {
    title: 'Grid flexibility platform',
    topicIdentifier: 'HORIZON-CLUSTER1-2026-01-01',
    coordinatorId: 'demo-user-alice',
    stage: 'G2',
    g0Score: 85,
  },
  {
    title: 'Citizen engagement for climate-neutral Bursa',
    topicIdentifier: 'HORIZON-GEO-2026-02-01',
    coordinatorId: 'demo-user-bob',
    stage: 'G3',
    g0Score: 88,
    g3Score: 4.2,
  },
  {
    title: 'SME-led R&D innovation — Eurostars',
    topicIdentifier: 'EUROSTARS-2026-01-01',
    coordinatorId: 'demo-user-alice',
    stage: 'G4',
    g0Score: 92,
    g3Score: 4.5,
  },
];

export default async function seedOpportunities() {
  for (let i = 0; i < opportunitiesData.length; i++) {
    const oppData = opportunitiesData[i]!;

    // Fetch topic by identifier
    const topic = await prisma.topic.findUnique({
      where: { identifier: oppData.topicIdentifier },
    });
    if (!topic) {
      console.warn(`Topic not found: ${oppData.topicIdentifier}`);
      continue;
    }

    const oppId = `demo-opp-${i + 1}`;
    const opportunity = await prisma.opportunity.upsert({
      where: { id: oppId },
      update: {
        title: oppData.title,
        stage: oppData.stage,
        g0Score: oppData.g0Score,
        ownerId: oppData.coordinatorId,
      },
      create: {
        id: oppId,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        topicId: topic.id,
        title: oppData.title,
        stage: oppData.stage,
        status: 'ACTIVE',
        intendedRole: 'coordinator',
        ownerId: oppData.coordinatorId,
        g0Score: oppData.g0Score,
      },
    });

    console.log(`Opportunity seeded: ${opportunity.title} (stage: ${opportunity.stage})`);
  }

  console.log(`Opportunities seeded (${opportunitiesData.length} opportunities).`);
}
