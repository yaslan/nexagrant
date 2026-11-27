import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MURBM059EDSQY — /admin used to be a bare 404. A platform admin is now sent
 * to /admin/modules (the sidebar's ADMIN entry); everyone else must get exactly
 * what they got before, with no redirect that names the console.
 *
 * Sessions are minted for seeded users (prisma/seed-tenant-workspace.ts): the jwt
 * callback re-reads tenant and role from the database, so an id no seed wrote
 * would come back as a tenantless session.
 */

const SHOTS = shotsDir('TASK-MURBM059EDSQY-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

const ADMIN = {
  sub: 'demo-user-superadmin',
  id: 'demo-user-superadmin',
  name: 'Platform Admin',
  email: 'admin@yasinaslan.com.tr',
  tenantId: 'demo-tenant',
  role: 'SUPER_ADMIN',
  isPlatformAdmin: true,
};

const MEMBER = {
  sub: 'demo-user-alice',
  id: 'demo-user-alice',
  name: 'Alice',
  email: 'alice@fabrika.test',
  tenantId: 'demo-tenant',
  role: 'PIPELINE_MANAGER',
};

async function token(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET, salt: COOKIE_NAME, maxAge: 60 * 60 });
}

async function signIn(page: Page, baseURL: string, claims: Record<string, unknown>) {
  await page.context().addCookies([{ name: COOKIE_NAME, value: await token(claims), url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
    );
  });
}

test.describe('/admin root', () => {
  test('a platform admin lands on the modules console, in tr and en', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, ADMIN);

    await page.goto('/tr/admin');
    await expect(page).toHaveURL(/\/tr\/admin\/modules$/);
    // The admin menu is there, and it is a working menu: clicking an item navigates.
    const docs = page.getByRole('link', { name: /Belgeler \(K6 RAG\)/ }).first();
    await expect(docs).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-admin-tr.png`, fullPage: true });
    await docs.click();
    await expect(page).toHaveURL(/\/tr\/admin\/documents$/);

    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/admin\/modules$/);
    await expect(page.getByRole('link', { name: /Documents \(K6 RAG\)/ }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-admin-en.png`, fullPage: true });
  });

  test('a tenant member gets the same 404 as before, not a redirect', async ({ page, request, baseURL }) => {
    const cookie = `${COOKIE_NAME}=${await token(MEMBER)}`;
    const res = await request.get('/tr/admin', { headers: { cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()['location']).toBeUndefined();

    await signIn(page, baseURL as string, MEMBER);
    await page.goto('/tr/admin');
    await expect(page).toHaveURL(/\/tr\/admin$/);
    await expect(page.getByText('Sayfa Bulunamadı')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-member-404.png`, fullPage: true });
  });

  test('without a session it answers like any other admin page', async ({ request }) => {
    const root = await request.get('/tr/admin', { maxRedirects: 0 });
    const modules = await request.get('/tr/admin/modules', { maxRedirects: 0 });
    // Whatever an anonymous visitor gets on a real console page, the root gives the
    // same status — and never a Location that points into the console.
    expect(root.status()).toBe(modules.status());
    expect(root.headers()['location'] ?? '').not.toContain('/admin/modules');
  });
});
