import { test, expect, type Page } from '@playwright/test';

import trMessages from '../../messages/tr.json';

/**
 * M9 brief generation — the failure paths, driven by a real browser.
 *
 * TASK-MTQURC2H4E0WF: pressing "Yapay Zeka Brief Oluştur" could fail in total
 * silence. A thrown action went to `console.error`; an action that came back
 * with no brief hit an `if` with no `else`. Either way the spinner stopped and
 * the screen said nothing, so the user could not tell a failure from a slow
 * success — and had no idea whether to retype or wait.
 *
 * Nothing about the component is stubbed here: real sign-in, real page, real
 * clicks and typing. Only the transport is interfered with, which is the point
 * — that is what a dropped connection and a failed DB write look like from the
 * browser.
 */

const SHOTS = 'docs/agent-results/TASK-MTQURC2H4E0WF-screenshots';
const WORKSPACE = 'fabrika-beta';
const BRIEFS_URL = `/tr/${WORKSPACE}/opportunities/demo-opp-1/briefs`;

const M9 = trMessages.m9;

/** The action POSTs back to the page it was called from. */
const isActionCall = (url: URL, method: string) =>
  method === 'POST' && url.pathname === BRIEFS_URL;

async function signInAndOpenBriefs(page: Page) {
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });

  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(BRIEFS_URL)}`);
  await page.locator('input[type="email"]').fill('owner@demo.fabrika.test');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${BRIEFS_URL}`, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');

  return { app: page.getByRole('main'), dialogs };
}

test.describe('M9 brief generation reports every way it can fail', () => {
  test('a dropped request surfaces in the band, keeps the form, and retries', async ({ page }) => {
    const { app, dialogs } = await signInAndOpenBriefs(page);

    const nameField = app.getByPlaceholder(/Ortak \/ Kurum Adı/);
    const dateField = app.getByTestId('m9-meeting-date');
    const timeField = app.getByTestId('m9-meeting-time');
    const generate = app.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ });

    // ── The connection drops mid-request. Before this change, the client
    //    swallowed the throw and the screen went back to idle in silence.
    let blocking = true;
    await page.route(BRIEFS_URL, async (route, request) => {
      if (blocking && isActionCall(new URL(request.url()), request.method())) {
        await route.abort('failed');
        return;
      }
      await route.fallback();
    });

    await nameField.fill('Fraunhofer Institute');
    await dateField.fill('2026-10-24');
    await timeField.fill('14:00');
    await page.screenshot({ path: `${SHOTS}/01-form-filled.png`, fullPage: true });

    await generate.click();

    const band = app.getByTestId('m9-generate-error');
    await expect(band).toBeVisible();
    await expect(band).toHaveAttribute('role', 'alert');
    await expect(band).toContainText(M9.generate.failed);
    await page.screenshot({ path: `${SHOTS}/02-generate-failed-band.png`, fullPage: true });

    // No raw failure detail reached the screen.
    const bandText = (await band.textContent()) ?? '';
    for (const leak of ['Error', 'fetch', 'Failed to', 'net::', '500', '403', 'TypeError']) {
      expect(bandText).not.toContain(leak);
    }

    // Everything the user typed is still there — nothing to retype.
    await expect(nameField).toHaveValue('Fraunhofer Institute');
    await expect(dateField).toHaveValue('2026-10-24');
    await expect(timeField).toHaveValue('14:00');
    // A keyboard user who tabs back to the button is told why it failed.
    await expect(generate).toHaveAttribute('aria-describedby', 'm9-generate-error');

    // ── Retry from inside the band, once the connection is back.
    blocking = false;
    await app.getByTestId('m9-generate-retry').click();

    await expect(band).toHaveCount(0, { timeout: 60_000 });
    // The band took its own buttons with it; focus went back to the control it
    // belonged to rather than to <body>.
    await expect(generate).toBeFocused();
    // The retry produced a real brief and cleared the form, exactly as a first
    // successful attempt would.
    await expect(nameField).toHaveValue('');
    await expect(app.getByText('Fraunhofer Institute').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-retry-succeeded.png`, fullPage: true });

    expect(dialogs).toEqual([]);
  });

  test('an action that comes back with no brief is reported, not ignored', async ({ page }) => {
    const { app, dialogs } = await signInAndOpenBriefs(page);

    // What the action returns when the LLM text was produced but the DB write
    // failed: `{ success: false, brief: null, error: 'BRIEF_NOT_PERSISTED' }`.
    // The old client hit `if (res.brief)` and simply did nothing.
    await page.route(BRIEFS_URL, async (route, request) => {
      if (!isActionCall(new URL(request.url()), request.method())) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/x-component' },
        body:
          '0:{"a":"$@1","f":"","b":"e2e"}\n' +
          '1:{"success":false,"brief":null,"error":"BRIEF_NOT_PERSISTED"}\n',
      });
    });

    await app.getByPlaceholder(/Ortak \/ Kurum Adı/).fill('Kayıt Edilemeyen Ortak');
    await app.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ }).click();

    const band = app.getByTestId('m9-generate-error');
    await expect(band).toBeVisible();
    await expect(band).toContainText(M9.generate.notSaved);
    // The internal code is not a user-facing message.
    await expect(band).not.toContainText('BRIEF_NOT_PERSISTED');
    await page.screenshot({ path: `${SHOTS}/04-empty-brief-band.png`, fullPage: true });

    // The name survived, so retrying costs nothing.
    await expect(app.getByPlaceholder(/Ortak \/ Kurum Adı/)).toHaveValue('Kayıt Edilemeyen Ortak');

    // At phone width the band still reads and the page does not scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(band).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/05-band-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    // It is dismissible — the same behaviour as the calendar band.
    await band.getByRole('button', { name: M9.alerts.dismiss }).click();
    await expect(band).toHaveCount(0);
    await expect(app.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ })).toBeFocused();

    expect(dialogs).toEqual([]);
  });

  test('the happy path still ends with a brief and no band', async ({ page }) => {
    const { app, dialogs } = await signInAndOpenBriefs(page);

    await app.getByPlaceholder(/Ortak \/ Kurum Adı/).fill('Mutlu Yol Ortağı');
    await app.getByTestId('m9-meeting-date').fill('2026-11-05');
    await app.getByTestId('m9-meeting-time').fill('10:30');
    await app.getByRole('button', { name: /Yapay Zeka Brief Oluştur/ }).click();

    await expect(app.getByText('Mutlu Yol Ortağı').first()).toBeVisible({ timeout: 60_000 });
    await expect(app.getByTestId('m9-generate-error')).toHaveCount(0);
    await expect(app.getByPlaceholder(/Ortak \/ Kurum Adı/)).toHaveValue('');
    await page.screenshot({ path: `${SHOTS}/06-happy-path.png`, fullPage: true });

    expect(dialogs).toEqual([]);
  });
});
