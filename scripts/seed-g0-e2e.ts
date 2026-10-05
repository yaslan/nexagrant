/**
 * Seed the fixture for the G0-score end-to-end test, and roll it back.
 *
 * The point of the fixture is the pair of opportunities:
 *
 *   • `scored`   — carries real scoring evidence (a `Topic`, a K1 `TopicMatch`, a `TopicStat`
 *                  success rate), so the canonical scorer can produce a number for it. Its
 *                  `g0Score` column starts `null`: whatever the screen shows was computed
 *                  during the test, not seeded into it.
 *   • `unscored` — carries no evidence at all, and its `g0Score` column is deliberately seeded
 *                  with the literal 92 the product used to invent. It is the control: the
 *                  detail screen must say "not computed" rather than read that column back.
 *
 * `scripts/seed-gate-e2e.ts` deliberately gates on G2 because "G0 refuses when the tenant has
 * no scoring evidence on file, and a fixture tenant has none" — so no end-to-end test covered
 * the G0 score itself. This fixture is the missing evidence.
 *
 * Idempotent: running it twice leaves the same rows, and it resets both opportunities to their
 * starting state (`scored` unscored again, `unscored` back to the fabricated 92) so a rerun
 * always measures a fresh computation. `--rollback` deletes exactly the fixed ids below.
 *
 *   pnpm tsx scripts/seed-g0-e2e.ts
 *   pnpm tsx scripts/seed-g0-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const G0_E2E = {
  email: 'g0-e2e@fabrika.test',
  tenantId: 'g0-e2e-tenant',
  tenantCountry: 'TR',
  workspaceId: 'g0-e2e-workspace',
  workspaceSlug: 'g0-e2e-ws',
  userId: 'g0-e2e-user',
  userName: 'G0 E2E Owner',

  programmeId: 'g0-e2e-programme',
  callId: 'g0-e2e-call',
  callIdentifier: 'HORIZON-G0E2E-2026-01',
  topicId: 'g0-e2e-topic',
  topicIdentifier: 'HORIZON-G0E2E-2026-01-D1-01',

  /** Has evidence. Starts with `g0Score = null`. */
  scoredOppId: 'g0-e2e-opportunity-scored',
  scoredOppTitle: 'G0 E2E — opportunity with real evidence',
  /**
   * Second opportunity on the **same topic** as `scoredOppId`, as a partner rather than a
   * coordinator. `budgetRoleEconomy` (weight 10) reads `Opportunity.intendedRole`, so the two
   * score differently on identical topic evidence — which is what makes a topic-keyed evidence
   * row wrong (TASK-MTQ63RR8Z0G8E).
   */
  partnerOppId: 'g0-e2e-opportunity-partner',
  partnerOppTitle: 'G0 E2E — same topic, partner role',
  /** Has no evidence, and a fabricated score sitting in the column. */
  unscoredOppId: 'g0-e2e-opportunity-unscored',
  unscoredOppTitle: 'G0 E2E — opportunity with no evidence',
  /** The number the seed writes into `Opportunity.g0Score` for the unscored control. */
  fabricatedScore: 92,

  /** `TopicMatch.fitScore` — the K1 alignment the scorer must read. */
  fitScore: 88,
  /** `TopicStat.successRate`, as a percentage. */
  successRatePct: 18,

  /** M5 is the pipeline module; the board and the detail page are both behind its gate. */
  moduleId: 'M5',
} as const;

/** Every opportunity this fixture owns — what a run resets and what `--rollback` removes. */
export const G0_E2E_OPP_IDS = [
  G0_E2E.scoredOppId,
  G0_E2E.partnerOppId,
  G0_E2E.unscoredOppId,
] as const;

