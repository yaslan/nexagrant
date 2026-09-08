/**
 * TASK-MTQYXISOPUJ53 (re-verification) — fixture for "an empty tenant must see
 * nothing, not a demo".
 *
 * Two workspaces, because the five points split into two shapes:
 *
 *   st6-bare-ws   nothing at all: no opportunity, no effort, no anything
 *                 -> dashboard and notifications must say so
 *   st6-app-ws    one opportunity, and deliberately ZERO ApplicationPart rows
 *                 -> the Part A budget / Gantt / Part B editor must open empty
 *
 * The second shape is the one a code read cannot settle: the fabrication used to
 * live in `useState` initialisers on the client, so the server can be clean and
 * the screen still full.
 *
 * The plan is `ultra` because M11 is only granted there (PLAN_GRANTS in
 * src/lib/billing/catalog.ts); a `ModuleState` row alone would still be refused
 * by the plan half of the gate.
 *
 * Idempotent: every write is an upsert on a fixed id. `--rollback` deletes
 * exactly these ids and nothing else.
 *
 *   pnpm tsx scripts/seed-st6-empty-e2e.ts
 *   pnpm tsx scripts/seed-st6-empty-e2e.ts --rollback
 */
import 'dotenv/config';
import crypto from 'crypto';

import { prisma } from '../src/lib/db';

export const ST6 = {
  bare: {
    tenantId: 'st6-bare-tenant',
    workspaceId: 'st6-bare-workspace',
    workspaceSlug: 'st6-bare-ws',
    userId: 'st6-bare-user',
    email: 'st6-bare@fabrika.test',
    /**
     * A real ApiKey row for the /api/v1/partners assertions. The raw value is
     * fixed and committed on purpose: it authenticates only this throwaway
     * fixture tenant, which `--rollback` deletes, and the alternative — a random
     * key printed to stdout — cannot be asserted from a spec.
     */
    apiKeyId: 'st6-bare-api-key',
    apiKeyRaw: 'fp_st6_fixture_key_do_not_use_in_production',
  },
  app: {
    tenantId: 'st6-app-tenant',
    workspaceId: 'st6-app-workspace',
    workspaceSlug: 'st6-app-ws',
    userId: 'st6-app-user',
    email: 'st6-app@fabrika.test',
    opportunityId: 'st6-app-opp',
    opportunityTitle: 'ST6 — opportunity with no application yet',
  },
} as const;

const MODULES = ['M5', 'M11'] as const;

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

  await prisma.subscription.upsert({
    where: { tenantId: t.tenantId },
    update: { planId: 'ultra', status: 'ACTIVE' },
    create: { tenantId: t.tenantId, planId: 'ultra', status: 'ACTIVE' },
  });

  for (const moduleId of MODULES) {
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: t.tenantId, moduleId } },
      update: { status: 'ON' },
      create: { tenantId: t.tenantId, moduleId, status: 'ON', changedBy: 'seed-st6-empty-e2e' },
    });
  }
}

export async function seed() {
  await seatTenant(ST6.bare);

  await prisma.apiKey.upsert({
    where: { id: ST6.bare.apiKeyId },
    update: {},
    create: {
      id: ST6.bare.apiKeyId,
      tenantId: ST6.bare.tenantId,
      name: 'ST6 fixture key',
      keyHash: crypto.createHash('sha256').update(ST6.bare.apiKeyRaw).digest('hex'),
      prefix: ST6.bare.apiKeyRaw.slice(0, 8),
    },
  });

  await seatTenant(ST6.app);

  const a = ST6.app;
  await prisma.opportunity.upsert({
    where: { id: a.opportunityId },
    update: { title: a.opportunityTitle },
    create: {
      id: a.opportunityId,
      tenantId: a.tenantId,
      workspaceId: a.workspaceId,
      title: a.opportunityTitle,
      stage: 'G2',
      status: 'ACTIVE',
      intendedRole: 'coordinator',
    },
  });

  // Deliberately NO ApplicationPart row. That absence is the whole point: the
  // screen must show it rather than fill it in.
  await prisma.applicationPart.deleteMany({ where: { opportunityId: a.opportunityId } });

  const parts = await prisma.applicationPart.count({ where: { opportunityId: a.opportunityId } });
  console.log(
    `[seed-st6-empty-e2e] ready — bare=${ST6.bare.workspaceSlug} app=${a.workspaceSlug} ` +
      `opportunity=${a.opportunityId} applicationParts=${parts}`,
  );
}

export async function rollback() {
  await prisma.apiKey.deleteMany({ where: { id: ST6.bare.apiKeyId } });
  await prisma.applicationPart.deleteMany({ where: { opportunityId: ST6.app.opportunityId } });
  await prisma.opportunity.deleteMany({ where: { id: ST6.app.opportunityId } });
  for (const t of [ST6.bare, ST6.app]) {
    await prisma.subscription.deleteMany({ where: { tenantId: t.tenantId } });
    await prisma.moduleState.deleteMany({ where: { tenantId: t.tenantId } });
    await prisma.membership.deleteMany({ where: { tenantId: t.tenantId, userId: t.userId } });
    await prisma.user.deleteMany({ where: { id: t.userId } });
    await prisma.workspace.deleteMany({ where: { id: t.workspaceId } });
    await prisma.tenant.deleteMany({ where: { id: t.tenantId } });
  }
  console.log('[seed-st6-empty-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-st6-empty-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-st6-empty-e2e] failed:', e);
      process.exit(1);
    });
}
