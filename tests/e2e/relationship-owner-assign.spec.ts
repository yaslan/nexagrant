import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { REL_E2E, seed, rollback } from '../../scripts/seed-relationship-e2e';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTTOUDNQ97X83 F-2 — assigning a focal point, in a real browser.
 *
 * The erasure job sets `Relationship.ownerUserId` to NULL when the person it
 * named is erased. Nothing in the product could write that column afterwards,
 * so the relationship stayed unassigned for good and its overdue `nextStep`
 * reached nobody. The live suite
 * (tests/relationship-owner-assignment.live.test.ts) pins the server rule;
 * this file proves the customer-facing half — that a human can actually pick a
 * new focal point, that the picker offers this tenant's members and nobody
 * else's, and that the click lands in the database.
 *
 * The fixture's own relationship belongs to another spec, so this one adds its
 * own unassigned row and its own second member, and removes both afterwards.
 */

const SHOTS = shotsDir('TASK-MTTOUDNQ97X83-screenshots');

const OWN = {
  relationshipId: 'rel-owner-e2e-relationship',
  counterpartName: 'Sahipsiz İlişki — Odak Noktası Yok',
  secondUserId: 'rel-owner-e2e-user-a2',
  secondUserName: 'İkinci Üye A',
  secondUserEmail: 'rel-owner-e2e-a2@fabrika.test',
};

const URL = `/tr/${REL_E2E.workspaceSlug}/relationships/${OWN.relationshipId}`;

test.describe.configure({ mode: 'serial' });

test.describe('M4 relationships — focal-point assignment', () => {
  test.beforeAll(async () => {
    await seed();
    await prisma.user.upsert({
      where: { id: OWN.secondUserId },
      update: { name: OWN.secondUserName },
      create: {
        id: OWN.secondUserId,
        email: OWN.secondUserEmail,
        name: OWN.secondUserName,
        locale: 'tr',
      },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: REL_E2E.tenantId, userId: OWN.secondUserId } },
      update: { role: 'MEMBER' },
      create: {
        tenantId: REL_E2E.tenantId,
        userId: OWN.secondUserId,
        role: 'MEMBER',
        workspaceIds: [REL_E2E.workspaceId],
      },
    });
    // The state the purge leaves behind: a relationship with no focal point.
    await prisma.relationship.upsert({
      where: { id: OWN.relationshipId },
      update: { ownerUserId: null, tenantId: REL_E2E.tenantId },
      create: {
        id: OWN.relationshipId,
        tenantId: REL_E2E.tenantId,
        ownerUserId: null,
        kind: 'partner',
        counterpartName: OWN.counterpartName,
        warmth: 'warm',
      },
    });
  });

  test.afterAll(async () => {
    if (process.env.REL_E2E_KEEP !== '1') {
      await prisma.relationship.deleteMany({ where: { id: OWN.relationshipId } });
      await prisma.membership.deleteMany({ where: { userId: OWN.secondUserId } });
      await prisma.user.deleteMany({ where: { id: OWN.secondUserId } });
      await rollback();
    }
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // The cookie banner is a full-screen `inset-0` alertdialog that swallows clicks.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
  });

  async function signIn(page: import('@playwright/test').Page, target: string) {
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
    await page.locator('input[type="email"]').fill(REL_E2E.email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${target}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
  }

  test('an unassigned relationship gets a focal point by clicking', async ({ page }) => {
    // Asserted rather than assumed: if the row already had an owner, a green
    // run below would prove nothing about assigning one.
    const before = await prisma.relationship.findUnique({
      where: { id: OWN.relationshipId },
      select: { ownerUserId: true },
    });
    expect(before?.ownerUserId, 'fixture must start unassigned').toBeNull();

    await signIn(page, URL);
    await expect(page.getByTestId('relationship-title')).toHaveText(OWN.counterpartName);

    const picker = page.getByTestId('relationship-owner');
    await expect(picker).toBeVisible();
    // The empty option is the state the purge left the row in.
    await expect(picker).toHaveValue('');
    await page.screenshot({ path: `${SHOTS}/01-unassigned-before.png`, fullPage: true });

    // The picker may only offer this tenant's people. Tenant B's user is a real
    // row in the database and must not appear here.
    const optionValues = await picker.locator('option').evaluateAll((els) =>
      els.map((el) => (el as HTMLOptionElement).value),
    );
    expect(optionValues).toContain(OWN.secondUserId);
    expect(optionValues).toContain(REL_E2E.userId);
    expect(optionValues).not.toContain(REL_E2E.otherUserId);

    await picker.selectOption(OWN.secondUserId);
    await page.getByTestId('relationship-save').click();
    await expect(page.getByTestId('relationship-save-status')).toHaveText('Kaydedildi.');
    await page.screenshot({ path: `${SHOTS}/02-assigned-saved.png`, fullPage: true });

    // The claim that matters is the database's, not the screen's.
    const after = await prisma.relationship.findUnique({
      where: { id: OWN.relationshipId },
      select: { ownerUserId: true },
    });
    expect(after?.ownerUserId).toBe(OWN.secondUserId);
  });

  test('the assignment survives a reload', async ({ page }) => {
    await signIn(page, URL);
    await expect(page.getByTestId('relationship-owner')).toHaveValue(OWN.secondUserId);
    await page.screenshot({ path: `${SHOTS}/03-after-reload.png`, fullPage: true });
  });

  test('the same screen in English says the same thing', async ({ page }) => {
    const enUrl = `/en/${REL_E2E.workspaceSlug}/relationships/${OWN.relationshipId}`;
    await signIn(page, enUrl);

    await expect(page.locator('label[for="rel-owner"]')).toHaveText('Focal point');
    await expect(page.getByText('Only members of this tenant can be assigned.')).toBeVisible();
    // No Turkish may survive in the screen's own copy. Asserted over the form
    // labels rather than the whole page: the fixture's counterpart *name* is
    // Turkish on purpose (it is tenant data, not UI text), and a page-wide
    // `getByText('Odak noktası')` matches it — that is what made this
    // assertion red on a screen that was already correct.
    const labels = await page.locator('form label, .bg-surface label').allInnerTexts();
    expect(labels.join(' | ')).not.toMatch(/Odak|Sıcaklık|Notlar|Sonraki Adım/);
    // The member picker must not fall back to the Turkish role labels either.
    // Asserted as an exact list rather than a keyword scan — the fixture's own
    // member is *named* "İkinci Üye A", so a `/Üye/` scan flags a name, not a
    // label. What must not be there is the ` — <role>` suffix.
    const options = await page.getByTestId('relationship-owner').locator('option').allInnerTexts();
    expect(options.map((o) => o.trim())).toEqual([
      'Unassigned',
      'Rel E2E rel-e2e-a',
      OWN.secondUserName,
    ]);
    await page.screenshot({ path: `${SHOTS}/04-english.png`, fullPage: true });
  });

  test('the focal point can be cleared again', async ({ page }) => {
    await signIn(page, URL);

    await page.getByTestId('relationship-owner').selectOption('');
    await page.getByTestId('relationship-save').click();
    await expect(page.getByTestId('relationship-save-status')).toHaveText('Kaydedildi.');

    const after = await prisma.relationship.findUnique({
      where: { id: OWN.relationshipId },
      select: { ownerUserId: true },
    });
    expect(after?.ownerUserId).toBeNull();
    await page.screenshot({ path: `${SHOTS}/05-unassigned-again.png`, fullPage: true });
  });
});
