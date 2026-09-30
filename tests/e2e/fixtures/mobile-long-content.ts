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
// A link breaks after its slashes and hyphens; a file name typed with
// underscores has no break opportunity at all. The archive band and the
// rejection reason only overflowed with a word like this (İNCELEME-109 Y-1, B-1).
export const LONG_WORD = 'WP3_ButceRevizyonu_KonsorsiyumOrtaklariOnayli_FinalVersiyon12_EkTablolarDahil_2027Q1';

const TENANT_ID = 'demo-tenant';
const WORKSPACE_ID = 'demo-workspace';
const ADMIN_ID = 'demo-user-superadmin';

export function longContentFixture(run: string) {
  return {
    opportunityId: `mobile-long-opp-${run}`,
    opportunityTitle: `WP3 bütçe revizyonu — ${LONG_URL} — ${LONG_WORD}`,
    mineId: `mobile-long-mine-${run}`,
    theirsId: `mobile-long-theirs-${run}`,
    rejectedId: `mobile-long-rejected-${run}`,
    // Someone else's request shows the checker's approve/reject buttons, the
    // widest action row a card has. This requester has no name, so the card
    // prints the e-mail: no hyphen in it, so no break opportunity either.
    requesterId: `mobile-long-requester-${run}`,
    requesterEmail: `projekoordinatorlugu.horizoneuropebasvurulari.${run}@arastirmamerkezi.universite.example.edu.tr`,
    requestTitle: `Bütçe revizyonu onayı: ${LONG_URL}`,
    requestDescription: `Revize bütçe tablosu: ${LONG_URL} (WP3, 2027 Q1)`,
    rejectedTitle: `Reddedilen bütçe revizyonu: ${LONG_URL}`,
    rejectionReason: `Eksik belge: ${LONG_WORD}`,
  };
}

export type LongContentFixture = ReturnType<typeof longContentFixture>;

/** Rows `plant` creates and `remove` deletes: three requests, the opportunity, the requester. */
export const PLANTED_ROWS = 5;

export async function plant(f: LongContentFixture) {
  await prisma.user.create({ data: { id: f.requesterId, email: f.requesterEmail, name: null } });
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
  const base = {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    actionType: 'BUDGET_ALLOCATION',
    payload: { amount: 125000, currency: 'EUR' },
    expiresAt,
  };
  await prisma.approvalRequest.createMany({
    data: [
      { ...base, id: f.mineId, title: f.requestTitle, description: f.requestDescription, requesterId: ADMIN_ID },
      { ...base, id: f.theirsId, title: f.requestTitle, description: f.requestDescription, requesterId: f.requesterId },
      // The admin's own, so "My requests" shows it with its reason.
      {
        ...base,
        id: f.rejectedId,
        title: f.rejectedTitle,
        description: f.requestDescription,
        requesterId: ADMIN_ID,
        status: 'REJECTED',
        approverId: f.requesterId,
        rejectionReason: f.rejectionReason,
      },
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
  const users = await prisma.user.deleteMany({
    where: { id: requireId(f.requesterId, 'requesterId') },
  });
  return requests.count + opportunities.count + users.count;
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
