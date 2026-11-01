import { prisma } from '../src/lib/db';
import { rescoreOpportunityG0 } from '../src/lib/scoring/g0-compute';

/**
 * Demo opportunities.
 *
 * These rows used to carry hand-written G0 scores (75, 82, 85, 88, 92). Nothing computed them and
 * nothing could reproduce them, yet the board displayed them as triage scores and the gate engine
 * compared them against the 70 threshold — a fabricated figure shown to a user, which CLAUDE.md §7
 * forbids. The seed now writes the opportunities unscored and runs the canonical scorer over them,
 * so demo data is as derivable as production data. A demo opportunity whose topic carries no
 * evidence simply stays unscored, which is the truth.
 */
interface OpportunityData {
  title: string;
  topicIdentifier: string;
  coordinatorId: string;
  stage: 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
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
  },
  {
    title: 'Industrial waste-heat recovery consortium',
    topicIdentifier: 'HORIZON-CL6-2026-D3-01',
    coordinatorId: 'demo-user-bob',
    stage: 'G1',
  },
  {
    title: 'Grid flexibility platform',
    topicIdentifier: 'HORIZON-CLUSTER1-2026-01-01',
    coordinatorId: 'demo-user-alice',
    stage: 'G2',
  },
  {
    title: 'Citizen engagement for climate-neutral Bursa',
    topicIdentifier: 'HORIZON-GEO-2026-02-01',
    coordinatorId: 'demo-user-bob',
    stage: 'G3',
    g3Score: 4.2,
  },
  {
    title: 'SME-led R&D innovation — Eurostars',
    topicIdentifier: 'EUROSTARS-2026-01-01',
    coordinatorId: 'demo-user-alice',
    stage: 'G4',
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
        g0Score: null,
      },
    });

    const scored = await rescoreOpportunityG0(TENANT_ID, opportunity.id);
    const scoreLabel =
      scored?.score === null || scored?.score === undefined
        ? 'unscored (no evidence)'
        : `G0 ${scored.score} (${Math.round(scored.coverage * 100)}% evidence coverage)`;

    console.log(`Opportunity seeded: ${opportunity.title} (stage: ${opportunity.stage}, ${scoreLabel})`);
  }

  console.log(`Opportunities seeded (${opportunitiesData.length} opportunities).`);
}
