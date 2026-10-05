import type { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/db';

interface ProposalData {
  opportunityIndex: number;
  acronym: string;
  submittedAt?: string;
  outcome?: string;
}

const TENANT_ID = 'demo-tenant';

const proposalsData: ProposalData[] = [
  {
    opportunityIndex: 1,
    acronym: 'DREN',
    // status: drafted (submittedAt null)
  },
  {
    opportunityIndex: 2,
    acronym: 'IWHR',
    submittedAt: '2026-09-01T10:00:00Z',
    // status: submitted
  },
  {
    opportunityIndex: 3,
    acronym: 'GFLEX',
    submittedAt: '2026-08-28T10:00:00Z',
    outcome: 'above_threshold',
    // status: evaluated
  },
];

export default async function seedProposals() {
  for (const pData of proposalsData) {
    const oppId = `demo-opp-${pData.opportunityIndex}`;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: oppId },
    });
    if (!opportunity) {
      console.warn(`Opportunity not found: ${oppId}`);
      continue;
    }

    const proposalId = `demo-proposal-${pData.opportunityIndex}`;

    // Built up field by field because submittedAt/outcome are only set when the
    // fixture has them. Typed as the generated create input rather than a
    // hand-written shape, so a column the schema does not have is a build error
    // instead of a PrismaClientValidationError at seed time.
    const createData: Prisma.ProposalUncheckedCreateInput = {
      id: proposalId,
      tenantId: TENANT_ID,
      opportunityId: opportunity.id,
      acronym: pData.acronym,
    };

    if (pData.submittedAt) {
      createData.submittedAt = new Date(pData.submittedAt);
    }

    if (pData.outcome) {
      createData.outcome = pData.outcome;
    }

    await prisma.proposal.upsert({
      where: { opportunityId: opportunity.id },
      update: {
        acronym: pData.acronym,
        submittedAt: pData.submittedAt ? new Date(pData.submittedAt) : undefined,
        outcome: pData.outcome,
      },
      create: createData,
    });
  }

  console.log(`Proposals seeded (${proposalsData.length} proposals).`);
}
