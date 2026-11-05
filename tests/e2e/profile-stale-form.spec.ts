/**
 * FO-387 — a Kurumsal Profil form left open, with real clicks in separate browser sessions.
 *
 * The form used to send every field on every save, so a form opened before a colleague's save put
 * the old capabilities, keywords and TRL back, even when the user only came to enter a PIC. On a
 * tenant that never saved a profile the same save wrote the form's sample text as the real profile.
 * The DB values are logged raw (PROBE) because they are the evidence the card asks for.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';

import { prisma, withTenant } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { computeG0ForOpportunity } from '../../src/lib/scoring/g0-compute';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';
import {
  PP_OPP_ID,
  PP_OTHER_TENANT,
  PP_OTHER_WORKSPACE,
  PP_PIC_UNMATCHED,
  PP_TENANT,
  PP_WORKSPACE,
  addPicProber,
  picAuditRows,
  setupProfilePic,
  storedPic,
  teardownProfilePic,
} from './fixtures/profile-pic-tenant';

const PROFILE_URL = `/tr/${PP_WORKSPACE}/settings/profile`;
const OTHER_PROFILE_URL = `/tr/${PP_OTHER_WORKSPACE}/settings/profile`;
const OPENED = { capabilities: 'Grid flexibility pilots', keywords: ['unrelated'], trlRange: [4, 7] };

type Owner = Awaited<ReturnType<typeof addPicProber>>;

/**
 * An owner of the main tenant. The PIC limit counts per user in the server process, so these specs
 * get their own users and leave the 20 asks of the FO-383 owner alone. The fixture's teardown takes
 * every `pp-e2e-prober-*` user and every membership of the tenant.
 */
async function addOwner(tag: string): Promise<Owner> {
  const id = `pp-e2e-prober-${tag}-${Date.now()}`;
  const owner = { id, email: `${id}@profile.test`, tenantId: PP_TENANT, role: 'TENANT_OWNER' };
  await withSystemScope('platform-admin', 'e2e.profile-stale.owner', async (tx) => {
    await tx.user.create({ data: { id, email: owner.email, name: id, locale: 'tr' } });
    await tx.membership.create({
      data: { tenantId: PP_TENANT, userId: id, role: 'TENANT_OWNER', workspaceIds: ['pp-e2e-workspace'] },
    });
  });
  return owner;
}

function formOf(page: Page) {
  const saveButton = page.getByRole('button', { name: 'Profili Kaydet' });
  const form = page.locator('form').filter({ has: saveButton });
  return {
    form,
    saveButton,
    capabilities: form.locator('textarea'),
    keywords: form.locator('input[name="keywords"]'),
    pic: page.getByTestId('tenant-pic-input'),
    trlMin: form.locator('input[type="number"]').nth(0),
    trlMax: form.locator('input[type="number"]').nth(1),
  };
}

async function open(page: Page, user: Owner, url = PROFILE_URL) {
  await signInAs(page, { id: user.id, email: user.email, tenantId: user.tenantId, role: 'TENANT_OWNER' });
  await page.goto(url);
  const f = formOf(page);
  await expectHydrated(f.saveButton);
  return f;
}

async function saved(page: Page) {
  await formOf(page).saveButton.click();
  await expect(page.getByText('başarıyla güncellendi')).toBeVisible();
}

async function inAnotherSession(browser: Browser, work: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  try {
    await work(await context.newPage());
  } finally {
    await context.close();
  }
}

const storedProfile = (tenantId: string) =>
  withTenant(tenantId, (tx) =>
    tx.tenantProfile.findUnique({ where: { tenantId }, select: { capabilities: true, keywords: true, trlRange: true } }),
  );

const profileAudits = async (tenantId: string) => (await picAuditRows(tenantId, 'tenant.profile.updated')).length;

function probe(label: string, value: unknown) {
  console.log(`PROBE ${label} ${JSON.stringify(value)}`);
}

