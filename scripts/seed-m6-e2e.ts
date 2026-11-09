/**
 * Seed a complete M6 panel evaluation for the end-to-end test, and roll it back.
 *
 * Idempotent: running it twice leaves the same rows, so a re-run before a retry is
 * safe. `--rollback` removes exactly what this script created and nothing else —
 * every delete is keyed on the fixed ids below.
 *
 *   pnpm tsx scripts/seed-m6-e2e.ts
 *   pnpm tsx scripts/seed-m6-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';
import { DEFAULT_CRITERIA } from '../src/modules/m6/types';
import { MAX_PROPOSAL_TEXT_CHARS } from '../src/modules/m6/proposal-too-long';

export const M6_E2E = {
  email: 'm6-e2e@fabrika.test',
  tenantId: 'm6-e2e-tenant',
  workspaceId: 'm6-e2e-workspace',
  userId: 'm6-e2e-user',
  opportunityId: 'm6-e2e-opportunity',
  proposalId: 'm6-e2e-proposal',
  evaluationId: 'm6-e2e-evaluation',
  reviewerId: 'm6-e2e-reviewer',
  /** An opportunity whose Part B is one character over what the AI reader accepts (NG-106). */
  longOpportunityId: 'm6-e2e-opportunity-long',
  longPartBId: 'm6-e2e-part-b-long',
  creditGrantId: 'm6-e2e-credit-grant',
  creditGrant: 10,
  /** Official ESR total out of 15; the dashboard shows it on the 1–5 panel scale. */
  esrTotal: 12.5,
} as const;

