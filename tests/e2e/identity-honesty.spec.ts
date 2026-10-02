import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { cleanupUserMembership } from './fixtures/user-membership-seed';

/**
 * TASK-MTR5BGKNELCO2 — the app frame must never invent who is signed in.
 *
 * The workspace layout used to read
 *   `user.name || (user.email?.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz')`
 * so a session carrying no name was labelled with somebody else's name and academic
 * title, and `session.role || 'TENANT_OWNER'` put an owner badge on a session that held
 * no role at all.
 *
 * The credentials provider always derives a name from the e-mail, so a nameless session
 * only arrives over OAuth. The session cookie is therefore minted here with the app's own
 * secret — the same JWT the OAuth path produces — rather than by changing sign-in code.
 */

const SHOTS = shotsDir('TASK-MTR5BGKNELCO2-screenshots');
const WORKSPACE = 'fabrika-beta';
const PANEL_URL = `/tr/${WORKSPACE}/panel`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

/** The two identities the frame used to invent, in every casing the UI could render. */
const INVENTED = ['Ayşe Kaya', 'Mehmet Yılmaz', 'mehmet@fabrika.app'];

async function signInAs(
  page: Page,
  token: Record<string, unknown>,
): Promise<void> {
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

test.describe('app frame identity', () => {
  test.beforeAll(async () => {
    // Fixture seeding is handled by global-setup.ts; users are created there.
    // This hook can be removed once all specs rely on global-setup seeding.
  });

  test('sanity check: e2e users + memberships exist in database', async () => {
    const { Client } = await import('pg');
    const url = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      // Use system scope to bypass RLS (same as global-setup seeding)
      const usersResult = await client.query(`
        BEGIN;
        SET app.system_scope = 'on';
        SELECT id, email, name FROM "User" WHERE id LIKE 'e2e-%' ORDER BY id;
        COMMIT;
      `);
      expect(usersResult.rows.length).toBeGreaterThan(0);

      const membershipsResult = await client.query(`
        BEGIN;
        SET app.system_scope = 'on';
        SELECT "tenantId", "userId", role FROM "Membership" WHERE "userId" LIKE 'e2e-%' ORDER BY "userId";
        COMMIT;
      `);
      expect(membershipsResult.rows.length).toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupUserMembership('demo-tenant', 'e2e-nameless-user');
      await cleanupUserMembership('demo-tenant', 'e2e-named-user');
      await cleanupUserMembership('demo-tenant', 'e2e-roleless-user');
    } catch (e) {
      console.warn('[identity-honesty] cleanupUserMembership failed:', e instanceof Error ? e.message : String(e));
    }
  });

  test('a session with no name is never given somebody else\'s name', async ({ page }) => {
    // No `name` claim, and `tenantId` already resolved so the jwt callback does not
    // refill the token from the database — exactly the shape an OAuth sign-in produces
    // when the provider returns no display name.
    await signInAs(page, {
      id: 'e2e-nameless-user',
      email: 'ayse.nameless@e2e.fabrika.test',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
    });

    await page.goto(PANEL_URL);
    // Two headers ship in the frame (mobile + desktop); only one is visible per viewport.
    const header = page.locator('header:visible').first();
    await expect(header).toBeVisible();

    // The honest fallback: the e-mail local part, not an invented person.
    await expect(header.getByText('ayse.nameless', { exact: false }).first()).toBeVisible();

    const frame = await page.locator('body').innerText();
    for (const invented of INVENTED) {
      expect(frame, `invented identity "${invented}" is still rendered`).not.toContain(
        invented,
      );
    }

    await page.screenshot({ path: `${SHOTS}/01-nameless-session-honest.png`, fullPage: false });
  });

  test('a session that carries a name shows that name', async ({ page }) => {
    await signInAs(page, {
      id: 'e2e-named-user',
      email: 'ayse.named@e2e.fabrika.test',
      name: 'Zeynep Aydin',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
    });

    await page.goto(PANEL_URL);
    const header = page.locator('header:visible').first();
    await expect(header.getByText('Zeynep Aydin').first()).toBeVisible();

    const frame = await page.locator('body').innerText();
    for (const invented of INVENTED) {
      expect(frame).not.toContain(invented);
    }

    await page.screenshot({ path: `${SHOTS}/02-named-session.png`, fullPage: false });
  });

  test('a session with no role is labelled unassigned, not TENANT_OWNER', async ({ page }) => {
    await signInAs(page, {
      id: 'e2e-roleless-user',
      email: 'roleless@e2e.fabrika.test',
      name: 'Rolsuz Kullanici',
      tenantId: 'demo-tenant',
    });

    await page.goto(PANEL_URL);
    // Real click: the role badge only exists inside the open user menu.
    await page.locator('header:visible').first().getByRole('button').last().click();

    await expect(page.getByText('Rol atanmamış').first()).toBeVisible();
    await expect(page.getByText('TENANT_OWNER')).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/03-roleless-session.png`, fullPage: false });
  });
});
