import { prisma } from '../src/lib/db';

interface GateDecisionData {
  opportunityIndex: number;
  gate: 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
  passed: boolean;
  daysAgo: number;
}

const TENANT_ID = 'demo-tenant';

// Gate decisions with time progression (current date: 2026-09-06)
const gateDecisionsData: GateDecisionData[] = [
  // Opportunity 1 (G0 reached)
  { opportunityIndex: 1, gate: 'G0', passed: true, daysAgo: 22 }, // 2026-08-15

  // Opportunity 2 (G1 reached)
  { opportunityIndex: 2, gate: 'G0', passed: true, daysAgo: 18 }, // 2026-08-19
  { opportunityIndex: 2, gate: 'G1', passed: true, daysAgo: 15 }, // 2026-08-22

  // Opportunity 3 (G2 reached)
  { opportunityIndex: 3, gate: 'G0', passed: true, daysAgo: 16 }, // 2026-08-21
  { opportunityIndex: 3, gate: 'G1', passed: true, daysAgo: 12 }, // 2026-08-25
  { opportunityIndex: 3, gate: 'G2', passed: true, daysAgo: 5 }, // 2026-09-01

  // Opportunity 4 (G3 reached)
  { opportunityIndex: 4, gate: 'G0', passed: true, daysAgo: 14 }, // 2026-08-23
  { opportunityIndex: 4, gate: 'G1', passed: true, daysAgo: 10 }, // 2026-08-27
  { opportunityIndex: 4, gate: 'G2', passed: true, daysAgo: 3 }, // 2026-09-03
  { opportunityIndex: 4, gate: 'G3', passed: true, daysAgo: 1 }, // 2026-09-05

  // Opportunity 5 (G4 reached)
  { opportunityIndex: 5, gate: 'G0', passed: true, daysAgo: 10 }, // 2026-08-27
  { opportunityIndex: 5, gate: 'G1', passed: true, daysAgo: 8 }, // 2026-08-29
  { opportunityIndex: 5, gate: 'G2', passed: true, daysAgo: 4 }, // 2026-09-02
  { opportunityIndex: 5, gate: 'G3', passed: true, daysAgo: 2 }, // 2026-09-04
  { opportunityIndex: 5, gate: 'G4', passed: true, daysAgo: 0 }, // 2026-09-06
];

export default async function seedGateDecisions() {
  for (const gdData of gateDecisionsData) {
    const oppId = `demo-opp-${gdData.opportunityIndex}`;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: oppId },
    });
    if (!opportunity) {
      console.warn(`Opportunity not found: ${oppId}`);
      continue;
    }

    const decisionId = `${oppId}-${gdData.gate.toLowerCase()}`;
    const decidedAt = new Date();
    decidedAt.setDate(decidedAt.getDate() - gdData.daysAgo);

    await prisma.gateDecision.upsert({
      where: { id: decisionId },
      update: {
        passed: gdData.passed,
        decidedAt,
      },
      create: {
        id: decisionId,
        tenantId: TENANT_ID,
        opportunityId: oppId,
        gate: gdData.gate,
        passed: gdData.passed,
        inputs: { score: opportunity.g0Score, gate: gdData.gate },
        ruleVersion: '1.0',
        decidedBy: opportunity.ownerId!,
        decidedAt,
      },
    });
  }

  console.log(`Gate decisions seeded (${gateDecisionsData.length} decisions).`);
}
