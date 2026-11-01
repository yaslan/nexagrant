/**
 * Two-tenant fixture for the document-export isolation tests, and its rollback.
 *
 * TASK-MTS9VGEKE8N3B: `/api/documents/export` had no `auth()` and no tenant
 * filter — `partId` went straight into `applicationPart.findUnique`, so any
 * caller who knew another tenant's ApplicationPart id could download that
 * tenant's Part B. Proving the fix needs a *second* tenant with a real Part B
 * row: a green happy path only shows the export works, not that it refuses
 * somebody else's id.
 *
 * Tenant A is the one the browser signs in as. Tenant B is never signed in as —
 * its part id is exactly the id an attacker would paste into the URL, and its
 * section text carries a marker string that must never reach A's download.
 *
 * Both tenants get `ultra` (M11 is granted by `ultra` only, see
 * src/lib/billing/catalog.ts PLAN_GRANTS) and every module ON, because the
 * Part B editor sits behind `moduleGate('M11')`.
 *
 * Idempotent; `--rollback` deletes exactly the ids below.
 *
 *   pnpm tsx scripts/seed-doc-export-e2e.ts
 *   pnpm tsx scripts/seed-doc-export-e2e.ts --rollback
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

export const DOC_E2E = {
  /** Tenant A — signed in. Its real name must be what the document prints. */
  email: 'doc-export-e2e-a@fabrika.test',
  tenantId: 'doc-export-e2e-tenant-a',
  tenantName: 'Doc Export E2E Kiracı A',
  workspaceId: 'doc-export-e2e-workspace-a',
  workspaceSlug: 'doc-export-e2e-ws-a',
  userId: 'doc-export-e2e-user-a',
  opportunityId: 'doc-export-e2e-opp-a',
  opportunityTitle: 'DOC-EXPORT-E2E-CAGRI-A',
  partId: 'doc-export-e2e-part-a',
  sectionText: 'KIRACI-A-PARTB-METNI',

  /** Tenant B — never signed in as; only its part id travels. */
  otherEmail: 'doc-export-e2e-b@fabrika.test',
  otherTenantId: 'doc-export-e2e-tenant-b',
  otherTenantName: 'Doc Export E2E Kiracı B',
  otherWorkspaceId: 'doc-export-e2e-workspace-b',
  otherWorkspaceSlug: 'doc-export-e2e-ws-b',
  otherUserId: 'doc-export-e2e-user-b',
  otherOpportunityId: 'doc-export-e2e-opp-b',
  otherOpportunityTitle: 'DOC-EXPORT-E2E-CAGRI-B',
  otherPartId: 'doc-export-e2e-part-b',
  /** If this string ever lands in tenant A's download, the isolation is broken. */
  otherSectionText: 'KIRACI-B-GIZLI-PARTB',
} as const;

const MODULE_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'] as const;

const TENANTS = [
  {
    tenantId: DOC_E2E.tenantId,
    tenantName: DOC_E2E.tenantName,
    slug: 'doc-export-e2e-a',
    workspaceId: DOC_E2E.workspaceId,
    workspaceSlug: DOC_E2E.workspaceSlug,
    userId: DOC_E2E.userId,
    email: DOC_E2E.email,
    opportunityId: DOC_E2E.opportunityId,
    opportunityTitle: DOC_E2E.opportunityTitle,
    partId: DOC_E2E.partId,
    sectionText: DOC_E2E.sectionText,
  },
  {
    tenantId: DOC_E2E.otherTenantId,
    tenantName: DOC_E2E.otherTenantName,
    slug: 'doc-export-e2e-b',
    workspaceId: DOC_E2E.otherWorkspaceId,
    workspaceSlug: DOC_E2E.otherWorkspaceSlug,
    userId: DOC_E2E.otherUserId,
    email: DOC_E2E.otherEmail,
    opportunityId: DOC_E2E.otherOpportunityId,
    opportunityTitle: DOC_E2E.otherOpportunityTitle,
    partId: DOC_E2E.otherPartId,
    sectionText: DOC_E2E.otherSectionText,
  },
] as const;

export async function seed() {
  for (const t of TENANTS) {
    await prisma.tenant.upsert({
      where: { id: t.tenantId },
      update: { name: t.tenantName },
      create: {
        id: t.tenantId,
        name: t.tenantName,
        slug: t.slug,
        country: 'TR',
        orgType: 'SME',
      },
    });

    await prisma.subscription.upsert({
      where: { tenantId: t.tenantId },
      update: { planId: 'ultra', status: 'ACTIVE' },
      create: { tenantId: t.tenantId, planId: 'ultra', status: 'ACTIVE' },
    });

    for (const moduleId of MODULE_IDS) {
      await prisma.moduleState.upsert({
        where: { tenantId_moduleId: { tenantId: t.tenantId, moduleId } },
        update: { status: 'ON' },
        create: { tenantId: t.tenantId, moduleId, status: 'ON' },
      });
    }

    await prisma.workspace.upsert({
      where: { id: t.workspaceId },
      update: {},
      create: {
        id: t.workspaceId,
        tenantId: t.tenantId,
        name: `Doc Export E2E ${t.slug}`,
        slug: t.workspaceSlug,
      },
    });

    await prisma.user.upsert({
      where: { id: t.userId },
      update: { email: t.email },
      create: { id: t.userId, email: t.email, name: `Doc Export E2E ${t.slug}`, locale: 'tr' },
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

    await prisma.opportunity.upsert({
      where: { id: t.opportunityId },
      update: { title: t.opportunityTitle },
      create: {
        id: t.opportunityId,
        tenantId: t.tenantId,
        workspaceId: t.workspaceId,
        title: t.opportunityTitle,
        stage: 'G0',
        status: 'ACTIVE',
      },
    });

    const content = {
      sections: [
        {
          key: '1.1_objectives',
          partGroup: '1_EXCELLENCE',
          title: '1.1 Objectives and Ambition',
          targetPages: 6,
          maxWords: 3000,
          content: t.sectionText,
        },
      ],
    };

    await prisma.applicationPart.upsert({
      where: { id: t.partId },
      update: { content, tenantId: t.tenantId, opportunityId: t.opportunityId },
      create: {
        id: t.partId,
        tenantId: t.tenantId,
        opportunityId: t.opportunityId,
        part: 'PART_B',
        content,
      },
    });
  }

  console.log(
    `[seed-doc-export-e2e] ready — A=${DOC_E2E.tenantId}/${DOC_E2E.partId} ` +
      `B=${DOC_E2E.otherTenantId}/${DOC_E2E.otherPartId}`,
  );
}

export async function rollback() {
  const tenantIds = TENANTS.map((t) => t.tenantId);
  const userIds = TENANTS.map((t) => t.userId);
  const workspaceIds = TENANTS.map((t) => t.workspaceId);
  const partIds = TENANTS.map((t) => t.partId);
  const opportunityIds = TENANTS.map((t) => t.opportunityId);

  await prisma.applicationPart.deleteMany({ where: { id: { in: partIds } } });
  await prisma.opportunity.deleteMany({ where: { id: { in: opportunityIds } } });
  await prisma.moduleState.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  console.log('[seed-doc-export-e2e] rolled back');
}

const isMain = process.argv[1]?.includes('seed-doc-export-e2e');
if (isMain) {
  (process.argv.includes('--rollback') ? rollback() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed-doc-export-e2e] failed:', e);
      process.exit(1);
    });
}