export async function seed() {
  await prisma.tenant.upsert({
    where: { id: M6_E2E.tenantId },
    update: {},
    create: { id: M6_E2E.tenantId, name: 'M6 E2E', slug: 'm6-e2e', country: 'TR', orgType: 'SME' },
  });

  await prisma.workspace.upsert({
    where: { id: M6_E2E.workspaceId },
    update: {},
    create: { id: M6_E2E.workspaceId, tenantId: M6_E2E.tenantId, name: 'M6 E2E', slug: 'm6-e2e-ws' },
  });

  await prisma.user.upsert({
    where: { id: M6_E2E.userId },
    update: { email: M6_E2E.email },
    create: { id: M6_E2E.userId, email: M6_E2E.email, name: 'M6 E2E Reviewer', locale: 'tr' },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: M6_E2E.tenantId, userId: M6_E2E.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [M6_E2E.workspaceId] },
    create: {
      userId: M6_E2E.userId,
      tenantId: M6_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [M6_E2E.workspaceId],
    },
  });

  // The gate is two locks, not one: the plan has to grant M6 *and* the tenant has to
  // have switched it on. Without a subscription row the tenant falls back to the
  // entry tier, and the panel page answers "Evaluator Lens modülü aboneliğinizin
  // kapsamı dışında" instead of rendering the form. `pro` is the cheapest plan that
  // grants M6 (src/lib/billing/catalog.ts PLAN_GRANTS).
  await prisma.subscription.upsert({
    where: { tenantId: M6_E2E.tenantId },
    update: { planId: 'pro', status: 'ACTIVE' },
    create: { tenantId: M6_E2E.tenantId, planId: 'pro', status: 'ACTIVE' },
  });

  // The M6 pages are behind the module gate (src/lib/modules/guard.tsx), so the
  // fixture tenant has to be granted the module the same way a real tenant is —
  // otherwise the test signs in and lands on the "module is closed" screen.
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: M6_E2E.tenantId, moduleId: 'M6' } },
    update: { status: 'ON' },
    create: { tenantId: M6_E2E.tenantId, moduleId: 'M6', status: 'ON', changedBy: 'seed-m6-e2e' },
  });

  await prisma.opportunity.upsert({
    where: { id: M6_E2E.opportunityId },
    update: {},
    create: {
      id: M6_E2E.opportunityId,
      tenantId: M6_E2E.tenantId,
      workspaceId: M6_E2E.workspaceId,
      title: 'M6 E2E — panel scoring fixture',
      stage: 'G2',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });

  await prisma.proposal.upsert({
    where: { id: M6_E2E.proposalId },
    update: { esrScores: { total: M6_E2E.esrTotal, threshold: 12, outcome: 'recommended' } },
    create: {
      id: M6_E2E.proposalId,
      tenantId: M6_E2E.tenantId,
      opportunityId: M6_E2E.opportunityId,
      acronym: 'M6E2E',
      esrScores: { total: M6_E2E.esrTotal, threshold: 12, outcome: 'recommended' },
    },
  });

  await prisma.evaluation.upsert({
    where: { id: M6_E2E.evaluationId },
    // avgScore is reset so a re-seed does not leave a previous run's score behind and
    // make the test pass on stale data.
    update: { avgScore: null, status: 'draft' },
    create: {
      id: M6_E2E.evaluationId,
      tenantId: M6_E2E.tenantId,
      opportunityId: M6_E2E.opportunityId,
      proposalId: M6_E2E.proposalId,
      userId: M6_E2E.userId,
      readerType: 'PANEL',
      status: 'draft',
    },
  });

  await prisma.reviewer.upsert({
    where: { id: M6_E2E.reviewerId },
    update: { status: 'pending' },
    create: {
      id: M6_E2E.reviewerId,
      tenantId: M6_E2E.tenantId,
      evaluationId: M6_E2E.evaluationId,
      userId: M6_E2E.userId,
      role: 'evaluator',
      status: 'pending',
    },
  });

  for (const c of DEFAULT_CRITERIA) {
    await prisma.criterion.upsert({
      where: { evaluationId_name: { evaluationId: M6_E2E.evaluationId, name: c.name } },
      update: { weight: c.weight, order: c.order },
      create: {
        tenantId: M6_E2E.tenantId,
        evaluationId: M6_E2E.evaluationId,
        name: c.name,
        weight: c.weight,
        order: c.order,
      },
    });
  }

  // Clear any marks left by an earlier run so the test starts from "nothing submitted".
  const deleted = await prisma.score.deleteMany({ where: { reviewerId: M6_E2E.reviewerId } });

  // A balance, so a refusal that left the credits alone can be told from one that had none.
  await prisma.creditLedger.upsert({
    where: { id: M6_E2E.creditGrantId },
    update: { delta: M6_E2E.creditGrant },
    create: {
      id: M6_E2E.creditGrantId,
      tenantId: M6_E2E.tenantId,
      delta: M6_E2E.creditGrant,
      reason: 'monthly_grant',
    },
  });

  await prisma.opportunity.upsert({
    where: { id: M6_E2E.longOpportunityId },
    update: {},
    create: {
      id: M6_E2E.longOpportunityId,
      tenantId: M6_E2E.tenantId,
      workspaceId: M6_E2E.workspaceId,
      title: 'M6 E2E — proposal over the AI reader limit',
      stage: 'G2',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });

  const heading = '## T\n';
  const longContent = {
    sections: [{ title: 'T', content: 'x'.repeat(MAX_PROPOSAL_TEXT_CHARS + 1 - heading.length) }],
  };
  await prisma.applicationPart.upsert({
    where: { id: M6_E2E.longPartBId },
    update: { content: longContent },
    create: {
      id: M6_E2E.longPartBId,
      tenantId: M6_E2E.tenantId,
      opportunityId: M6_E2E.longOpportunityId,
      part: 'PART_B',
      content: longContent,
    },
  });

  console.log(
    `[seed-m6-e2e] ready — tenant=${M6_E2E.tenantId} proposal=${M6_E2E.proposalId} ` +
      `evaluation=${M6_E2E.evaluationId} criteria=${DEFAULT_CRITERIA.length} clearedScores=${deleted.count}`,
  );
}

export async function rollback() {
  await prisma.applicationPart.deleteMany({ where: { id: M6_E2E.longPartBId } });
  await prisma.opportunity.deleteMany({ where: { id: M6_E2E.longOpportunityId } });
  await prisma.creditLedger.deleteMany({ where: { id: M6_E2E.creditGrantId } });
  await prisma.score.deleteMany({ where: { reviewerId: M6_E2E.reviewerId } });
  await prisma.criterion.deleteMany({ where: { evaluationId: M6_E2E.evaluationId } });
  await prisma.reviewer.deleteMany({ where: { id: M6_E2E.reviewerId } });
  await prisma.evaluation.deleteMany({ where: { id: M6_E2E.evaluationId } });
  await prisma.proposal.deleteMany({ where: { id: M6_E2E.proposalId } });
  await prisma.opportunity.deleteMany({ where: { id: M6_E2E.opportunityId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: M6_E2E.tenantId } });
  await prisma.subscription.deleteMany({ where: { tenantId: M6_E2E.tenantId } });
  await prisma.membership.deleteMany({ where: { userId: M6_E2E.userId, tenantId: M6_E2E.tenantId } });
  await prisma.user.deleteMany({ where: { id: M6_E2E.userId } });
  await prisma.workspace.deleteMany({ where: { id: M6_E2E.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: M6_E2E.tenantId } });
  console.log('[seed-m6-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-m6-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-m6-e2e] failed:', e);
      process.exit(1);
    });
}
