/**
 * FO-389 — the PIC question from accounts anyone can open, with real clicks on an isolated database.
 *
 * Three tenants: two nobody vouched for (no agency invitation, no subscription) and one with a
 * pilot behind it. The first open account meets the lower hourly limit. Then the shared daily
 * budget is spent, and the second open account gets one answer whatever it asks, a PIC CORDIS lists
 * or one it does not. The pilot account is not touched by either and still gets the real answer.
 *
 * The budget row is shared by every unsolicited account, so this spec owns it while it runs: no
 * other spec changes a PIC from an open account.
 */
import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { PIC_LOOKUPS_PER_HOUR_UNSOLICITED, PIC_UNSOLICITED_LOOKUPS_PER_DAY } from '../../src/lib/pic';
import { budgetDay } from '../../src/lib/pic-budget';
import { presentIds, requireId } from '../helpers/teardown-guard';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

const LISTED_PIC = '987650001';
const LISTED_NAME = 'PU E2E Listed Institute';
const FRESH_PICS = ['987650011', '987650012', '987650013', '987650014'];

const SEATS = [
  { key: 'openA', tenantId: 'pu-e2e-open-a', slug: 'pu-e2e-open-a', pilot: false },
  { key: 'openB', tenantId: 'pu-e2e-open-b', slug: 'pu-e2e-open-b', pilot: false },
  { key: 'pilot', tenantId: 'pu-e2e-pilot', slug: 'pu-e2e-pilot', pilot: true },
].map((seat) => ({
  ...seat,
  workspaceId: `${seat.slug}-ws`,
  user: { id: `${seat.slug}-owner`, email: `${seat.slug}-owner@profile.test`, tenantId: seat.tenantId, role: 'TENANT_OWNER' as const },
}));
const [OPEN_A, OPEN_B, PILOT] = SEATS as [(typeof SEATS)[number], (typeof SEATS)[number], (typeof SEATS)[number]];
const TENANT_IDS = SEATS.map((s) => s.tenantId);
const USER_IDS = SEATS.map((s) => s.user.id);

async function teardown() {
  await withSystemScope('platform-admin', 'e2e.profile-pic-unsolicited.teardown', async (tx) => {
    await tx.cordisOrganization.deleteMany({ where: { organisationId: LISTED_PIC } });
    await tx.membership.deleteMany({ where: { tenantId: { in: presentIds(TENANT_IDS) } } });
    await tx.subscription.deleteMany({ where: { tenantId: { in: presentIds(TENANT_IDS) } } });
    await tx.workspace.deleteMany({ where: { tenantId: { in: presentIds(TENANT_IDS) } } });
    await tx.user.deleteMany({ where: { id: { in: presentIds(USER_IDS) } } });
    await tx.tenant.deleteMany({ where: { id: { in: presentIds(TENANT_IDS) } } });
  });
  await prisma.picLookupBudget.deleteMany({ where: { day: requireId(budgetDay(new Date()), 'day') } });
}

async function setup() {
  await teardown();
  await withSystemScope('platform-admin', 'e2e.profile-pic-unsolicited.setup', async (tx) => {
    for (const seat of SEATS) {
      await tx.tenant.create({ data: { id: seat.tenantId, name: `pic unsolicited e2e (${seat.key})`, slug: seat.tenantId, country: 'TR', orgType: 'SME' } });
      if (seat.pilot) {
        await tx.subscription.create({ data: { tenantId: seat.tenantId, planId: 'public-team', status: 'ACTIVE', provider: 'pilot' } });
      }
      await tx.workspace.create({ data: { id: seat.workspaceId, tenantId: seat.tenantId, name: 'pic unsolicited e2e', slug: seat.slug } });
      await tx.tenantProfile.create({
        data: { tenantId: seat.tenantId, capabilities: 'Grid flexibility pilots', keywords: ['grid flexibility'], trlRange: [4, 7], naceCodes: [], preferredRoles: [] },
      });
      await tx.user.create({ data: { id: seat.user.id, email: seat.user.email, name: seat.user.id, locale: 'tr' } });
      await tx.membership.create({
        data: { tenantId: seat.tenantId, userId: seat.user.id, role: 'TENANT_OWNER', workspaceIds: [seat.workspaceId] },
      });
    }
    await tx.cordisOrganization.create({ data: { organisationId: LISTED_PIC, name: LISTED_NAME, city: 'Ankara', country: 'TR' } });
  });
}

