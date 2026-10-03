import type { Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';
import { signInAs } from './session';

/**
 * A tenant of its own for each Evidence Pack (M3) spec (TASK-MULU828HTNN4N).
 *
 * The evidence specs used to borrow tenant `cmtrhjys10001ncxk13gwtbcb`
 * (workspace `org-1xnfma`) and sign in as `owner@demo.fabrika.test`. That
 * tenant existed only in one developer database: `prisma/seed.ts` never creates
 * it, so on the CI database the first write, a `ModuleState` upsert, failed on
 * `ModuleState_tenantId_fkey` before a page was opened. The badge spec also
 * counted "the only document for this tenant", which a borrowed tenant cannot
 * promise.
 *
 * The plan is `basic`, which the catalogue grants M3 (the same plan
 * `module-gate-tenant.ts` relies on), and the M3 switch is `ON`, so the page
 * renders the pack rather than a lock screen. Everything is created before the
 * spec and deleted after it.
 */
export function evidenceTenant(key: string) {
  const tenantId = `ev-${key}-e2e-tenant`;
  const workspaceId = `ev-${key}-e2e-workspace`;
  const workspace = `ev-${key}-e2e`;
  const userId = `ev-${key}-e2e-user`;
  const email = `ev-${key}-e2e@fabrika.test`;
  const evidenceUrl = `/tr/${workspace}/evidence`;

  async function teardown() {
    // ClaimEvidenceLink, EvidenceReminder and ProposalUsage cascade from Evidence;
    // Evidence and Claim carry a bare tenantId with no relation to cascade from.
    await prisma.evidence.deleteMany({ where: { tenantId } });
    await prisma.claim.deleteMany({ where: { tenantId } });
    await prisma.membership.deleteMany({ where: { tenantId } });
    await prisma.moduleState.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.workspace.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  async function setup() {
    // A previous run that died mid-spec must not leave documents that change
    // what this one counts.
    await teardown();

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: `evidence ${key} e2e (internal)`,
        slug: tenantId,
        country: 'TR',
        orgType: 'SME',
      },
    });
    await prisma.subscription.create({
      data: { tenantId, planId: 'basic', status: 'ACTIVE' },
    });
    await prisma.moduleState.create({
      data: { tenantId, moduleId: 'M3', status: 'ON', changedBy: 'evidence e2e fixture' },
    });
    await prisma.workspace.create({
      data: { id: workspaceId, tenantId, name: `evidence ${key} e2e`, slug: workspace },
    });
    // Sign-in provisions a tenant for an address it does not know, so the user
    // has to exist, with its membership, before the spec signs in.
    await prisma.user.create({
      data: { id: userId, email, name: `Evidence ${key} E2E`, locale: 'tr' },
    });
    await prisma.membership.create({
      data: { tenantId, userId, role: 'TENANT_OWNER', workspaceIds: [workspaceId] },
    });
  }

  /** Sign in via JWT session cookie. */
  async function signIn(page: Page): Promise<string> {
    await signInAs(page, {
      id: userId,
      email,
      name: `Evidence ${key} E2E`,
      tenantId,
      role: 'TENANT_OWNER',
    });
    await page.goto(evidenceUrl);
    return userId;
  }

  return { tenantId, workspace, email, evidenceUrl, setup, teardown, signIn, userId };
}
