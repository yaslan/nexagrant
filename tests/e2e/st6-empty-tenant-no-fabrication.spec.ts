import { test, expect, type Page } from '@playwright/test';

import { ST6, seed, rollback } from '../../scripts/seed-st6-empty-e2e';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTQYXISOPUJ53, re-verification — the card's five points, measured on a
 * tenant that has no records at all.
 *
 * The card listed five places that invented data when the database had none:
 *
 *   1  /api/v1/partners and /api/v1/partners/[pic]
 *   2  opportunities/[id]/application/client.tsx  (client-side useState defaults)
 *   3  m11/types.ts DEFAULT_PART_B_SECTIONS + PartBCollaborativeEditor
 *   4  the KPI dashboard
 *   5  notifications (page and header bell)
 *
 * Reading the source is not enough for any of them. Points 2 and 3 lived in
 * `useState` initialisers, so a clean server component still rendered a full
 * screen; point 5 had a second, separate copy in the app shell that the page
 * fix did not touch. The only measurement that settles it is a browser signed
 * in as a tenant with nothing in it.
 *
 * Both shapes are asserted, not just "no numbers anywhere": `st6-app-ws` owns a
 * real opportunity with zero ApplicationPart rows, which separates "this tenant
 * has nothing" from "this page renders nothing", and would catch a fix that
 * hides the screen instead of telling the truth.
 */

const SHOTS = shotsDir('TASK-MTQYXISOPUJ53-screenshots');

/** Figures that only a fabricated fallback could produce. */
const INVENTED_KPIS = ['84,2', '84.2', '68,5', '68.5', '14,2', '14.2'];
const INVENTED_NOTIFICATIONS = ['%92', 'SME Beyannamesi', '500 AI Kredisi', 'HORIZON-CL5-2026-D3'];
const INVENTED_CONSORTIUM = ['412.500', '412,500', '165.000', '247.500', 'Demo SME Consultancy'];
const INVENTED_AUTHORS = ['Dr. Mehmet Yılmaz', 'Prof. Klaus Müller', 'Doç. Dr. Selin Kaya', 'Dr. Sofia Rossi', 'Marcus Schmidt'];

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
}

/**
 * A session for a user the seed wrote (User + TENANT_OWNER Membership), minted as a
 * cookie: the demo sign-in form does not exist in a production build
 * (TASK-MUSBCXP9RKS3D).
 */
