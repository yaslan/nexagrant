import { prisma } from '../../../src/lib/db';
import { withSystemScope } from '../../../src/lib/system-scope';

/**
 * The world `tests/e2e/profile-pic.spec.ts` runs in (FO-383): two tenants that can compete for a
 * PIC, a member who may not change it, a CORDIS organisation with real-shaped history, and one
 * opportunity whose G0 score is measured before and after the PIC is saved.
 *
 * PP_PIC_MATCHED has one coordination and two collaborators in CORDIS. PP_PIC_UNMATCHED has no row.
 */
export const PP_TENANT = 'pp-e2e-tenant';
export const PP_OTHER_TENANT = 'pp-e2e-other-tenant';
export const PP_WORKSPACE = 'pp-e2e';
export const PP_OTHER_WORKSPACE = 'pp-e2e-other';
const PP_WORKSPACE_ID = 'pp-e2e-workspace';
const PP_OTHER_WORKSPACE_ID = 'pp-e2e-other-workspace';

export const PP_OWNER = { id: 'pp-e2e-owner', email: 'pp-e2e-owner@profile.test', tenantId: PP_TENANT, role: 'TENANT_OWNER' };
export const PP_MEMBER = { id: 'pp-e2e-member', email: 'pp-e2e-member@profile.test', tenantId: PP_TENANT, role: 'MEMBER' };
export const PP_OTHER_OWNER = { id: 'pp-e2e-other-owner', email: 'pp-e2e-other-owner@profile.test', tenantId: PP_OTHER_TENANT, role: 'TENANT_OWNER' };

/** Staff. Its membership is on the other tenant: what opens the admin console is `User.isPlatformAdmin`. */
export const PP_ADMIN = {
  id: 'pp-e2e-admin',
  email: 'pp-e2e-admin@profile.test',
  tenantId: PP_OTHER_TENANT,
  role: 'TENANT_OWNER',
  isPlatformAdmin: true,
};

export const PP_PIC_MATCHED = '987654321';
export const PP_PIC_UNMATCHED = '987654322';
export const PP_ORG_NAME = 'PP E2E Teknoloji Enstitüsü';
export const PP_OPP_ID = 'pp-e2e-opportunity';

const COLLABORATORS = ['987654331', '987654332'];
const PROJECT_ID = 'pp-e2e-project';
const PROGRAMME_ID = 'pp-e2e-programme';
const CALL_ID = 'pp-e2e-call';
const TOPIC_ID = 'pp-e2e-topic';
const TOPIC_IDENTIFIER = 'HORIZON-PPE2E-2026-01-D1-01';
const ALL_ORGS = [PP_PIC_MATCHED, ...COLLABORATORS];
const USER_IDS = [PP_OWNER.id, PP_MEMBER.id, PP_OTHER_OWNER.id, PP_ADMIN.id];
const TENANT_IDS = [PP_TENANT, PP_OTHER_TENANT];

export async function teardownProfilePic() {
  await withSystemScope('platform-admin', 'e2e.profile-pic.teardown', async (tx) => {
    await tx.gateDecision.deleteMany({ where: { opportunityId: PP_OPP_ID } });
    await tx.topicMatch.deleteMany({ where: { topicId: TOPIC_ID } });
    await tx.opportunity.deleteMany({ where: { id: PP_OPP_ID } });
    await tx.topicStat.deleteMany({ where: { topicId: TOPIC_ID } });
    await tx.topic.deleteMany({ where: { id: TOPIC_ID } });
    await tx.call.deleteMany({ where: { id: CALL_ID } });
    await tx.programme.deleteMany({ where: { id: PROGRAMME_ID } });
    await tx.cordisParticipation.deleteMany({ where: { projectId: PROJECT_ID } });
    await tx.cordisProject.deleteMany({ where: { id: PROJECT_ID } });
    await tx.cordisOrganization.deleteMany({ where: { organisationId: { in: ALL_ORGS } } });
    await tx.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await tx.subscription.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await tx.workspace.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await tx.user.deleteMany({ where: { id: { in: USER_IDS } } });
    await tx.user.deleteMany({ where: { id: { startsWith: 'pp-e2e-prober-' } } });
    await tx.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
  });
}

