import type { Locator, Page } from '@playwright/test';

import { prisma } from '../../../src/lib/db';
import { requireId } from '../../helpers/teardown-guard';

/**
 * TASK-MUOAYGYXW8PHI — long, real-world content for the mobile overflow guard
 * (tests/e2e/mobile-main-overflow.spec.ts).
 *
 * The seed only has short titles and no approval requests, so the guard could
 * not see what a user actually types: a link pasted into a title or a
 * description is one token with no break opportunity (İNCELEME-96 Y-1/Y-2).
 * These rows carry exactly that. Every id is unique to the run and `remove`
 * deletes by id only — never a broad delete.
 */

export const LONG_URL = 'https://docs.example.test/fonbridge/wp3/butce-revizyonu-2027-q1.pdf';

const TENANT_ID = 'demo-tenant';
const WORKSPACE_ID = 'demo-workspace';
const ADMIN_ID = 'demo-user-superadmin';
// Any other seeded member: a request someone else raised shows the checker's
// approve/reject buttons, the widest action row a card has.
const OTHER_ID = 'demo-user-ivan';

export function longContentFixture(run: string) {
  return {
    opportunityId: `mobile-long-opp-${run}`,
    opportunityTitle: `WP3 bütçe revizyonu — ${LONG_URL}`,
    mineId: `mobile-long-mine-${run}`,
    theirsId: `mobile-long-theirs-${run}`,
    rejectedId: `mobile-long-rejected-${run}`,
    longEmailRequester: `approvals-requester-long-email-${run}@consortium.example.test`,
    requestTitle: `Bütçe revizyonu onayı: ${LONG_URL}`,
    requestDescription: `Revize bütçe tablosu: ${LONG_URL} (WP3, 2027 Q1)`,
  };
}

export type LongContentFixture = ReturnType<typeof longContentFixture>;

export async function plant(f: LongContentFixture) {
  await prisma.user.upsert({
    where: { email: f.longEmailRequester },
    update: {},
    create: {
      id: `mobile-long-requester-${f.rejectedId}`,
      email: f.longEmailRequester,
      name: null,
    },
  });
  await prisma.opportunity.create({
    data: {
      id: f.opportunityId,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      title: f.opportunityTitle,
      topicId: 'HORIZON-CL5-2027-D3-01-10',
    },
  });
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await prisma.approvalRequest.createMany({
    data: [
      { id: f.mineId, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, actionType: 'BUDGET_ALLOCATION', title: f.requestTitle, description: f.requestDescription, payload: { amount: 125000, currency: 'EUR' }, requesterId: ADMIN_ID, expiresAt },
      { id: f.theirsId, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, actionType: 'BUDGET_ALLOCATION', title: f.requestTitle, description: f.requestDescription, payload: { amount: 125000, currency: 'EUR' }, requesterId: OTHER_ID, expiresAt },
      { id: f.rejectedId, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, actionType: 'BUDGET_ALLOCATION', title: f.requestTitle, description: f.requestDescription, payload: { amount: 125000, currency: 'EUR' }, requesterId: f.longEmailRequester, status: 'REJECTED', rejectionReason: 'WP3_ButceRevizyonu_PreTerm_Adjustment_2027Q1_ConsortiumPartnerReview_LongNameWithoutBreakOpportunity', expiresAt },
    ],
  });
}

export async function remove(f: LongContentFixture) {
  const requests = await prisma.approvalRequest.deleteMany({
    where: { id: { in: [f.mineId, f.theirsId, f.rejectedId] } },
  });
  const opportunities = await prisma.opportunity.deleteMany({
    where: { id: requireId(f.opportunityId, 'opportunityId') },
  });
  return requests.count + opportunities.count;
}

/** `<main>` is the scroll box: anything wider than it slides the page sideways. */
export function mainOverflow(page: Page): Promise<number> {
  return page.locator('main').evaluate((el) => el.scrollWidth - el.clientWidth);
}

/** Whether `inner` lies entirely inside `outer` horizontally (1px rounding slack). */
export async function fitsHorizontally(inner: Locator, outer: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  if (!a || !b) return false;
  return a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1;
}

/** Whether `lower` starts at or below the bottom edge of `upper`. */
export async function isBelow(lower: Locator, upper: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([lower.boundingBox(), upper.boundingBox()]);
  if (!a || !b) return false;
  return a.y >= b.y + b.height - 1;
}

/**
 * Replace the text of every element whose whole text is one of `texts` with a
 * much longer unbroken word. For labels that come from code constants (no row
 * to plant): the layout has to hold for the next, longer name too.
 */
export function stretchTexts(page: Page, texts: string[], suffix: string): Promise<number> {
  return page.evaluate(
    ({ texts, suffix }) => {
      let n = 0;
      for (const el of document.querySelectorAll<HTMLElement>('main span')) {
        if (el.children.length === 0 && texts.includes(el.textContent ?? '')) {
          el.textContent = `${el.textContent}${suffix}`;
          n++;
        }
      }
      return n;
    },
    { texts, suffix },
  );
}
