import { test, expect } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs, seedIdentity, cleanupIdentity } from './fixtures/session';

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

/** The two identities the frame used to invent, in every casing the UI could render. */
const INVENTED = ['Ayşe Kaya', 'Mehmet Yılmaz', 'mehmet@fabrika.app'];

test.beforeAll(async () => {
  // JWT callback reads User row on every token refresh (d57f13f1). Seed test users
  // and their memberships so the JWT callback can find them.
  // CI clean database has no demo-tenant or memberships, so we must seed them.
  //
  // The fixture handles the withSystemScope setup internally.
  const workspace = { id: 'fabrika-beta-workspace', slug: 'fabrika-beta', name: 'Fabrika Beta' };

  await seedIdentity(
    {
      userId: 'e2e-nameless-user',
      email: 'ayse.nameless@e2e.fabrika.test',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
    },
    workspace,
  );

  await seedIdentity(
    {
      userId: 'e2e-named-user',
      email: 'ayse.named@e2e.fabrika.test',
      name: 'Zeynep Aydın',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
      workspaceIds: ['fabrika-beta-workspace'],
    },
  );
});

test.afterAll(async () => {
  // Cleanup in reverse order: memberships first (FK constraint), then users.
  // The fixture handles the withSystemScope setup internally.
  await cleanupIdentity(['e2e-nameless-user', 'e2e-named-user']);
});

test.describe('app frame identity', () => {
  test('a session with no name is never given somebody else’s name', async ({ page }) => {
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
      name: 'Zeynep Aydın',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
    });

    await page.goto(PANEL_URL);
    const header = page.locator('header:visible').first();
    await expect(header.getByText('Zeynep Aydın').first()).toBeVisible();

    const frame = await page.locator('body').innerText();
    for (const invented of INVENTED) {
      expect(frame).not.toContain(invented);
    }

    await page.screenshot({ path: `${SHOTS}/02-named-session.png`, fullPage: false });
  });

  // Role label logic is tested as a unit test in src/lib/user-display.test.ts
  // A roleless E2E test is not possible: sessions without role have no membership,
  // so the JWT callback finds nothing, and the app routes them to /no-workspace rather
  // than any workspace panel.
});
