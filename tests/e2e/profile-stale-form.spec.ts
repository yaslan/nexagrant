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
import { requireId } from '../helpers/teardown-guard';
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
  const saveButton = page.getByRole('button', { name: /^(Profili Kaydet|Save Profile)$/ });
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
      tx.topicMatch.deleteMany({ where: { tenantId: requireId(PP_TENANT, 'PP_TENANT') } }),
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
        tx.tenantProfile.deleteMany({ where: { tenantId: requireId(PP_OTHER_TENANT, 'PP_OTHER_TENANT') } }),
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

  // ── Review B1: the TRL range a colleague moved out from under the form ──────
  test.describe('a TRL range that conflicts with what a colleague saved', () => {
    const CONFLICT = 'tenant-trl-error';

    /** Form open on [4,7]; a colleague saves [8,9] from a session of their own. */
    async function colleagueMovesTrl(browser: Browser, tag: string) {
      const colleague = await addOwner(`trl-colleague-${tag}`);
      await inAnotherSession(browser, async (other) => {
        const c = await open(other, colleague);
        await c.trlMax.fill('9');
        await c.trlMin.fill('8');
        await saved(other);
      });
    }

    test('says what happened, learns the range, keeps the drafts, and the next save goes through', async ({ page, browser }) => {
      const first = await addOwner('trl-first');
      const f = await open(page, first);
      await f.keywords.fill('my draft');
      await f.pic.fill(PP_PIC_UNMATCHED);
      await colleagueMovesTrl(browser, 'flow');
      const auditsBefore = await profileAudits(PP_TENANT);

      await f.trlMax.fill('6');
      probe('TRL form before save (looks valid)', { min: await f.trlMin.inputValue(), max: await f.trlMax.inputValue() });
      await f.saveButton.click();

      const message = page.getByTestId(CONFLICT);
      await expect(message).toBeVisible();
      await expect(message).toContainText('8–9');
      // FO-393 N3: only the end the user sent is "theirs"; the minimum 4 was never touched.
      await expect(message).toContainText('girdiğiniz en yüksek TRL değeri 6 bununla');
      await expect(message).not.toContainText('4–6');
      await expect(page.getByText('Lütfen tüm alanları doğru şekilde doldurun')).toHaveCount(0);
      probe('TRL message', await message.innerText());

      // Refused whole: the row stays, nothing else slipped through.
      const refused = await storedProfile(PP_TENANT);
      probe('TRL row after the refusal', refused);
      probe('TRL pic after the refusal', await storedPic(PP_TENANT));
      expect(refused).toEqual({ ...OPENED, trlRange: [8, 9] });
      expect(await storedPic(PP_TENANT)).toBeNull();
      expect(await profileAudits(PP_TENANT)).toBe(auditsBefore);

      // The form learned the range without a reload; the drafts are still there.
      await expect(f.trlMin).toHaveValue('8');
      await expect(f.trlMax).toHaveValue('9');
      await expect(f.keywords).toHaveValue('my draft');
      await expect(f.pic).toHaveValue(PP_PIC_UNMATCHED);

      // The same button again, no reload: PIC and draft go out, the colleague's range stays.
      await saved(page);
      await expect(message).toHaveCount(0);
      const after = await storedProfile(PP_TENANT);
      probe('TRL row after the second save', after);
      probe('TRL pic after the second save', await storedPic(PP_TENANT));
      expect(after).toEqual({ ...OPENED, keywords: ['my draft'], trlRange: [8, 9] });
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
    });

    test('a PIC alone is not held up once the form has learned the range', async ({ page, browser }) => {
      const first = await addOwner('trl-pic');
      const f = await open(page, first);
      await colleagueMovesTrl(browser, 'pic');

      await f.trlMax.fill('6');
      await f.saveButton.click();
      await expect(page.getByTestId(CONFLICT)).toBeVisible();
      await expect(f.trlMin).toHaveValue('8');
      await expect(f.trlMax).toHaveValue('9');

      await f.pic.fill(PP_PIC_UNMATCHED);
      await saved(page);
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
      expect((await storedProfile(PP_TENANT))?.trlRange).toEqual([8, 9]);
    });

    test('a user who wants their range can enter both ends and it is saved', async ({ page, browser }) => {
      const first = await addOwner('trl-both');
      const f = await open(page, first);
      await colleagueMovesTrl(browser, 'both');

      await f.trlMax.fill('6');
      await f.saveButton.click();
      await expect(page.getByTestId(CONFLICT)).toBeVisible();

      await f.trlMin.fill('4');
      await f.trlMax.fill('6');
      await saved(page);
      expect((await storedProfile(PP_TENANT))?.trlRange).toEqual([4, 6]);
    });

    test('a range the user got wrong on a current form does not blame a colleague', async ({ page }) => {
      const owner = await addOwner('trl-own');
      const f = await open(page, owner);

      await f.trlMin.fill('8');
      await f.saveButton.click();

      const message = page.getByTestId(CONFLICT);
      await expect(message).toHaveText('Kaydedilmedi. En düşük TRL (8) en yüksek TRL değerinden (7) büyük olamaz.');
      await expect(message).toBeInViewport();
      // Theirs to fix: what they typed stays.
      await expect(f.trlMin).toHaveValue('8');
      await expect(f.trlMax).toHaveValue('7');
      expect((await storedProfile(PP_TENANT))?.trlRange).toEqual([4, 7]);
    });

    for (const { width, height } of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]) {
      test(`the message is on screen after the button is pressed at ${width}x${height}`, async ({ page, browser }) => {
        await page.setViewportSize({ width, height });
        const first = await addOwner(`trl-view-${width}`);
        const f = await open(page, first);
        await colleagueMovesTrl(browser, `view-${width}`);

        await f.trlMax.fill('6');
        await f.saveButton.scrollIntoViewIfNeeded();
        await f.saveButton.click();

        const message = page.getByTestId(CONFLICT);
        await expect(message).toBeInViewport({ ratio: 1 });
        await expect(message).toBeFocused();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        probe(`TRL message at ${width}x${height}`, { overflow, focused: true });
        expect(overflow).toBeLessThanOrEqual(0);
        await page.screenshot({ path: test.info().outputPath(`trl-conflict-tr-${width}.png`) });
      });
    }

    test('the message comes into view on Enter from a field at the top of the form', async ({ page, browser }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const first = await addOwner('trl-enter');
      const f = await open(page, first);
      await colleagueMovesTrl(browser, 'enter');

      await f.trlMax.fill('6');
      await f.keywords.fill('from the top');
      await f.keywords.press('Enter');

      await expect(page.getByTestId(CONFLICT)).toBeInViewport({ ratio: 1 });
    });

    test('in English too', async ({ page, browser }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const first = await addOwner('trl-en');
      await signInAs(page, { id: first.id, email: first.email, tenantId: first.tenantId, role: 'TENANT_OWNER' });
      await page.goto(`/en/${PP_WORKSPACE}/settings/profile`);
      const save = page.getByRole('button', { name: 'Save Profile' });
      await expectHydrated(save);
      await colleagueMovesTrl(browser, 'en');

      await page.locator('input[type="number"]').nth(1).fill('6');
      await save.click();

      const message = page.getByTestId(CONFLICT);
      await expect(message).toBeInViewport({ ratio: 1 });
      await expect(message).toContainText('Someone else changed the TRL range to 8–9');
      await expect(message).toContainText('the maximum TRL of 6 you entered');
      await expect(message).not.toContainText('4–6');
      probe('TRL message en', await message.innerText());
      await page.screenshot({ path: test.info().outputPath('trl-conflict-en-1280.png') });
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

  // ── FO-393: what the FO-387 reviews left on a form left open ─────────────────
  test.describe('FO-393 follow-ups', () => {
    const CONFLICT = 'tenant-trl-error';
    const NO_CHANGES = 'tenant-profile-no-changes';
    const COPY = {
      tr: {
        success: 'başarıyla güncellendi',
        order: 'Kaydedilmedi. En düşük TRL (8) en yüksek TRL değerinden (7) büyük olamaz.',
        colleague: 'Başka biri',
        typedMin: 'girdiğiniz en düşük TRL değeri 5 bununla',
        typedMax: 'en yüksek TRL değeri',
      },
      en: {
        success: 'successfully updated',
        order: 'Not saved. The minimum TRL (8) cannot be higher than the maximum TRL (7).',
        colleague: 'Someone else',
        typedMin: 'the minimum TRL of 5 you entered',
        typedMax: 'maximum TRL of',
      },
    } as const;
    const VIEWS = [
      { locale: 'tr', width: 390, height: 844 },
      { locale: 'tr', width: 768, height: 1024 },
      { locale: 'en', width: 1280, height: 720 },
    ] as const;

    /**
     * Profile saves: server actions are POSTs to the page itself, and the page sends others too, so
     * a save is told apart by what it carries. A check the browser makes sends none.
     */
    function profileSaves(page: Page, carrying: string) {
      const posts: string[] = [];
      page.on('request', (request) => {
        const body = request.postData() ?? '';
        if (request.method() === 'POST' && request.url().includes('/settings/profile') && body.includes(carrying)) {
          posts.push(body);
        }
      });
      return posts;
    }

    async function savedIn(page: Page, locale: 'tr' | 'en') {
      await formOf(page).saveButton.click();
      await expect(page.getByText(COPY[locale].success)).toBeVisible();
    }

    /** A colleague, in a session of their own, saves this TRL range on the main tenant. */
    async function colleagueSetsTrl(browser: Browser, tag: string, min: string, max: string) {
      const colleague = await addOwner(`fo393-${tag}`);
      await inAnotherSession(browser, async (other) => {
        const c = await open(other, colleague);
        // Max first when it goes up, min first when it comes down: each step is a valid range.
        if (Number(max) >= Number(await c.trlMax.inputValue())) {
          await c.trlMax.fill(max);
          await c.trlMin.fill(min);
        } else {
          await c.trlMin.fill(min);
          await c.trlMax.fill(max);
        }
        await saved(other);
      });
    }

    for (const view of VIEWS) {
      const { locale, width, height } = view;
      const url = `/${locale}/${PP_WORKSPACE}/settings/profile`;
      const shot = (name: string) => test.info().outputPath(`fo393-${name}-${locale}-${width}.png`);

      test.describe(`${locale} ${width}x${height}`, () => {
        test.beforeEach(({ page }) => page.setViewportSize({ width, height }));

        test('N1: a range learned from a refusal follows the row when it goes back to the opening value', async ({ page, browser }) => {
          const first = await addOwner(`n1-${locale}`);
          const f = await open(page, first, url);
          await colleagueSetsTrl(browser, `n1a-${locale}`, '8', '9');

          await f.trlMax.fill('6');
          await f.saveButton.click();
          await expect(page.getByTestId(CONFLICT)).toBeVisible();
          await expect(f.trlMin).toHaveValue('8');
          await expect(f.trlMax).toHaveValue('9');

          // Back to the range this page was opened with, then a save that is about the PIC only.
          await colleagueSetsTrl(browser, `n1b-${locale}`, '4', '7');
          await f.pic.fill(PP_PIC_UNMATCHED);
          await savedIn(page, locale);

          const row = await storedProfile(PP_TENANT);
          probe(`N1 ${locale} ${width} row`, row);
          probe(`N1 ${locale} ${width} form`, [await f.trlMin.inputValue(), await f.trlMax.inputValue()]);
          expect(row?.trlRange).toEqual([4, 7]);
          await expect(f.trlMin).toHaveValue('4');
          await expect(f.trlMax).toHaveValue('7');
          await page.screenshot({ path: shot('n1') });
        });

        test('N2: an own range that is wrong as typed is said so, before anything is sent', async ({ page, browser }) => {
          const first = await addOwner(`n2-${locale}`);
          const f = await open(page, first, url);
          await colleagueSetsTrl(browser, `n2-${locale}`, '2', '7');
          const posts = profileSaves(page, 'trlMin');
          const auditsBefore = await profileAudits(PP_TENANT);

          await f.trlMin.fill('8');
          await f.saveButton.click();

          const message = page.getByTestId(CONFLICT);
          await expect(message).toHaveText(COPY[locale].order);
          await expect(message).toBeFocused();
          await expect(message).toBeInViewport({ ratio: 1 });
          await expect(message).not.toContainText(COPY[locale].colleague);
          await expect(f.trlMin).toHaveValue('8');
          await expect(f.trlMax).toHaveValue('7');
          const row = await storedProfile(PP_TENANT);
          probe(`N2 ${locale} ${width}`, { posts: posts.length, row, message: await message.innerText() });
          expect(posts).toEqual([]);
          expect(row?.trlRange).toEqual([2, 7]);
          expect(await profileAudits(PP_TENANT)).toBe(auditsBefore);
          await page.screenshot({ path: shot('n2') });
        });

        test('N3: a save with nothing changed says so, not "updated", and the form catches up', async ({ page, browser }) => {
          const first = await addOwner(`n3a-${locale}`);
          const colleague = await addOwner(`n3a-colleague-${locale}`);
          const f = await open(page, first, url);
          await inAnotherSession(browser, async (other) => {
            const c = await open(other, colleague);
            await c.capabilities.fill('Colleague capabilities');
            await saved(other);
          });
          const before = await storedProfile(PP_TENANT);
          const auditsBefore = await profileAudits(PP_TENANT);

          // B2's case: the user edits, then types the opening text back, so nothing is sent.
          await f.capabilities.fill('Something else');
          await f.capabilities.fill(OPENED.capabilities);
          await f.saveButton.scrollIntoViewIfNeeded();
          await f.saveButton.click();

          const notice = page.getByTestId(NO_CHANGES);
          await expect(notice).toBeInViewport({ ratio: 1 });
          await expect(notice).toHaveAttribute('role', 'status');
          await expect(page.getByText(COPY[locale].success)).toHaveCount(0);
          // The empty save re-read the page: the untouched field shows the colleague's text.
          await expect(f.capabilities).toHaveValue('Colleague capabilities');
          const after = await storedProfile(PP_TENANT);
          probe(`N3a ${locale} ${width}`, { before, after, notice: await notice.innerText() });
          expect(after).toEqual(before);
          expect(await profileAudits(PP_TENANT)).toBe(auditsBefore);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow).toBeLessThanOrEqual(0);
          await page.screenshot({ path: shot('n3a') });

          // A real change afterwards is a real save again.
          await f.keywords.fill('after nothing');
          await savedIn(page, locale);
          await expect(notice).toHaveCount(0);
          expect((await storedProfile(PP_TENANT))?.keywords).toEqual(['after nothing']);
        });

        test('N3: when only the minimum was sent, the refusal calls the minimum the one the user entered', async ({ page, browser }) => {
          const first = await addOwner(`n3b-${locale}`);
          const f = await open(page, first, url);
          await colleagueSetsTrl(browser, `n3b-${locale}`, '2', '3');
          const posts = profileSaves(page, 'trlMin');
          const auditsBefore = await profileAudits(PP_TENANT);

          // [5,7] is a valid range on the form, so it goes out; only the minimum was touched.
          await f.trlMin.fill('5');
          await f.saveButton.click();

          const message = page.getByTestId(CONFLICT);
          await expect(message).toBeVisible();
          await expect(message).toContainText('2–3');
          await expect(message).toContainText(COPY[locale].typedMin);
          await expect(message).not.toContainText(COPY[locale].typedMax);
          await expect(f.trlMin).toHaveValue('2');
          await expect(f.trlMax).toHaveValue('3');
          const row = await storedProfile(PP_TENANT);
          probe(`N3b-min ${locale} ${width}`, { posts: posts.length, row, message: await message.innerText() });
          expect(posts).toHaveLength(1);
          // Only the minimum went out: the action's body carries an untouched end as "$undefined".
          expect(posts[0]).toContain('"trlMin":5');
          expect(posts[0]).toContain('"trlMax":"$undefined"');
          expect(row?.trlRange).toEqual([2, 3]);
          expect(await profileAudits(PP_TENANT)).toBe(auditsBefore);
          await page.screenshot({ path: shot('n3b-min') });
        });

        test('N3: the refusal message goes once the user starts fixing the TRL fields', async ({ page, browser }) => {
          const first = await addOwner(`n3c-${locale}`);
          const f = await open(page, first, url);
          await colleagueSetsTrl(browser, `n3c-${locale}`, '8', '9');

          await f.trlMax.fill('6');
          await f.saveButton.click();
          const message = page.getByTestId(CONFLICT);
          await expect(message).toBeVisible();
          await page.screenshot({ path: shot('n3b') });

          await f.trlMin.fill('5');
          await expect(message).toHaveCount(0);
          probe(`N3c ${locale} ${width}`, { messageAfterTyping: await message.count() });
        });
      });
    }

    test.describe('a tenant that never saved a profile', () => {
      test.beforeEach(() =>
        withSystemScope('platform-admin', 'e2e.profile-stale.fo393-never-saved', (tx) =>
          tx.tenantProfile.deleteMany({ where: { tenantId: requireId(PP_OTHER_TENANT, 'PP_OTHER_TENANT') } }),
        ),
      );

      for (const { locale, width, height } of VIEWS) {
        test(`B3 ${locale} ${width}x${height}: keywords alone are saved once a colleague has made the row`, async ({ page, browser }) => {
          await page.setViewportSize({ width, height });
          const url = `/${locale}/${PP_OTHER_WORKSPACE}/settings/profile`;
          const first = await addPicProber();
          const colleague = await addPicProber();
          const f = await open(page, first, url);
          await expect(f.capabilities).toHaveValue('');

          await inAnotherSession(browser, async (other) => {
            const c = await open(other, colleague, url);
            await c.capabilities.fill('Mate first');
            await c.keywords.fill('mate');
            await savedIn(other, locale);
          });
          const made = await storedProfile(PP_OTHER_TENANT);
          probe(`B3 ${locale} ${width} row made by the colleague`, made);

          await f.keywords.fill('only keyword');
          await savedIn(page, locale);

          const row = await storedProfile(PP_OTHER_TENANT);
          probe(`B3 ${locale} ${width} row after keywords alone`, row);
          expect(row).toEqual({ capabilities: 'Mate first', keywords: ['only keyword'], trlRange: [3, 8] });
          // The save re-read the page: the text the user never touched is the colleague's.
          await expect(f.capabilities).toHaveValue('Mate first');
          await page.screenshot({ path: test.info().outputPath(`fo393-b3-${locale}-${width}.png`) });
        });

        test(`B3 ${locale} ${width}x${height}: with no row at all the server refuses and the field says what is missing`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          const owner = await addPicProber();
          const f = await open(page, owner, `/${locale}/${PP_OTHER_WORKSPACE}/settings/profile`);
          const posts = profileSaves(page, 'only keywords');

          await f.keywords.fill('only keywords');
          await f.pic.fill(PP_PIC_UNMATCHED);
          await f.saveButton.click();

          await expect(f.capabilities).toBeFocused();
          expect(await f.capabilities.evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing)).toBe(true);
          // Refused whole, PIC included.
          const row = await storedProfile(PP_OTHER_TENANT);
          probe(`B3 ${locale} ${width} no row`, { posts: posts.length, row, pic: await storedPic(PP_OTHER_TENANT) });
          expect(posts.length).toBe(1);
          expect(row).toBeNull();
          expect(await storedPic(PP_OTHER_TENANT)).toBeNull();

          // From now on the browser holds the save itself: no second request.
          await f.saveButton.click();
          await expect(f.capabilities).toBeFocused();
          expect(posts.length).toBe(1);

          await f.capabilities.fill('Real capabilities');
          await savedIn(page, locale);
          expect(await storedProfile(PP_OTHER_TENANT)).toEqual({
            capabilities: 'Real capabilities',
            keywords: ['only keywords'],
            trlRange: [3, 8],
          });
        });
      }
    });
  });
});
