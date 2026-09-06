import { PrismaClient } from '@prisma/client';

/**
 * Seed M6 evaluation panel data for testing and development.
 * Creates 10 evaluations across 2 proposals, each with 2-3 reviewers
 * and full criterion/score data.
 *
 * Usage: npx ts-node prisma/seed-m6-evaluations.ts
 */

const prisma = new PrismaClient();

// Prisma auto-generates IDs, but we provide consistent ones for testing
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function seedM6Evaluations() {
  const tenantId = 'demo-tenant'; // Use a known demo tenant
  const workspaceId = generateId();

  // Get or create demo tenant + users
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    create: { name: 'Demo Tenant', slug: 'demo', country: 'TR' },
    update: {},
  });

  const actualTenantId = tenant.id;

  // Create reviewers (3 users who will evaluate)
  const reviewer1 = await prisma.user.upsert({
    where: { email: 'reviewer1@demo.local' },
    create: { email: 'reviewer1@demo.local', name: 'Reviewer One' },
    update: {},
  });

  const reviewer2 = await prisma.user.upsert({
    where: { email: 'reviewer2@demo.local' },
    create: { email: 'reviewer2@demo.local', name: 'Reviewer Two' },
    update: {},
  });

  const reviewer3 = await prisma.user.upsert({
    where: { email: 'reviewer3@demo.local' },
    create: { email: 'reviewer3@demo.local', name: 'Reviewer Three' },
    update: {},
  });

  // Create workspace + opportunity for context
  const workspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: actualTenantId, slug: 'demo-ws' } },
    create: { tenantId: actualTenantId, name: 'Demo Workspace', slug: 'demo-ws' },
    update: {},
  });

  const opportunity = await prisma.opportunity.upsert({
    where: { id: 'opp-m6-demo' },
    create: {
      id: 'opp-m6-demo',
      tenantId: actualTenantId,
      workspaceId: workspace.id,
      stage: 'G0',
      title: 'Demo Opportunity for M6',
      callId: 'call-demo',
    },
    update: {},
  });

  // Create 2 proposals to evaluate
  const proposals = [];
  for (let p = 1; p <= 2; p++) {
    const proposal = await prisma.proposal.upsert({
      where: { id: `prop-m6-${p}` },
      create: {
        id: `prop-m6-${p}`,
        tenantId: actualTenantId,
        opportunityId: opportunity.id,
        status: 'draft',
        title: `Proposal ${p}`,
        // ESR comparison data
        esrScores: {
          total: 12 + p, // 13 and 14 for proposals 1 and 2
          threshold: 12,
          outcome: p === 1 ? 'not_recommended' : 'recommended',
          labelSource: 'esr_official',
        },
      },
      update: {},
    });
    proposals.push(proposal);
  }

  // Create evaluations and populate with reviewers, criteria, scores
  const evaluations = [];

  for (let e = 1; e <= 10; e++) {
    const proposalIndex = e % 2; // Alternate between 2 proposals
    const proposal = proposals[proposalIndex];

    const evaluation = await prisma.evaluation.create({
      data: {
        id: `eval-m6-${e}`,
        tenantId: actualTenantId,
        proposalId: proposal.id,
        opportunityId: opportunity.id,
        readerType: 'PANEL',
        status: e <= 5 ? 'completed' : 'in-progress', // First 5 are complete
      },
    });

    evaluations.push(evaluation);

    // Add 2–3 reviewers per evaluation
    const reviewerUsers =
      e % 2 === 0
        ? [reviewer1, reviewer2, reviewer3]
        : [reviewer1, reviewer2];

    const reviewers: Awaited<ReturnType<typeof prisma.reviewer.create>>[] = [];
    for (const user of reviewerUsers) {
      const reviewer = await prisma.reviewer.create({
        data: {
          id: generateId(),
          tenantId: actualTenantId,
          evaluationId: evaluation.id,
          userId: user.id,
          role: reviewers.length === 0 ? 'coordinator' : 'evaluator',
          status: e <= 5 ? 'completed' : 'pending',
        },
      });
      reviewers.push(reviewer);
    }

    // Create 4 criteria (standard set)
    const criteria = [
      { name: 'Innovation', weight: 0.3, order: 1 },
      { name: 'Feasibility', weight: 0.2, order: 2 },
      { name: 'Impact', weight: 0.3, order: 3 },
      { name: 'Communication', weight: 0.2, order: 4 },
    ];

    const criterionRecords = [];
    for (const crit of criteria) {
      const criterion = await prisma.criterion.create({
        data: {
          id: generateId(),
          tenantId: actualTenantId,
          evaluationId: evaluation.id,
          name: crit.name,
          weight: crit.weight,
          order: crit.order,
        },
      });
      criterionRecords.push(criterion);
    }

    // Assign scores: reviewers rate each criterion
    // Vary scores to test consensus/divergence
    const scoreVariations: Record<number, number[]> = {
      1: [5, 5, 4], // consensus high
      2: [3, 3, 3], // consensus mid
      3: [5, 2, 4], // divergent
      4: [1, 1, 1], // consensus low
      5: [4, 4, 5], // consensus high
      6: [2, 2, 3], // consensus low-mid
      7: [5, 3, 2], // divergent
      8: [4, 4, 4], // consensus mid
      9: [1, 2, 1], // consensus low
      10: [5, 5, 5], // consensus high
    };

    const evalScores = scoreVariations[e] || [3, 3, 3];

    for (let r = 0; r < reviewers.length; r++) {
      const reviewer = reviewers[r];
      const baseScore = evalScores[r];

      for (const criterion of criterionRecords) {
        // Vary score within ±1 per criterion
        const variance = (criterion.order - 1) % 2; // 0, 1, 0, 1 for 4 criteria
        const score = Math.max(1, Math.min(5, baseScore + variance - 1));

        await prisma.score.create({
          data: {
            id: generateId(),
            tenantId: actualTenantId,
            reviewerId: reviewer.id,
            criterionId: criterion.id,
            score: score as 1 | 2 | 3 | 4 | 5,
            comment:
              e % 3 === 0
                ? `Comment on ${criterion.name} from reviewer ${r + 1}`
                : null,
            submittedAt: e <= 5 ? new Date() : null,
          },
        });
      }
    }

    // Compute and store panel average (for completed evaluations)
    if (e <= 5) {
      const allScores = await prisma.score.findMany({
        where: { reviewerId: { in: reviewers.map((r) => r.id) } },
      });
      const avgScore =
        allScores.reduce((sum: number, s: typeof allScores[0]) => sum + s.score, 0) /
        allScores.length;

      await prisma.evaluation.update({
        where: { id: evaluation.id },
        data: { avgScore, updatedAt: new Date() },
      });
    }
  }

  console.log(
    `✓ Seeded 10 M6 evaluations (2 proposals × 5 evaluations each) with reviewers and scores`,
  );
}

seedM6Evaluations()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