export async function setupProfilePic() {
  await teardownProfilePic();
  await withSystemScope('platform-admin', 'e2e.profile-pic.setup', async (tx) => {
    for (const [tenantId, workspaceId, slug] of [
      [PP_TENANT, PP_WORKSPACE_ID, PP_WORKSPACE],
      [PP_OTHER_TENANT, PP_OTHER_WORKSPACE_ID, PP_OTHER_WORKSPACE],
    ] as const) {
      await tx.tenant.create({ data: { id: tenantId, name: `profile pic e2e (${tenantId})`, slug: tenantId, country: 'TR', orgType: 'SME' } });
      await tx.subscription.create({ data: { tenantId, planId: 'ultra', status: 'ACTIVE' } });
      await tx.workspace.create({ data: { id: workspaceId, tenantId, name: 'profile pic e2e', slug } });
      await tx.tenantProfile.create({
        data: {
          tenantId,
          capabilities: 'Grid flexibility pilots',
          keywords: ['grid flexibility'],
          trlRange: [4, 7],
          naceCodes: [],
          preferredRoles: [],
        },
      });
    }
    for (const user of [PP_OWNER, PP_MEMBER, PP_OTHER_OWNER, PP_ADMIN]) {
      const workspaceId = user.tenantId === PP_TENANT ? PP_WORKSPACE_ID : PP_OTHER_WORKSPACE_ID;
      await tx.user.create({
        data: { id: user.id, email: user.email, name: user.id, locale: 'tr', isPlatformAdmin: user === PP_ADMIN },
      });
      await tx.membership.create({
        data: { tenantId: user.tenantId, userId: user.id, role: user.role as 'MEMBER', workspaceIds: [workspaceId] },
      });
    }

    await tx.cordisOrganization.create({ data: { organisationId: PP_PIC_MATCHED, name: PP_ORG_NAME, city: 'Ankara', country: 'TR' } });
    for (const organisationId of COLLABORATORS) {
      await tx.cordisOrganization.create({ data: { organisationId, name: `PP collaborator ${organisationId}`, country: 'DE' } });
    }
    await tx.cordisProject.create({
      data: { id: PROJECT_ID, title: 'PP E2E project', framework: 'HORIZON', masterCall: 'HORIZON-PPE2E-2026-01' },
    });
    await tx.cordisParticipation.create({ data: { projectId: PROJECT_ID, organisationId: PP_PIC_MATCHED, role: 'coordinator' } });
    for (const organisationId of COLLABORATORS) {
      await tx.cordisParticipation.create({ data: { projectId: PROJECT_ID, organisationId, role: 'participant' } });
    }

    await tx.programme.create({ data: { id: PROGRAMME_ID, name: 'PP E2E Programme', sourceKey: 'pp-e2e' } });
    await tx.call.create({
      data: { id: CALL_ID, programmeId: PROGRAMME_ID, callIdentifier: 'HORIZON-PPE2E-2026-01', title: 'PP E2E Call', currency: 'EUR' },
    });
    await tx.topic.create({
      data: {
        id: TOPIC_ID,
        callId: CALL_ID,
        identifier: TOPIC_IDENTIFIER,
        title: 'PP E2E Topic',
        typeOfAction: 'IA',
        isLumpSum: false,
        isTwoStage: false,
        budgetPerProjectCents: BigInt(400_000_000),
        deadlines: [{ stage: 1, at: '2026-12-15T17:00:00Z', tz: 'Europe/Brussels' }],
        eligibility: {},
        keywords: ['grid flexibility'],
      },
    });
    await tx.topicMatch.create({ data: { tenantId: PP_TENANT, topicId: TOPIC_ID, fitScore: 80, breakdown: { source: 'pp-e2e/k1' } } });
    await tx.topicStat.create({
      data: {
        topicId: TOPIC_ID,
        topicPrefix: 'HORIZON-PPE2E-2026-01-D1',
        country: 'TR',
        proposals: 100,
        funded: 18,
        successRate: 18,
        source: 'pp-e2e',
      },
    });
    await tx.opportunity.create({
      data: {
        id: PP_OPP_ID,
        tenantId: PP_TENANT,
        workspaceId: PP_WORKSPACE_ID,
        title: 'PP E2E Opportunity',
        topicId: TOPIC_ID,
        stage: 'G0',
        status: 'ACTIVE',
        intendedRole: 'coordinator',
      },
    });
  });
}

/**
 * An owner of the other tenant used only by the FO-386 limit test. Fresh on every call: the count
 * lives in the server process, so a fixed id would start the next run already over the limit.
 */
export async function addPicProber() {
  const id = `pp-e2e-prober-${Date.now()}`;
  const prober = { id, email: `${id}@profile.test`, tenantId: PP_OTHER_TENANT, role: 'TENANT_OWNER' };
  await withSystemScope('platform-admin', 'e2e.profile-pic.prober', async (tx) => {
    await tx.user.create({ data: { id, email: prober.email, name: id, locale: 'tr' } });
    await tx.membership.create({
      data: { tenantId: PP_OTHER_TENANT, userId: id, role: 'TENANT_OWNER', workspaceIds: [PP_OTHER_WORKSPACE_ID] },
    });
  });
  return prober;
}

/** `Tenant.pic` as stored, read past the page. */
export async function storedPic(tenantId: string): Promise<string | null> {
  const row = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } });
  return row?.pic ?? null;
}

export async function picAuditRows(tenantId: string, type = 'tenant.pic.updated') {
  return withSystemScope('platform-admin', 'e2e.profile-pic.audit', (tx) =>
    tx.auditEvent.findMany({
      where: { tenantId, type },
      orderBy: { createdAt: 'asc' },
      select: { actorId: true, data: true },
    }),
  );
}

/** What the board and the metrics read for the opportunity, as opposed to a fresh computation. */
export async function storedG0(tenantId: string, opportunityId: string) {
  return withSystemScope('platform-admin', 'e2e.profile-pic.stored-g0', async (tx) => {
    const opp = await tx.opportunity.findUnique({ where: { id: opportunityId }, select: { g0Score: true } });
    const match = await tx.topicMatch.findFirst({ where: { tenantId, opportunityId }, select: { g0Score: true } });
    return { opportunity: opp?.g0Score ?? null, topicMatch: match?.g0Score ?? null };
  });
}