async function open(page: Page, seat: (typeof SEATS)[number]) {
  await signInAs(page, seat.user);
  await page.goto(`/tr/${seat.slug}/settings/profile`);
  await expectHydrated(page.getByTestId('tenant-pic-input'));
}

const input = (page: Page) => page.getByTestId('tenant-pic-input');
const feedback = (page: Page) => page.getByTestId('tenant-pic-feedback');
const save = (page: Page) => page.getByRole('button', { name: 'Profili Kaydet' }).click();
const storedPic = async (tenantId: string) => (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } }))?.pic ?? null;
const spent = async () => (await prisma.picLookupBudget.findUnique({ where: { day: budgetDay(new Date()) } }))?.count ?? 0;

test.describe('FO-389 — PIC from accounts nobody vouched for', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(setup);
  test.afterAll(async () => {
    await teardown();
    await prisma.$disconnect();
  });

  test('an open account is stopped after the lower hourly limit, and each ask spends the shared budget', async ({ page }) => {
    await open(page, OPEN_A);
    for (let i = 0; i < PIC_LOOKUPS_PER_HOUR_UNSOLICITED; i++) {
      await input(page).fill(FRESH_PICS[i]!);
      await save(page);
      await expect(feedback(page)).toContainText("CORDIS'te bu koda ait kayıt bulamadık");
      expect(await storedPic(OPEN_A.tenantId)).toBe(FRESH_PICS[i]);
    }
    expect(await spent()).toBe(PIC_LOOKUPS_PER_HOUR_UNSOLICITED);

    await input(page).fill(FRESH_PICS[PIC_LOOKUPS_PER_HOUR_UNSOLICITED]!);
    await save(page);
    const limited = feedback(page).getByRole('alert');
    await expect(limited).toContainText('çok fazla PIC denemesi');
    await expect(limited).toContainText(/\d+ dakika sonra/);
    await expect(input(page)).toBeFocused();
    // The refused ask changed nothing and cost nothing.
    expect(await storedPic(OPEN_A.tenantId)).toBe(FRESH_PICS[PIC_LOOKUPS_PER_HOUR_UNSOLICITED - 1]);
    expect(await spent()).toBe(PIC_LOOKUPS_PER_HOUR_UNSOLICITED);
    console.log(`[FO-389] open account: ${PIC_LOOKUPS_PER_HOUR_UNSOLICITED} asks answered, the next one limited; budget spent=${await spent()}`);
  });

  test('once the day is spent a second open account gets one answer, a listed PIC or not', async ({ page }) => {
    await prisma.picLookupBudget.upsert({
      where: { day: budgetDay(new Date()) },
      create: { day: budgetDay(new Date()), count: PIC_UNSOLICITED_LOOKUPS_PER_DAY },
      update: { count: PIC_UNSOLICITED_LOOKUPS_PER_DAY },
    });
    await open(page, OPEN_B);

    const answers: string[] = [];
    for (const pic of [LISTED_PIC, FRESH_PICS[3]!]) {
      await input(page).fill(pic);
      await save(page);
      const limited = feedback(page).getByRole('alert');
      await expect(limited).toContainText('çok fazla PIC denemesi');
      // Nothing about what CORDIS holds or who else has the PIC.
      await expect(limited).not.toContainText(LISTED_NAME);
      await expect(limited).not.toContainText('başka bir hesapta');
      await expect(page.getByTestId('tenant-pic-confirm')).toHaveCount(0);
      answers.push(((await limited.textContent()) ?? '').replace(/\d+ dakika/, 'N dakika'));
    }
    expect(answers[0]).toBe(answers[1]);
    expect(await storedPic(OPEN_B.tenantId)).toBeNull();
    expect(await spent()).toBe(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
    console.log(`[FO-389] day spent: listed and unlisted PIC got the same answer: "${answers[0]}"`);
  });

  test('the same spent day does not touch a pilot account: it still gets the real answer', async ({ page }) => {
    expect(await spent()).toBe(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
    await open(page, PILOT);
    await input(page).fill(LISTED_PIC);
    await save(page);
    const confirm = page.getByTestId('tenant-pic-confirm');
    await expect(confirm).toContainText(LISTED_NAME);
    await expect(confirm).toContainText('Ankara, TR');
    expect(await spent()).toBe(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
    console.log(`[FO-389] day spent: pilot account saw "${LISTED_NAME}" and the confirm prompt; budget untouched=${await spent()}`);
  });
});
