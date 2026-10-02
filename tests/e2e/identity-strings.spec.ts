import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MTRNQHC3IV2BE — no invented person, organisation or byline on screen.
 *
 * Sibling of identity-honesty.spec.ts, which covered the *name* the frame shows.
 * This one covers the four other surfaces that carried an identity nobody
 * entered: the workspace switcher inside the user menu ("Demo SME Consultancy",
 * "Horizon Research Lab"), the public login page's demo buttons ("Dr. Mehmet
 * Yılmaz", "Prof. Dr. Ayşe Kaya"), and the public blog's bylines.
 *
 * Real interaction: the menu is opened by clicking it, because the switcher only
 * exists in the DOM while the menu is open.
 */

const SHOTS = shotsDir('TASK-MTRNQHC3IV2BE-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

/** Assembled so the spec file does not itself contain the invented names. */
const MEHMET = ['Dr.', 'Mehmet', 'Yılmaz'].join(' ');
const AYSE = ['Prof.', 'Dr.', 'Ayşe', 'Kaya'].join(' ');
const INVENTED = [MEHMET, AYSE, 'Demo SME Consultancy', 'Horizon Research Lab'];

/** The consent banner covers the demo buttons; accept it so the shot shows them. */
async function acceptCookies(page: Page): Promise<void> {
  const accept = page.getByRole('button', { name: /Tümünü Kabul Et|Accept all/i }).first();
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function signInAs(page: Page, token: Record<string, unknown>): Promise<void> {
  const value = await encode({
    token: { sub: token.id as string, ...token },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([
    { name: COOKIE_NAME, value, url: 'http://localhost:3000' },
  ]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

/**
 * The platform admin the blog-editor test signs in as. Since f7a36779
 * (TASK-MULU7GVFBTRXX Ö-2) the jwt callback takes `isPlatformAdmin` from the
 * User row on every call and drops a claim no row backs, so a minted token
 * saying "admin" is no longer enough. The row exists for this spec only
 * (TASK-MULU828HTNN4N).
 */
const ADMIN = {
  id: 'e2e-admin-user',
  email: 'zeynep.editor@e2e.fabrika.test',
  name: 'Zeynep Aydın',
} as const;

test.beforeAll(async () => {
  // JWT callback reads User row on every token refresh (d57f13f1). Seed test users.
  await Promise.all([
    prisma.user.upsert({
      where: { id: ADMIN.id },
      create: { ...ADMIN, locale: 'tr', isPlatformAdmin: true },
      update: { email: ADMIN.email, name: ADMIN.name, isPlatformAdmin: true },
    }),
    prisma.user.upsert({
      where: { id: 'e2e-identity-user' },
      create: { id: 'e2e-identity-user', email: 'zeynep@e2e.fabrika.test', name: 'Zeynep Aydın', locale: 'tr' },
      update: { email: 'zeynep@e2e.fabrika.test', name: 'Zeynep Aydın' },
    }),
  ]);
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN.id, 'e2e-identity-user'] } } });
  await prisma.$disconnect();
});

test.describe('identity strings', () => {
  test('the workspace switcher offers no organisation the session is not in', async ({ page }) => {
    await signInAs(page, {
      id: 'e2e-identity-user',
      email: 'zeynep@e2e.fabrika.test',
      name: 'Zeynep Aydın',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
    });

    await page.goto('/tr/fabrika-beta/panel');

    // Real click: the switcher is rendered only while the menu is open.
    const header = page.locator('header:visible').first();
    await header.getByRole('button').last().click();

    const menu = page.locator('body');
    await expect(menu.getByText('Çalışma Alanı', { exact: true }).first()).toBeVisible();

    const open = await menu.innerText();
    for (const invented of INVENTED) {
      expect(open, `user menu still offers "${invented}"`).not.toContain(invented);
    }

    await page.screenshot({ path: `${SHOTS}/01-user-menu-workspaces.png`, fullPage: false });
  });

  test('the login page headlines the demo seat, not a person', async ({ page }) => {
    await page.goto('/tr/giris');
    await acceptCookies(page);

    const body = page.locator('body');
    await expect(body.getByText('KOBİ Ar-Ge Koordinatörü').first()).toBeVisible();
    await expect(body.getByText('Üniversite TTO Lideri').first()).toBeVisible();
    await expect(body.getByText('demo@usfinbridge.com').first()).toBeVisible();

    const text = await body.innerText();
    for (const invented of INVENTED) {
      expect(text, `login page still names "${invented}"`).not.toContain(invented);
    }

    const demoBlock = body.getByText('KOBİ Ar-Ge Koordinatörü').first().locator('xpath=../../../..');
    await demoBlock.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/02-login-demo-roles.png`, fullPage: false });
  });

  test('the login page in English shows the same seats, translated', async ({ page }) => {
    await page.goto('/en/login');
    await acceptCookies(page);

    const body = page.locator('body');
    await expect(body.getByText('SME R&D coordinator').first()).toBeVisible();
    await expect(body.getByText('University TTO lead').first()).toBeVisible();

    const text = await body.innerText();
    for (const invented of INVENTED) {
      expect(text, `login page (en) still names "${invented}"`).not.toContain(invented);
    }

    const demoBlockEn = body.getByText('SME R&D coordinator').first().locator('xpath=../../../..');
    await demoBlockEn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/03-login-demo-roles-en.png`, fullPage: false });
  });

  test('the admin editor opens a new post signed by the admin who is signed in', async ({ page }) => {
    await signInAs(page, {
      ...ADMIN,
      tenantId: 'demo-tenant',
      role: 'TENANT_OWNER',
      isPlatformAdmin: true,
    });

    await page.goto('/tr/admin/blog');
    await acceptCookies(page);

    // Real click: the byline fields only exist inside the "new post" modal.
    await page.getByRole('button', { name: /Yeni Blog Yazısı Ekle|New Post/i }).first().click();

    const modal = page.locator('form').last();
    await expect(modal).toBeVisible();

    // The default byline is the signed-in admin, not an invented consultant.
    await expect(modal.locator('input[value="Zeynep Aydın"]')).toHaveCount(1);

    // The listing behind the modal shows an em-dash for the seeded posts, which
    // carry no author at all — the four invented bylines are gone from them.
    const html = await modal.innerHTML();
    expect(html, 'the invented default author is back').not.toContain(MEHMET);
    expect(html).not.toContain('AB Proje Başdanışmanı');

    await page.screenshot({ path: `${SHOTS}/05-admin-blog-default-author.png`, fullPage: false });
  });

  test('the public blog carries no byline nobody wrote', async ({ page }) => {
    await page.goto('/tr/blog');

    const text = await page.locator('body').innerText();
    for (const invented of [MEHMET, 'Av. Ayşe Kaya', 'Dr. Sofia Rossi', 'Can Aksoy']) {
      expect(text, `blog list still bylines "${invented}"`).not.toContain(invented);
    }

    await page.screenshot({ path: `${SHOTS}/04-blog-no-bylines.png`, fullPage: true });
  });
});