async function signIn(page: Page, email: string, target: string) {
  const seat = [ST6.bare, ST6.app].find((t) => t.email === email);
  if (!seat) throw new Error(`no seeded ST6 user for ${email}`);
  await signInAs(page, { id: seat.userId, email: seat.email, tenantId: seat.tenantId, role: 'TENANT_OWNER' });
  await page.goto(target);
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test.beforeAll(async () => {
  await seed();
});

test.afterAll(async () => {
  await rollback();
});

test.describe('point 1 — /api/v1/partners invents no organisation', () => {
  test('an empty CORDIS table yields an empty list, not a demo array', async ({ request }) => {
    const res = await request.get('/api/v1/partners?limit=5', {
      headers: { 'x-api-key': ST6.bare.apiKeyRaw },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The old response served six organisations with invented statistics —
    // `projectCount: 1420` for Fraunhofer among them — with 200 OK.
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
    expect(JSON.stringify(body)).not.toContain('1420');
    expect(JSON.stringify(body)).not.toContain('Fraunhofer');
  });

  test('an unknown PIC is a real 404, not an invented organisation', async ({ request }) => {
    const res = await request.get('/api/v1/partners/999999999', {
      headers: { 'x-api-key': ST6.bare.apiKeyRaw },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe('PARTNER_NOT_FOUND');
  });

  test('no key is refused rather than served demo rows', async ({ request }) => {
    const res = await request.get('/api/v1/partners');
    expect(res.status()).toBe(401);
  });
});

test.describe('point 4 — the KPI dashboard', () => {
  test('a tenant with no opportunities is told so, and sees no invented rate', async ({ page }) => {
    await acceptCookies(page);
    const url = `/tr/${ST6.bare.workspaceSlug}/dashboard`;
    await signIn(page, ST6.bare.email, url);

    await expect(page.getByText('Bu çalışma alanında henüz fırsat yok')).toBeVisible();

    const body = await page.locator('body').innerText();
    for (const figure of INVENTED_KPIS) {
      expect(body, `dashboard still prints the invented KPI ${figure}`).not.toContain(figure);
    }
    await shot(page, 'st6-dashboard-empty-tenant');
  });
});

test.describe('point 5 — notifications, page and bell', () => {
  test('the feed is empty and none of the four invented notices is rendered', async ({ page }) => {
    await acceptCookies(page);
    const url = `/tr/${ST6.bare.workspaceSlug}/bildirimler`;
    await signIn(page, ST6.bare.email, url);

    await expect(page.getByText('Henüz bildiriminiz yok.')).toBeVisible();

    const body = await page.locator('body').innerText();
    for (const claim of INVENTED_NOTIFICATIONS) {
      expect(body, `notifications page still shows "${claim}"`).not.toContain(claim);
    }
    await shot(page, 'st6-notifications-empty-tenant');
  });

  test('the header bell carries no feed of its own', async ({ page }) => {
    await acceptCookies(page);
    const url = `/tr/${ST6.bare.workspaceSlug}/dashboard`;
    await signIn(page, ST6.bare.email, url);

    // The bell is the app shell's own component (src/components/UserMenu.tsx); it
    // held three more invented notifications after the page was cleaned, so it is
    // opened by a real click rather than inspected in the source.
    //
    // Which bell, precisely. The shell mounts UserMenu twice: MobileAppHeader
    // (`flex md:hidden`) comes FIRST in document order, the desktop header
    // (`hidden md:flex`) second. At the 1280px Desktop Chrome viewport the first
    // match is therefore the invisible mobile one, and `.first().click()` sat
    // there until the test timed out. A substring match was wrong in kind as
    // well: `aria-label*="ildirim"` also catches the feedback widget
    // ("Geri bildirim formunu aç"), so on a viewport without the mobile header
    // this locator would have opened a feedback form and still gone green.
    // Take the one bell the viewport actually shows, and say so.
    const bell = page.locator('button[title="Bildirimler"]:visible');
    await expect(bell, 'exactly one notification bell should be on screen').toHaveCount(1);
    await bell.click();

    // Everything below is a negative assertion, and a negative assertion also
    // passes on a panel that never opened — which is how a bell that could not
    // be clicked at all would otherwise have reported success. Prove the panel
    // is open first, and that it states the empty case rather than an unread
    // count no record could justify.
    await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
    await expect(page.getByText('Henüz bildiriminiz yok.')).toBeVisible();
    await expect(page.getByText('Tümü Okundu')).toBeVisible();

    const panel = await page.locator('body').innerText();
    for (const claim of INVENTED_NOTIFICATIONS) {
      expect(panel, `the bell still shows "${claim}"`).not.toContain(claim);
    }
    await shot(page, 'st6-bell-empty-tenant');
  });
});

test.describe('points 2 and 3 — the application screen and the Part B editor', () => {
  test('an opportunity with zero ApplicationPart rows opens empty, not with a €412.500 consortium', async ({
    page,
  }) => {
    await acceptCookies(page);
    const url = `/tr/${ST6.app.workspaceSlug}/opportunities/${ST6.app.opportunityId}/application`;
    await signIn(page, ST6.app.email, url);

    await expect(page.getByRole('heading', { name: /Part A & Part B/ })).toBeVisible();

    const body = await page.locator('body').innerText();
    for (const figure of INVENTED_CONSORTIUM) {
      expect(body, `the application screen still shows "${figure}"`).not.toContain(figure);
    }
    for (const person of INVENTED_AUTHORS) {
      expect(body, `the Part B editor still shows "${person}"`).not.toContain(person);
    }

    // Not just "the strings are gone": the totals must read zero, which is what a
    // reader actually acts on.
    await expect(page.getByText('Toplam Bütçe (Lump Sum)')).toBeVisible();
    expect(body).toContain('€0');

    await shot(page, 'st6-application-empty-tenant');
  });
});
