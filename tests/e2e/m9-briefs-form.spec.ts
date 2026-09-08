import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import {
  M9_BRIEFS_URL,
  M9_TENANT,
  setupM9Tenant,
  signInAsM9User,
  teardownM9Tenant,
} from './fixtures/m9-tenant';
import { shotsDir } from './fixtures/shots';

/**
 * M9 briefs form — the two silent-failure surfaces, driven by a real browser.
 *
 * P2-9: a date without a time was dropped in silence.
 * P3-14: the calendar error came out of `window.alert()`.
 *
 * Nothing here is stubbed: real sign-in, real page, real clicks and typing.
 */

const SHOTS = shotsDir('TASK-MTQUX5IZ9I5VP-screenshots');
/**
 * The spec used to run in `demo-tenant` as `owner@demo.fabrika.test`. Both moved
 * underneath it — the owner belongs to another tenant now, and `demo-tenant`'s
 * plan no longer grants M9 — so every assertion below failed on the module-lock
 * screen instead of the briefs page. The fixture tenant in ./fixtures/m9-tenant
 * owns the plan, the switch and the opportunity these tests need.
 */
const BRIEFS_URL = M9_BRIEFS_URL;

/**
 * A brief with no meeting time. It is what makes the calendar guard reachable:
 * the button renders for every brief, and this one cannot produce a file.
 */
const UNDATED_BRIEF = {
  id: 'm9-e2e-undated',
  tenantId: M9_TENANT,
  interactionId: 'int-m9-e2e-undated',
  partnerName: 'E2E Ortak (tarihsiz)',
  content: '### 1. Partner Background & EU Track Record\n- E2E fixture, no meeting scheduled.',
};

test.describe('M9 briefs — inline validation and error surfaces', () => {
  test.beforeAll(async () => {
    await setupM9Tenant();
    await prisma.meetingBrief.create({ data: UNDATED_BRIEF });
  });

  test.afterAll(teardownM9Tenant);

  test('a half-filled meeting time is reported inline, and no alert() is ever raised', async ({
    page,
  }) => {
    // Any native dialog is a P3-14 regression.
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await signInAsM9User(page, BRIEFS_URL);

    const app = page.getByRole('main');
    const dateField = app.getByTestId('m9-meeting-date');
    const timeField = app.getByTestId('m9-meeting-time');

    // ── 1. Name + date, no time. The old build sent this and dropped the date.
    await app.getByPlaceholder(/Ortak \/ Kurum Adı/).fill('Fraunhofer Institute');
    await dateField.fill('2026-10-24');
    await page.screenshot({ path: `${SHOTS}/e2e-01-date-without-time.png`, fullPage: true });

    await app.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ }).click();

    const scheduleError = app.getByTestId('m9-schedule-error');
    await expect(scheduleError).toBeVisible();
    await expect(scheduleError).toContainText('Toplantı saatini de girin');
    await expect(dateField).toHaveAttribute('aria-invalid', 'true');
    await expect(timeField).toHaveAttribute('aria-describedby', 'm9-schedule-error');
    // Focus moved to the field the user still has to fill.
    await expect(timeField).toBeFocused();
    // What the user typed survived the rejection.
    await expect(dateField).toHaveValue('2026-10-24');
    await page.screenshot({ path: `${SHOTS}/e2e-02-inline-error.png`, fullPage: true });

    // ── 2. Filling the time clears the error and brings back the Brussels preview.
    await timeField.fill('14:00');
    await expect(scheduleError).toHaveCount(0);
    await expect(app.getByText(/Brüksel Saati/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/e2e-03-error-cleared.png`, fullPage: true });

    expect(dialogs).toEqual([]);
  });

  test('the calendar button explains itself instead of raising alert()', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await signInAsM9User(page, BRIEFS_URL);

    const app = page.getByRole('main');
    // The seeded brief has no meeting time. The button is on screen anyway —
    // it used to vanish here, leaving the user with no control and no reason.
    await expect(app.getByText('E2E Ortak (tarihsiz)').first()).toBeVisible();
    const icsButton = app.getByTestId('m9-ics-download');
    await expect(icsButton).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/e2e-04-ics-button-visible.png`, fullPage: true });

    await icsButton.click();

    const icsError = app.getByTestId('m9-ics-error');
    await expect(icsError).toBeVisible();
    await expect(icsError).toContainText('toplantı tarihi yok');
    await page.screenshot({ path: `${SHOTS}/e2e-05-ics-inline-error.png`, fullPage: true });

    // At phone width the banner still reads and the page does not scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(icsError).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/e2e-06-ics-error-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    // The banner can be dismissed; it is not a modal the user has to fight.
    await app.getByRole('button', { name: 'Kapat' }).click();
    await expect(icsError).toHaveCount(0);

    expect(dialogs).toEqual([]);
  });
});