test.describe('FO-387 — a profile form left open', () => {
  test.beforeAll(setupProfilePic);
  test.afterAll(async () => {
    await teardownProfilePic();
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await withSystemScope('platform-admin', 'e2e.profile-stale.reset', async (tx) => {
      await tx.tenant.updateMany({ where: { id: { in: [PP_TENANT, PP_OTHER_TENANT] } }, data: { pic: null } });
      await tx.tenantProfile.update({ where: { tenantId: PP_TENANT }, data: OPENED });
    });
  });

  test('Y1: a PIC-only save from a stale form leaves what a colleague saved, and the form catches up', async ({ page, browser }) => {
    const first = await addOwner('y1-first');
    const colleague = await addOwner('y1-colleague');
    const f = await open(page, first);
    await expect(f.keywords).toHaveValue('unrelated');

    await inAnotherSession(browser, async (other) => {
      const c = await open(other, colleague);
      await c.capabilities.fill('Colleague capabilities');
      await c.keywords.fill('grid flexibility, storage');
      await c.trlMin.fill('2');
      await c.trlMax.fill('9');
      await saved(other);
    });
    const afterColleague = await storedProfile(PP_TENANT);
    probe('Y1 after colleague', afterColleague);
    const auditsBefore = await profileAudits(PP_TENANT);

    await f.pic.fill(PP_PIC_UNMATCHED);
    await saved(page);

    const afterStale = await storedProfile(PP_TENANT);
    probe('Y1 after PIC-only save in the stale form', afterStale);
    probe('Y1 pic', await storedPic(PP_TENANT));
    probe('Y1 profile audit rows added', (await profileAudits(PP_TENANT)) - auditsBefore);
    expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
    expect(afterStale).toEqual(afterColleague);
    expect(await profileAudits(PP_TENANT)).toBe(auditsBefore);

    // The save re-read the page: the fields the user never touched now show the row.
    await expect(f.capabilities).toHaveValue('Colleague capabilities');
    await expect(f.keywords).toHaveValue('grid flexibility, storage');
    await expect(f.trlMin).toHaveValue('2');
    await expect(f.trlMax).toHaveValue('9');
  });

  test('Y1: a field the user does change is the only one that is written', async ({ page, browser }) => {
    const first = await addOwner('y1-field-first');
    const colleague = await addOwner('y1-field-colleague');
    const f = await open(page, first);

    await inAnotherSession(browser, async (other) => {
      const c = await open(other, colleague);
      await c.capabilities.fill('Colleague capabilities');
      await c.trlMax.fill('9');
      await saved(other);
    });

    await f.keywords.fill('mine,  yours ');
    await f.trlMin.fill('5');
    await saved(page);

    const stored = await storedProfile(PP_TENANT);
    probe('Y1 own keywords and TRL min over a colleague', stored);
    expect(stored).toEqual({ capabilities: 'Colleague capabilities', keywords: ['mine', 'yours'], trlRange: [5, 9] });
    const audit = (await picAuditRows(PP_TENANT, 'tenant.profile.updated')).at(-1);
    expect(audit).toEqual({ actorId: first.id, data: stored });
  });

  test('Y1: without a TopicMatch, G0 keeps the keywords a colleague saved', async ({ page, browser }) => {
    await withSystemScope('platform-admin', 'e2e.profile-stale.no-match', (tx) =>
      tx.topicMatch.deleteMany({ where: { tenantId: PP_TENANT } }),
    );
    const score = async () => {
      const computed = await withTenant(PP_TENANT, (tx) => computeG0ForOpportunity(tx, PP_TENANT, PP_OPP_ID));
      return computed?.score ?? null;
    };
    const first = await addOwner('g0-first');
    const colleague = await addOwner('g0-colleague');
    const f = await open(page, first);
    const opened = await score();

    await inAnotherSession(browser, async (other) => {
      const c = await open(other, colleague);
      // The topic's own keyword, so the keyword fallback in g0-features.ts has something to count.
      await c.keywords.fill('grid flexibility');
      await saved(other);
    });
    const afterColleague = await score();

    await f.pic.fill(PP_PIC_UNMATCHED);
    await saved(page);
    const afterStale = await score();

    probe('G0 without TopicMatch', { opened, afterColleague, afterStale, picStored: await storedPic(PP_TENANT) });
    expect(afterColleague).toBeGreaterThan(opened ?? Number.POSITIVE_INFINITY);
    expect((await storedProfile(PP_TENANT))?.keywords).toEqual(['grid flexibility']);
    expect(afterStale).toBeGreaterThanOrEqual(afterColleague ?? Number.POSITIVE_INFINITY);
  });

  test.describe('a tenant that never saved a profile', () => {
    test.beforeEach(() =>
      withSystemScope('platform-admin', 'e2e.profile-stale.never-saved', (tx) =>
        tx.tenantProfile.deleteMany({ where: { tenantId: PP_OTHER_TENANT } }),
      ),
    );

    test('Y2: a PIC-only save writes no sample text, the sample stays a placeholder', async ({ page }) => {
      const owner = await addPicProber();
      const f = await open(page, owner, OTHER_PROFILE_URL);

      await f.pic.fill(PP_PIC_UNMATCHED);
      await saved(page);

      const stored = await storedProfile(PP_OTHER_TENANT);
      probe('Y2 row after PIC-only save', stored);
      probe('Y2 pic', await storedPic(PP_OTHER_TENANT));
      expect(await storedPic(PP_OTHER_TENANT)).toBe(PP_PIC_UNMATCHED);
      expect(stored).toBeNull();

      await page.reload();
      await expectHydrated(f.saveButton);
      await expect(f.pic).toHaveValue(PP_PIC_UNMATCHED);
      await expect(f.capabilities).toHaveValue('');
      await expect(f.keywords).toHaveValue('');
      await expect(f.capabilities).toHaveAttribute('placeholder', /Yapay zeka algoritmaları/);
      await expect(f.keywords).toHaveAttribute('placeholder', /Horizon Europe/);
    });

    test('Y2: the first real profile needs both texts and takes the TRL the form showed', async ({ page }) => {
      const owner = await addPicProber();
      const f = await open(page, owner, OTHER_PROFILE_URL);

      // One text without the other: the browser stops it and points at what is missing.
      await f.keywords.fill('only keywords');
      await f.saveButton.click();
      await expect(f.capabilities).toBeFocused();
      expect(await f.capabilities.evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing)).toBe(true);
      expect(await storedProfile(PP_OTHER_TENANT)).toBeNull();

      await f.capabilities.fill('Real capabilities');
      await saved(page);
      const stored = await storedProfile(PP_OTHER_TENANT);
      probe('Y2 first real profile', stored);
      expect(stored).toEqual({ capabilities: 'Real capabilities', keywords: ['only keywords'], trlRange: [3, 8] });
    });
  });

  // ── Y4: a refresh must not take what the user is typing ──────────────────────
  test.describe('what the user is typing', () => {
    test('Y4: a page refresh brings the row into untouched fields and leaves the drafts', async ({ page, browser }) => {
      const first = await addOwner('y4-first');
      const colleague = await addOwner('y4-colleague');
      const f = await open(page, first);

      await f.pic.fill('123123123');
      await f.keywords.fill('my draft');

      await inAnotherSession(browser, async (other) => {
        const c = await open(other, colleague);
        await c.pic.fill(PP_PIC_UNMATCHED);
        await c.capabilities.fill('Colleague capabilities');
        await c.keywords.fill('colleague keywords');
        await c.trlMax.fill('9');
        await saved(other);
      });

      // Saving the province, in its own card, re-reads the page under the open form.
      const province = page.getByTestId('tenant-province-setting');
      await province.getByTestId('tenant-province-select').selectOption('Ankara');
      await province.locator('button[type="submit"]').click();

      await expect(f.capabilities).toHaveValue('Colleague capabilities');
      await expect(f.trlMax).toHaveValue('9');
      await expect(f.pic).toHaveValue('123123123');
      await expect(f.keywords).toHaveValue('my draft');
      probe('Y4 form after refresh', {
        capabilities: await f.capabilities.inputValue(),
        keywords: await f.keywords.inputValue(),
        pic: await f.pic.inputValue(),
        trlMax: await f.trlMax.inputValue(),
      });
      // Nothing was written from the drafts.
      expect((await storedProfile(PP_TENANT))?.keywords).toEqual(['colleague keywords']);
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
    });

    test('Y4: text typed while a save is on its way stays and goes out with the next save', async ({ page }) => {
      const owner = await addOwner('y4-typing');
      const f = await open(page, owner);

      // The save waits until the typing is done; a server action is a POST to the page itself.
      let release = () => {};
      const typed = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(`**${PROFILE_URL}`, async (route) => {
        if (route.request().method() === 'POST') await typed;
        await route.continue();
      });

      // Not `f.keywords`: the form is found by its button's name, and that name changes while saving.
      const keywords = page.locator('input[name="keywords"]');
      await keywords.fill('sent first');
      await f.saveButton.click();
      const saving = page.getByRole('button', { name: 'Kaydediliyor' });
      await expect(saving).toBeVisible();
      await keywords.fill('typed during the save');
      await expect(saving).toBeVisible();
      // A colleague saves meanwhile: this untouched field changing is the sign the page was re-read.
      await withSystemScope('platform-admin', 'e2e.profile-stale.meanwhile', (tx) =>
        tx.tenantProfile.update({ where: { tenantId: PP_TENANT }, data: { capabilities: 'Saved meanwhile' } }),
      );
      release();
      await expect(page.getByText('başarıyla güncellendi')).toBeVisible();
      await expect(page.locator('textarea')).toHaveValue('Saved meanwhile');

      expect((await storedProfile(PP_TENANT))?.keywords).toEqual(['sent first']);
      await expect(keywords).toHaveValue('typed during the save');

      await saved(page);
      expect((await storedProfile(PP_TENANT))?.keywords).toEqual(['typed during the save']);
    });
  });
});
