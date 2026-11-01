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
import fs from 'fs';
import path from 'path';

import { prisma } from '../src/lib/db';
import { Prisma } from '@prisma/client';
import type {
  CordisCoParticipation,
  CordisImportRun,
  CordisOrganization,
  CordisParticipation,
  CordisPartnerProfile,
  CordisProject,
  CordisProjectSciVoc,
  CordisProjectTopic,
} from '@prisma/client';

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

// M1 for the Partner REST API: /api/v1/* is gated by it (TASK-MVDPYNG1JI0S1), and
// point 1 below calls that API with the bare tenant's key.
const MODULES = ['M1', 'M5', 'M11'] as const;

interface CordisBackup {
  cordisCoParticipations: CordisCoParticipation[];
  cordisPartnerProfiles: CordisPartnerProfile[];
  cordisParticipations: CordisParticipation[];
  cordisProjectTopics: CordisProjectTopic[];
  cordisProjectSciVocs: CordisProjectSciVoc[];
  cordisOrganizations: CordisOrganization[];
  cordisProjects: CordisProject[];
  cordisImportRuns: CordisImportRun[];
}

function toJsonInput(val: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (val === null || val === undefined) {
    return Prisma.JsonNull;
  }
  return val as Prisma.InputJsonValue;
}

let cordisBackupInMemory: CordisBackup | null = null;
const BACKUP_FILE = path.join(__dirname, '.st6-cordis-backup.json');

async function backupAndClearCordis() {
  const cordisCoParticipations = await prisma.cordisCoParticipation.findMany();
  const cordisPartnerProfiles = await prisma.cordisPartnerProfile.findMany();
  const cordisParticipations = await prisma.cordisParticipation.findMany();
  const cordisProjectTopics = await prisma.cordisProjectTopic.findMany();
  const cordisProjectSciVocs = await prisma.cordisProjectSciVoc.findMany();
  const cordisOrganizations = await prisma.cordisOrganization.findMany();
  const cordisProjects = await prisma.cordisProject.findMany();
  const cordisImportRuns = await prisma.cordisImportRun.findMany();

  const backupData: CordisBackup = {
    cordisCoParticipations,
    cordisPartnerProfiles,
    cordisParticipations,
    cordisProjectTopics,
    cordisProjectSciVocs,
    cordisOrganizations,
    cordisProjects,
    cordisImportRuns,
  };

  cordisBackupInMemory = backupData;
  fs.writeFileSync(
    BACKUP_FILE,
    JSON.stringify(backupData, (_key, value) =>
      typeof value === 'bigint' ? { __bigint: value.toString() } : value
    )
  );

  await prisma.cordisCoParticipation.deleteMany();
  await prisma.cordisPartnerProfile.deleteMany();
  await prisma.cordisParticipation.deleteMany();
  await prisma.cordisProjectTopic.deleteMany();
  await prisma.cordisProjectSciVoc.deleteMany();
  await prisma.cordisOrganization.deleteMany();
  await prisma.cordisProject.deleteMany();
  await prisma.cordisImportRun.deleteMany();
}

async function restoreCordis() {
  await prisma.cordisCoParticipation.deleteMany();
  await prisma.cordisPartnerProfile.deleteMany();
  await prisma.cordisParticipation.deleteMany();
  await prisma.cordisProjectTopic.deleteMany();
  await prisma.cordisProjectSciVoc.deleteMany();
  await prisma.cordisOrganization.deleteMany();
  await prisma.cordisProject.deleteMany();
  await prisma.cordisImportRun.deleteMany();

  let data = cordisBackupInMemory;
  if (!data && fs.existsSync(BACKUP_FILE)) {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    data = JSON.parse(raw, (_key, value) => {
      if (value && typeof value === 'object' && '__bigint' in value) {
        return BigInt(value.__bigint as string);
      }
      return value;
    }) as CordisBackup;
  }

  if (data) {
    if (data.cordisProjects.length > 0) {
      await prisma.cordisProject.createMany({
        data: data.cordisProjects.map((p) => ({
          ...p,
          rawJson: toJsonInput(p.rawJson),
          startDate: p.startDate ? new Date(p.startDate) : null,
          endDate: p.endDate ? new Date(p.endDate) : null,
          ecSignatureDate: p.ecSignatureDate ? new Date(p.ecSignatureDate) : null,
          contentUpdateDate: p.contentUpdateDate ? new Date(p.contentUpdateDate) : null,
          importedAt: p.importedAt ? new Date(p.importedAt) : new Date(),
        })),
      });
    }
    if (data.cordisOrganizations.length > 0) {
      await prisma.cordisOrganization.createMany({
        data: data.cordisOrganizations.map((o) => ({
          ...o,
          rawJson: toJsonInput(o.rawJson),
          updatedAt: o.updatedAt ? new Date(o.updatedAt) : new Date(),
        })),
      });
    }
    if (data.cordisImportRuns.length > 0) {
      await prisma.cordisImportRun.createMany({
        data: data.cordisImportRuns.map((r) => ({
          ...r,
          rowCounts: toJsonInput(r.rowCounts),
          startedAt: r.startedAt ? new Date(r.startedAt) : new Date(),
          finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
        })),
      });
    }
    if (data.cordisProjectTopics.length > 0) {
      await prisma.cordisProjectTopic.createMany({ data: data.cordisProjectTopics });
    }
    if (data.cordisProjectSciVocs.length > 0) {
      await prisma.cordisProjectSciVoc.createMany({ data: data.cordisProjectSciVocs });
    }
    if (data.cordisParticipations.length > 0) {
      await prisma.cordisParticipation.createMany({ data: data.cordisParticipations });
    }
    if (data.cordisPartnerProfiles.length > 0) {
      await prisma.cordisPartnerProfile.createMany({
        data: data.cordisPartnerProfiles.map((p) => ({
          ...p,
          topTopics: toJsonInput(p.topTopics),
          topCountries: toJsonInput(p.topCountries),
          topPartners: toJsonInput(p.topPartners),
          lastProjectDate: p.lastProjectDate ? new Date(p.lastProjectDate) : null,
          updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        })),
      });
    }
    if (data.cordisCoParticipations.length > 0) {
      await prisma.cordisCoParticipation.createMany({ data: data.cordisCoParticipations });
    }

    if (fs.existsSync(BACKUP_FILE)) {
      fs.unlinkSync(BACKUP_FILE);
    }
    cordisBackupInMemory = null;
  }
}

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
  await backupAndClearCordis();
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
  await restoreCordis();
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

