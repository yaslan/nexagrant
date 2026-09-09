/**
 * TASK-MTQWBAJ2T5XSV (F10+F16) — fixture for "absence is not zero".
 *
 * Three workspaces, because the bug is only visible as a contrast:
 *
 *   f10-empty  no opportunities at all       → the dashboard must say so, not print 0.0 %
 *   f10-full   opportunities, effort, one    → real figures, AND a hit rate that is a
 *              unsubmitted proposal, a         *genuine* 0 (two G0-scored opportunities,
 *              scored human evaluation and     nothing submitted) which must still read 0
 *              two unfilled evaluations      → the lens must say "not evaluated" for those
 *
 * Idempotent: every write is an upsert on a fixed id, so a re-run before a retry is
 * safe. `--rollback` deletes exactly these ids and nothing else.
 *
 *   pnpm tsx scripts/seed-f10-e2e.ts
 *   pnpm tsx scripts/seed-f10-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

const DAY = 24 * 60 * 60 * 1000;
/** Inside the dashboard's default 30-day window, with room for the G0→G2 span. */
const G0_AT = new Date(Date.now() - 12 * DAY);
const G2_AT = new Date(Date.now() - 2 * DAY);

export const F10 = {
  empty: {
    tenantId: 'f10-empty-tenant',
    workspaceId: 'f10-empty-workspace',
    workspaceSlug: 'f10-empty-ws',
    userId: 'f10-empty-user',
    email: 'f10-empty@fabrika.test',
  },
  full: {
    tenantId: 'f10-full-tenant',
    workspaceId: 'f10-full-workspace',
    workspaceSlug: 'f10-full-ws',
    userId: 'f10-full-user',
    email: 'f10-full@fabrika.test',
    opportunityA: 'f10-full-opp-a',
    opportunityB: 'f10-full-opp-b',
    proposalId: 'f10-full-proposal',
    effortId: 'f10-full-effort',
    /** Completed human reader — real marks, 4 + 4 + 3 = 11.0 / 15. */
    scoredEvaluationId: 'f10-full-eval-scored',
    /** Opened, never submitted: the three mark columns still hold their default 0. */
    draftEvaluationId: 'f10-full-eval-draft',
    /** Completed PANEL row whose marks live in Reviewer/Score, not in those columns. */
    panelEvaluationId: 'f10-full-eval-panel',
  },
} as const;

const MODULES = ['M5', 'M6'] as const;

async function seatTenant(t: {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  email: string;
}) {
  await prisma.tenant.upsert({
    where: { id: t.tenantId },
    update: {},
    create: { id: t.tenantId, name: t.tenantId, slug: t.tenantId, country: 'TR', orgType: 'SME' },
  });

  await prisma.workspace.upsert({
    where: { id: t.workspaceId },
    update: { slug: t.workspaceSlug },
    create: { id: t.workspaceId, tenantId: t.tenantId, name: t.workspaceSlug, slug: t.workspaceSlug },
  });

  // The upsert keys on the fixed id, but `email` is unique too, so a row holding
  // this address under a *different* id makes the upsert throw
  // `User_email_key` and the whole suite fails in beforeAll. That row is not
  // hypothetical: signing in creates a user from the e-mail, so any run whose
  // rollback did not complete leaves one behind and every later run is blocked
  // until someone clears it by hand. Claiming the address first is what makes
  // the seed genuinely re-runnable.
  await prisma.user.deleteMany({ where: { email: t.email, id: { not: t.userId } } });

  await prisma.user.upsert({
    where: { id: t.userId },
    update: { email: t.email },
    create: { id: t.userId, email: t.email, name: t.userId, locale: 'tr' },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: t.tenantId, userId: t.userId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [t.workspaceId] },
    create: {
      userId: t.userId,
      tenantId: t.tenantId,
      role: 'TENANT_OWNER',
      workspaceIds: [t.workspaceId],
    },
  });

  for (const moduleId of MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: t.tenantId, moduleId } },
      update: { status: 'ON' },
      create: { tenantId: t.tenantId, moduleId, status: 'ON', changedBy: 'seed-f10-e2e' },
    });
  }
}