export async function seed() {
  await prisma.tenant.upsert({
    where: { id: G0_E2E.tenantId },
    update: { country: G0_E2E.tenantCountry },
    create: {
      id: G0_E2E.tenantId,
      name: 'G0 E2E',
      slug: 'g0-e2e',
      country: G0_E2E.tenantCountry,
      orgType: 'SME',
    },
  });

  // Keywords are the documented fallback when no TopicMatch exists. This fixture has a match,
  // so they are here only so the profile read is not a missing row.
  await prisma.tenantProfile.upsert({
    where: { tenantId: G0_E2E.tenantId },
    update: { keywords: ['grid flexibility', 'demand response'] },
    create: {
      tenantId: G0_E2E.tenantId,
      capabilities: 'Grid flexibility pilots and demand-response platforms.',
      keywords: ['grid flexibility', 'demand response'],
      naceCodes: [],
      trlRange: [4, 7],
      preferredRoles: ['coordinator'],
    },
  });

  await prisma.workspace.upsert({
    where: { id: G0_E2E.workspaceId },
    update: {},
    create: {
      id: G0_E2E.workspaceId,
      tenantId: G0_E2E.tenantId,
      name: 'G0 E2E',
      slug: G0_E2E.workspaceSlug,
    },
  });

  await prisma.user.upsert({
    where: { id: G0_E2E.userId },
    update: { email: G0_E2E.email, name: G0_E2E.userName },
    create: {
      id: G0_E2E.userId,
      email: G0_E2E.email,
      name: G0_E2E.userName,
      locale: 'tr',
    },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: G0_E2E.tenantId, userId: G0_E2E.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [G0_E2E.workspaceId] },
    create: {
      userId: G0_E2E.userId,
      tenantId: G0_E2E.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [G0_E2E.workspaceId],
    },
  });

  // The `free` fallback plan already grants M5, so only the tenant's own switch has to be on.
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: G0_E2E.tenantId, moduleId: G0_E2E.moduleId } },
    update: { status: 'ON' },
    create: {
      tenantId: G0_E2E.tenantId,
      moduleId: G0_E2E.moduleId,
      status: 'ON',
      changedBy: 'seed-g0-e2e',
    },
  });

  // ── the evidence: programme → call → topic → (match, stat)
  await prisma.programme.upsert({
    where: { id: G0_E2E.programmeId },
    update: {},
    create: { id: G0_E2E.programmeId, name: 'G0 E2E Programme', sourceKey: 'g0-e2e' },
  });

  await prisma.call.upsert({
    where: { id: G0_E2E.callId },
    update: {},
    create: {
      id: G0_E2E.callId,
      programmeId: G0_E2E.programmeId,
      callIdentifier: G0_E2E.callIdentifier,
      title: 'G0 E2E Call',
      currency: 'EUR',
    },
  });

  await prisma.topic.upsert({
    where: { id: G0_E2E.topicId },
    update: {},
    create: {
      id: G0_E2E.topicId,
      callId: G0_E2E.callId,
      identifier: G0_E2E.topicIdentifier,
      title: 'G0 E2E Topic — grid flexibility',
      typeOfAction: 'IA',
      isLumpSum: false,
      isTwoStage: false,
      // Minor units (CLAUDE.md §9): €4,000,000 per project.
      budgetPerProjectCents: BigInt(400_000_000),
      deadlines: [{ stage: 1, at: '2026-12-15T17:00:00Z', tz: 'Europe/Brussels' }],
      eligibility: {},
      keywords: ['grid flexibility', 'demand response'],
    },
  });

  // A K1 match, not a row this scorer wrote: no `g0ScorerPlaceholderFitScore` flag, so
  // `loadG0Snapshot` reads `fitScore` as a measured alignment instead of discarding it.
  // The K1 row is the one with **no** opportunity on it. Prisma cannot put `null` into a
  // compound-unique `where`, so it is found rather than upserted; the database still allows only
  // one such row per tenant × topic (`NULLS NOT DISTINCT`).
  const k1 = await prisma.topicMatch.findFirst({
    where: { tenantId: G0_E2E.tenantId, topicId: G0_E2E.topicId, opportunityId: null },
    select: { id: true },
  });
  if (k1) {
    await prisma.topicMatch.update({
      where: { id: k1.id },
      data: { fitScore: G0_E2E.fitScore, g0Score: null, breakdown: { source: 'seed-g0-e2e/k1' } },
    });
  } else {
    await prisma.topicMatch.create({
      data: {
        tenantId: G0_E2E.tenantId,
        topicId: G0_E2E.topicId,
        fitScore: G0_E2E.fitScore,
        breakdown: { source: 'seed-g0-e2e/k1' },
      },
    });
  }

  // Every G0 evidence row for this fixture's opportunities is cleared, so each run measures a
  // fresh computation rather than the previous run's stored number.
  await prisma.topicMatch.deleteMany({
    where: { tenantId: G0_E2E.tenantId, opportunityId: { in: [...G0_E2E_OPP_IDS] } },
  });

  await prisma.topicStat.deleteMany({ where: { topicId: G0_E2E.topicId } });
  await prisma.topicStat.create({
    data: {
      topicId: G0_E2E.topicId,
      topicPrefix: 'HORIZON-G0E2E-2026-01-D1',
      country: G0_E2E.tenantCountry,
      proposals: 100,
      funded: 18,
      successRate: G0_E2E.successRatePct,
      source: 'seed-g0-e2e',
    },
  });

  // ── the two opportunities
  await prisma.opportunity.upsert({
    where: { id: G0_E2E.scoredOppId },
    // Reset to "never scored" on every run, so the number the test sees was computed by the run.
    update: { g0Score: null, stage: 'G0', status: 'ACTIVE', deletedAt: null },
    create: {
      id: G0_E2E.scoredOppId,
      tenantId: G0_E2E.tenantId,
      workspaceId: G0_E2E.workspaceId,
      title: G0_E2E.scoredOppTitle,
      topicId: G0_E2E.topicId,
      stage: 'G0',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
      g0Score: null,
    },
  });

  // Same topic, same tenant, different role — the pair the badge fix is about.
  await prisma.opportunity.upsert({
    where: { id: G0_E2E.partnerOppId },
    update: { g0Score: null, stage: 'G0', status: 'ACTIVE', deletedAt: null, intendedRole: 'partner' },
    create: {
      id: G0_E2E.partnerOppId,
      tenantId: G0_E2E.tenantId,
      workspaceId: G0_E2E.workspaceId,
      title: G0_E2E.partnerOppTitle,
      topicId: G0_E2E.topicId,
      stage: 'G0',
      status: 'ACTIVE',
      intendedRole: 'partner',
      g0Score: null,
    },
  });

  await prisma.opportunity.upsert({
    where: { id: G0_E2E.unscoredOppId },
    update: {
      g0Score: G0_E2E.fabricatedScore,
      topicId: null,
      stage: 'G0',
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      id: G0_E2E.unscoredOppId,
      tenantId: G0_E2E.tenantId,
      workspaceId: G0_E2E.workspaceId,
      title: G0_E2E.unscoredOppTitle,
      topicId: null,
      stage: 'G0',
      status: 'ACTIVE',
      intendedRole: 'partner',
      g0Score: G0_E2E.fabricatedScore,
    },
  });

  const cleared = await prisma.gateDecision.deleteMany({
    where: { opportunityId: { in: [...G0_E2E_OPP_IDS] } },
  });

  console.log(
    `[seed-g0-e2e] ready — tenant=${G0_E2E.tenantId} scored=${G0_E2E.scoredOppId} (g0Score=null) ` +
      `unscored=${G0_E2E.unscoredOppId} (g0Score=${G0_E2E.fabricatedScore}) ` +
      `clearedDecisions=${cleared.count}`,
  );
}

export async function rollback() {
  await prisma.gateDecision.deleteMany({
    where: { opportunityId: { in: [...G0_E2E_OPP_IDS] } },
  });
  await prisma.topicMatch.deleteMany({
    where: { opportunityId: { in: [...G0_E2E_OPP_IDS] } },
  });
  await prisma.opportunity.deleteMany({
    where: { id: { in: [...G0_E2E_OPP_IDS] } },
  });
  await prisma.topicStat.deleteMany({ where: { topicId: G0_E2E.topicId } });
  await prisma.topicMatch.deleteMany({ where: { topicId: G0_E2E.topicId } });
  await prisma.topic.deleteMany({ where: { id: G0_E2E.topicId } });
  await prisma.call.deleteMany({ where: { id: G0_E2E.callId } });
  await prisma.programme.deleteMany({ where: { id: G0_E2E.programmeId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: G0_E2E.tenantId } });
  await prisma.membership.deleteMany({
    where: { userId: G0_E2E.userId, tenantId: G0_E2E.tenantId },
  });
  await prisma.user.deleteMany({ where: { id: G0_E2E.userId } });
  await prisma.workspace.deleteMany({ where: { id: G0_E2E.workspaceId } });
  await prisma.tenantProfile.deleteMany({ where: { tenantId: G0_E2E.tenantId } });
  await prisma.tenant.deleteMany({ where: { id: G0_E2E.tenantId } });
  console.log('[seed-g0-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-g0-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-g0-e2e] failed:', e);
      process.exit(1);
    });
}