export async function seed() {
  await seatTenant(F10.empty);
  await seatTenant(F10.full);

  const f = F10.full;

  // A `ModuleState` row is only half of the entitlement: the module gate refuses an ON module
  // the plan does not sell (CLAUDE.md rule 4), and a tenant with no `Subscription` reads as
  // `free`, which grants M3 and M5 only. The evaluations page is M6 — the "not evaluated"
  // assertion never reaches it without a plan that includes M6, so the full tenant carries the
  // cheapest one that does. The empty tenant stays plan-less on purpose: its assertions are all
  // on the M5 dashboard, and leaving it alone keeps the fixture's blast radius small.
  await prisma.subscription.upsert({
    where: { tenantId: f.tenantId },
    update: { planId: 'pro', status: 'ACTIVE' },
    create: { tenantId: f.tenantId, planId: 'pro', status: 'ACTIVE' },
  });

  // Two opportunities, both past G0 scoring — this is the hit-rate denominator.
  for (const [id, title, g0Score] of [
    [f.opportunityA, 'F10 — renovation pilot', 74],
    [f.opportunityB, 'F10 — grid flexibility', 68],
  ] as const) {
    await prisma.opportunity.upsert({
      where: { id },
      update: { g0Score },
      create: {
        id,
        tenantId: f.tenantId,
        workspaceId: f.workspaceId,
        title,
        stage: 'G2',
        status: 'ACTIVE',
        intendedRole: 'coordinator',
        g0Score,
      },
    });
  }

  // A proposal that was drafted but never submitted. Hit rate is therefore 0 of 2 —
  // a real measurement, and the dashboard must print "0,0 %" rather than hide it.
  await prisma.proposal.upsert({
    where: { id: f.proposalId },
    update: { submittedAt: null },
    create: {
      id: f.proposalId,
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      acronym: 'F10A',
      submittedAt: null,
    },
  });

  // 40 logged hours over 1 proposal → 5.0 person-days/proposal.
  await prisma.effort.upsert({
    where: { id: f.effortId },
    update: { hours: 40 },
    create: {
      id: f.effortId,
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      userId: f.userId,
      date: G0_AT,
      hours: 40,
    },
  });

  // G0 and G2 ten days apart on opportunity A; B never reached G2, so it must not
  // contribute a 0-day span to the average.
  await prisma.gateDecision.upsert({
    where: { id: 'f10-full-gate-g0-a' },
    update: { decidedAt: G0_AT },
    create: {
      id: 'f10-full-gate-g0-a',
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      gate: 'G0',
      passed: true,
      inputs: {},
      ruleVersion: 'seed-f10',
      decidedBy: f.userId,
      decidedAt: G0_AT,
    },
  });
  await prisma.gateDecision.upsert({
    where: { id: 'f10-full-gate-g2-a' },
    update: { decidedAt: G2_AT },
    create: {
      id: 'f10-full-gate-g2-a',
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      gate: 'G2',
      passed: true,
      inputs: {},
      ruleVersion: 'seed-f10',
      decidedBy: f.userId,
      decidedAt: G2_AT,
    },
  });
  await prisma.gateDecision.upsert({
    where: { id: 'f10-full-gate-g0-b' },
    update: { decidedAt: G0_AT },
    create: {
      id: 'f10-full-gate-g0-b',
      tenantId: f.tenantId,
      opportunityId: f.opportunityB,
      gate: 'G0',
      passed: true,
      inputs: {},
      ruleVersion: 'seed-f10',
      decidedBy: f.userId,
      decidedAt: G0_AT,
    },
  });

  // Opportunity A carries one scored reader and two rows nobody has scored.
  await prisma.evaluation.upsert({
    where: { id: f.scoredEvaluationId },
    update: { status: 'completed', excellence: 4, impact: 4, implementation: 3 },
    create: {
      id: f.scoredEvaluationId,
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      userId: f.userId,
      readerType: 'HUMAN',
      status: 'completed',
      excellence: 4,
      impact: 4,
      implementation: 3,
      weaknesses: { strengths: ['Clear work plan'], weaknesses: ['Thin dissemination'] },
    },
  });

  await prisma.evaluation.upsert({
    where: { id: f.draftEvaluationId },
    // Explicitly written back so a re-run cannot leave a previous run's marks behind
    // and make the "not evaluated" assertion pass on stale data.
    update: { status: 'draft', excellence: 0, impact: 0, implementation: 0 },
    create: {
      id: f.draftEvaluationId,
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      userId: f.userId,
      readerType: 'HUMAN',
      status: 'draft',
    },
  });

  await prisma.evaluation.upsert({
    where: { id: f.panelEvaluationId },
    update: { status: 'completed', excellence: 0, impact: 0, implementation: 0 },
    create: {
      id: f.panelEvaluationId,
      tenantId: f.tenantId,
      opportunityId: f.opportunityA,
      userId: f.userId,
      readerType: 'PANEL',
      status: 'completed',
    },
  });

  console.log(
    `[seed-f10-e2e] ready — empty=${F10.empty.workspaceSlug} full=${f.workspaceSlug} ` +
      `opportunity=${f.opportunityA}`,
  );
}

export async function rollback() {
  const f = F10.full;
  await prisma.evaluation.deleteMany({
    where: { id: { in: [f.scoredEvaluationId, f.draftEvaluationId, f.panelEvaluationId] } },
  });
  await prisma.gateDecision.deleteMany({ where: { tenantId: f.tenantId } });
  await prisma.effort.deleteMany({ where: { id: f.effortId } });
  await prisma.proposal.deleteMany({ where: { id: f.proposalId } });
  await prisma.opportunity.deleteMany({ where: { id: { in: [f.opportunityA, f.opportunityB] } } });
  await prisma.subscription.deleteMany({ where: { tenantId: f.tenantId } });
  for (const t of [F10.empty, F10.full]) {
    await prisma.moduleState.deleteMany({ where: { tenantId: t.tenantId } });
    await prisma.membership.deleteMany({ where: { tenantId: t.tenantId, userId: t.userId } });
    await prisma.user.deleteMany({ where: { id: t.userId } });
    await prisma.workspace.deleteMany({ where: { id: t.workspaceId } });
    await prisma.tenant.deleteMany({ where: { id: t.tenantId } });
  }
  console.log('[seed-f10-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-f10-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-f10-e2e] failed:', e);
      process.exit(1);
    });
}
