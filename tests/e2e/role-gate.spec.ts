import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@prisma/client';

import trMessages from '../../messages/tr.json';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';
import {
  RG_IDEA_TITLE,
  RG_INVOICE_NO,
  RG_OPP_ID,
  RG_OPP_TITLE,
  RG_PANEL_AVG_TEXT,
  RG_PANEL_EVAL_ID,
  RG_PROFILE_TEXT,
  RG_PROVINCE,
  RG_REL_ID,
  RG_COBRAND_NAME,
  RG_REL_NAME,
  RG_SEATS,
  RG_TENANT,
  RG_WORKSPACE,
  readPanelAverage,
  setupRoleGateTenant,
  teardownRoleGateTenant,
} from './fixtures/role-gate-tenant';
import {
  M1OFF_SEATS,
  M1OFF_TENANT,
  M1OFF_WORKSPACE,
  setupM1OffTenant,
  teardownM1OffTenant,
} from './fixtures/role-gate-m1-off-tenant';

/**
 * NG-64 — a page the menu hides for a role is closed to that role on the server
 * too. Each role signs in with a real session (the role is read back from its
 * membership row) and types the URL. A refused role gets the 403 screen and none
 * of the tenant's seeded text; an allowed one gets the page with it.
 */

const FORBIDDEN_TITLE = trMessages.Forbidden.title;
const ws = `/tr/${RG_WORKSPACE}`;

/** Every page the card names, plus the opportunity pages behind `view_proposal`. */
const GUEST_CLOSED = [
  `${ws}/firsatlar`,
  `${ws}/pipeline/${RG_OPP_ID}`,
  `${ws}/pipeline/${RG_OPP_ID}/consortium`,
  `${ws}/opportunities/${RG_OPP_ID}/m2`,
  `${ws}/opportunities/${RG_OPP_ID}/matching`,
  `${ws}/opportunities/${RG_OPP_ID}/briefs`,
  `${ws}/opportunities/${RG_OPP_ID}/documents`,
  `${ws}/opportunities/${RG_OPP_ID}/application`,
  `${ws}/ortaklar`,
  `${ws}/ortaklar?tab=live`,
  `${ws}/ortaklar/kaynaklar`,
  `${ws}/konsept-notlar`,
  `${ws}/iliskiler`,
  `${ws}/relationships/${RG_REL_ID}`,
  `${ws}/tto-hizlandirici`,
  `${ws}/onay-merkezi`,
  `${ws}/ayarlar/uyeler`,
  `${ws}/ayarlar/api-anahtarlari`,
  // Review B-1/B-2: the tenant's invoices and its scoring weights.
  `${ws}/ayarlar/faturalama`,
  `${ws}/settings/billing`,
  `${ws}/ayarlar/kapilar`,
  `${ws}/settings/gates`,
  // NG-240: the tenant's project ideas and company profile (ayarlar/profil is the alias of settings/profile).
  `${ws}/proje-fikri`,
  `${ws}/settings/profile`,
  `${ws}/ayarlar/profil`,
  // NG-256: the CORDIS coordinator leaders page reads the tenant's M1 plan only; it
  // sits behind view_partner_search like its sibling `partners` page.
  `${ws}/partners/leaders`,
  // NG-257: CORDIS partner detail sits behind view_partner_search (checked before the PIC lookup).
  `${ws}/partners/999999999`,
];

/** Any CORDIS-shaped PIC: the door is the role, the PIC is never reached. */
const PIC = '999999999';

async function signIn(page: Page, role: Role) {
  const seat = RG_SEATS[role];
  await signInAs(page, { id: seat.id, email: seat.email, tenantId: RG_TENANT, role });
}

async function expectClosed(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(403);
  await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toBeVisible();
  const html = await page.content();
  expect(html, path).not.toContain(RG_OPP_TITLE);
  expect(html, path).not.toContain(RG_REL_NAME);
  expect(html, path).not.toContain(RG_INVOICE_NO);
  expect(html, path).not.toContain(RG_IDEA_TITLE);
  expect(html, path).not.toContain(RG_PROFILE_TEXT);
  // NG-240 (review E1): the stored province and the card that shows it. The dropdown
  // lists every province, so only the selected option (value="<il>") proves a leak.
  expect(html, path).not.toContain(`value="${RG_PROVINCE}"`);
  expect(html, path).not.toContain('data-testid="tenant-province-setting"');
}

async function expectOpen(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toHaveCount(0);
}

/**
 * Submit the evaluator form as it stands and return the server action's response
 * body. The body is taken in a route handler: the form refreshes the page as soon as
 * the save resolves, after which the browser no longer holds the response.
 */
async function submitPanelForm(page: Page): Promise<string> {
  let body: string | undefined;
  const isSave = (req: import('@playwright/test').Request) =>
    req.method() === 'POST' &&
    req.headers()['next-action'] !== undefined &&
    // The save, not the other server actions the shell polls (notifications): its
    // arguments name the seeded evaluation.
    (req.postData() ?? '').includes(RG_PANEL_EVAL_ID);
  await page.route('**/*', async (route) => {
    if (!isSave(route.request())) return route.fallback();
    const res = await route.fetch();
    body = await res.text();
    expect(res.status()).toBe(200);
    await route.fulfill({ response: res, body });
  });
  try {
    await page.getByTestId('m6-form-submit').click();
    await expect.poll(() => body !== undefined).toBe(true);
    await expect(page.getByTestId('m6-form-error')).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
  return body as string;
}

/** The `avgScore` value as serialised in a server action response ('null', '2', …), or undefined. */
function avgScoreIn(body: string): string | undefined {
  return /"avgScore":(null|-?\d+(?:\.\d+)?)/.exec(body)?.[1];
}

test.describe.serial('NG-64 page role gates', () => {
  test.beforeAll(setupRoleGateTenant);
  test.afterAll(teardownRoleGateTenant);

  test('GUEST_PARTNER gets 403 and no tenant data on every gated path', async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, 'GUEST_PARTNER');
    for (const path of GUEST_CLOSED) await expectClosed(page, path);
  });

  test('agency co-brand (NG-248, K-584216): GUEST_PARTNER sees neither the agency name nor its logo; the five internal roles see both', async ({ page }) => {
    test.setTimeout(180_000);
    // cagrilar is open to a guest and renders the app shell, where the co-brand sits.
    const shell = `${ws}/cagrilar`;
    await signIn(page, 'GUEST_PARTNER');
    await expectOpen(page, shell);
    expect(await page.content(), 'guest 200').not.toContain(RG_COBRAND_NAME);
    await expect(page.getByTestId('cobrand-badge')).toHaveCount(0);
    expect((await page.request.get('/api/agency/cobrand-logo')).status(), 'guest logo').toBe(404);
    // A refused page carries the shell too: the name must not travel in its RSC payload either.
    await expectClosed(page, `${ws}/firsatlar`);
    expect(await page.content(), 'guest 403').not.toContain(RG_COBRAND_NAME);

    for (const role of ['MEMBER', 'WRITER', 'PIPELINE_MANAGER', 'TENANT_ADMIN', 'TENANT_OWNER'] as const) {
      await signIn(page, role);
      await expectOpen(page, shell);
      // The sentence reads "<ajans> iş birliğiyle": the name is part of it, not all of it.
      await expect(page.getByTestId('cobrand-text').first(), role).toContainText(RG_COBRAND_NAME);
      expect((await page.request.get('/api/agency/cobrand-logo')).status(), `${role} logo`).toBe(200);
    }
  });

  test('GUEST_PARTNER cannot pull the data through the downloads either', async ({ page }) => {
    await signIn(page, 'GUEST_PARTNER');
    const note = await page.request.get('/api/concept-notes/ng64-none/export');
    expect(note.status()).toBe(403);
    expect(await note.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
    const doc = await page.request.get('/api/documents/export?partId=ng64-none');
    expect(doc.status()).toBe(403);
    // Review B-1: the invoice the billing page lists, by its real number.
    for (const format of ['xml', 'pdf'] as const) {
      const invoice = await page.request.get(`/api/billing/invoices/${RG_INVOICE_NO}/export?format=${format}`);
      expect(invoice.status(), format).toBe(403);
      const body = await invoice.text();
      expect(JSON.parse(body), format).toEqual({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
      expect(body, format).not.toContain(RG_INVOICE_NO);
    }
  });

  test('GUEST_PARTNER gets no Partner Search announcements (review B-3)', async ({ page }) => {
    await signIn(page, 'GUEST_PARTNER');
    for (const url of [`/api/organizations/${PIC}/announcements`, '/api/partner-search/announcements/export?format=json']) {
      const res = await page.request.get(url);
      expect(res.status(), url).toBe(403);
      const body = await res.json();
      expect(body, url).toMatchObject({ error: 'MODULE_ACCESS_DENIED', reason: 'ROLE_FORBIDDEN' });
      expect(body, url).not.toHaveProperty('data');
    }
    // The /api/v1 twin answers to an API key only; a member's cookie is not one.
    const v1 = await page.request.get(`/api/v1/organizations/${PIC}/announcements`);
    expect(v1.status()).toBe(401);
    expect(await v1.json()).not.toHaveProperty('data');
  });

  test('MEMBER is the control: the same announcements read answers 200', async ({ page }) => {
    await signIn(page, 'MEMBER');
    const res = await page.request.get(`/api/organizations/${PIC}/announcements`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toHaveProperty('data');
  });

  test('billing is manage_billing: MEMBER and TENANT_ADMIN get 403, TENANT_OWNER reads the invoice', async ({ page }) => {
    test.setTimeout(120_000);
    for (const role of ['MEMBER', 'TENANT_ADMIN'] as const) {
      await signIn(page, role);
      await expectClosed(page, `${ws}/ayarlar/faturalama`);
      const res = await page.request.get(`/api/billing/invoices/${RG_INVOICE_NO}/export?format=xml`);
      expect(res.status(), role).toBe(403);
    }
    await signIn(page, 'TENANT_OWNER');
    await expectOpen(page, `${ws}/ayarlar/faturalama`);
    await expect(page.getByText(RG_INVOICE_NO).first()).toBeVisible();
  });

  test('gate settings are evaluate_gates: MEMBER gets 403, PIPELINE_MANAGER opens them', async ({ page }) => {
    await signIn(page, 'MEMBER');
    await expectClosed(page, `${ws}/ayarlar/kapilar`);
    await signIn(page, 'PIPELINE_MANAGER');
    await expectOpen(page, `${ws}/ayarlar/kapilar`);
  });

  test('evaluation panel (review R-1, K-577556): a guest reviewer scores on their own seat, never sees the panel table', async ({ page }) => {
    const panel = `${ws}/opportunities/${RG_OPP_ID}/evaluations/panel`;
    await signIn(page, 'GUEST_PARTNER');
    await expectOpen(page, panel);
    // Their own seat: the scoring form, not the "not seated" note.
    await expect(page.getByTestId('m6-evaluator-form')).toBeVisible();
    await expect(page.getByTestId('m6-not-seated')).toHaveCount(0);
    // The other reviewer's marks, carried in the panel-wide average, are nowhere.
    await expect(page.getByTestId('m6-dashboard')).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain(RG_PANEL_AVG_TEXT);
    expect(html).not.toContain(RG_OPP_TITLE);

    // MEMBER (view_proposal) is the control: the whole table, with the stored average.
    await signIn(page, 'MEMBER');
    await expectOpen(page, panel);
    await expect(page.getByTestId('m6-dashboard')).toBeVisible();
    await expect(page.getByTestId('m6-panel-score').first()).toHaveText(RG_PANEL_AVG_TEXT);
    await expect(page.getByTestId('m6-not-seated')).toBeVisible();
  });

  test('evaluation panel save (review 3 E-1, K-577556): the guest\'s save answers without the panel average; the owner\'s carries it', async ({ page }) => {
    const panel = `${ws}/opportunities/${RG_OPP_ID}/evaluations/panel`;

    await signIn(page, 'GUEST_PARTNER');
    await expectOpen(page, panel);
    const guestBody = await submitPanelForm(page);
    // The save landed and recomputed the panel average from the owner's 1s and the
    // guest's 3s: the number exists, and it is not the guest's own mark.
    const afterGuest = await readPanelAverage();
    expect(afterGuest).not.toBeNull();
    expect(afterGuest).not.toBe(3);
    // The server action's answer — what the browser receives, whatever the form shows.
    expect(avgScoreIn(guestBody)).toBe('null');
    expect(guestBody).not.toContain(`"avgScore":${afterGuest}`);

    // TENANT_OWNER (view_proposal, also seated) is the control: the same save answers
    // with the recomputed average, so the probe above reads the field that carries it.
    await signIn(page, 'TENANT_OWNER');
    await expectOpen(page, panel);
    const ownerBody = await submitPanelForm(page);
    const afterOwner = await readPanelAverage();
    expect(afterOwner).not.toBeNull();
    expect(avgScoreIn(ownerBody)).toBe(String(afterOwner));
  });

  test('GUEST_PARTNER keeps the pages that have no tenant read behind a role', async ({ page }) => {
    // cagrilar is the global call catalogue (no tenant data). ayarlar/profil was wrongly
    // listed here: it reads the tenant's company profile, so it is in GUEST_CLOSED (NG-240).
    await signIn(page, 'GUEST_PARTNER');
    await expectOpen(page, `${ws}/cagrilar`);
  });

  test('NG-240 control: MEMBER (view_proposal) and TENANT_OWNER open proje-fikri and settings/profile with the tenant text', async ({ page }) => {
    test.setTimeout(120_000);
    for (const role of ['MEMBER', 'TENANT_OWNER'] as const) {
      await signIn(page, role);
      await expectOpen(page, `${ws}/proje-fikri`);
      await expect(page.getByText(RG_IDEA_TITLE).first(), role).toBeVisible();
      await expectOpen(page, `${ws}/settings/profile`);
      // The profile text sits in a form field (a textarea value), so read the markup, not visible text.
      expect(await page.content(), role).toContain(RG_PROFILE_TEXT);
    }
  });

  test('MEMBER reads the opportunity and relationship, keeps API keys, is refused members', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, 'MEMBER');
    await expectOpen(page, `${ws}/firsatlar`);
    await expect(page.getByText(RG_OPP_TITLE).first()).toBeVisible();
    await expectOpen(page, `${ws}/pipeline/${RG_OPP_ID}`);
    await expect(page.getByText(RG_OPP_TITLE).first()).toBeVisible();
    await expectOpen(page, `${ws}/iliskiler`);
    await expect(page.getByText(RG_REL_NAME).first()).toBeVisible();
    await expectOpen(page, `${ws}/ortaklar/kaynaklar`);
    // NG-256 control: MEMBER holds view_partner_search, so the leaders page opens.
    await expectOpen(page, `${ws}/partners/leaders`);
    await expectOpen(page, `${ws}/onay-merkezi`);
    await expectOpen(page, `${ws}/ayarlar/api-anahtarlari`);
    await expectClosed(page, `${ws}/ayarlar/uyeler`);
  });

  test('WRITER keeps API keys and is refused members', async ({ page }) => {
    await signIn(page, 'WRITER');
    await expectOpen(page, `${ws}/ayarlar/api-anahtarlari`);
    await expectClosed(page, `${ws}/ayarlar/uyeler`);
  });

  test('members page opens for the two roles holding manage_users', async ({ page }) => {
    for (const role of ['TENANT_OWNER', 'TENANT_ADMIN'] as const) {
      await signIn(page, role);
      await expectOpen(page, `${ws}/ayarlar/uyeler`);
    }
    await signIn(page, 'PIPELINE_MANAGER');
    await expectClosed(page, `${ws}/ayarlar/uyeler`);
  });

  test('inviting stays owner/admin only: MEMBER, WRITER and GUEST_PARTNER get 403', async ({ page }) => {
    for (const role of ['MEMBER', 'WRITER', 'GUEST_PARTNER'] as const) {
      await signIn(page, role);
      const res = await page.request.post('/api/invitations', {
        data: { email: `ng64-${role.toLowerCase()}@invite.e2e.fabrika.test`, role: 'MEMBER' },
      });
      expect(res.status(), role).toBe(403);
    }
  });
});

/**
 * The same doors on the demo seed itself: the card's measure is that a guest
 * never sees 'District renovation pilot — İzmir'. A MEMBER seat on the same
 * tenant is the control that the title is there to be seen.
 */
test.describe.serial('NG-64 page role gates on the demo seed', () => {
  const DEMO_TITLE = 'District renovation pilot — İzmir';
  const GUEST = { id: 'ng64-demo-guest', email: 'guest@ng64-demo.e2e.fabrika.test' };
  const MEMBER = { id: 'ng64-demo-member', email: 'member@ng64-demo.e2e.fabrika.test' };

  test.beforeAll(async () => {
    await seedIdentity({ userId: GUEST.id, email: GUEST.email, role: 'GUEST_PARTNER', tenantId: 'demo-tenant', workspaceIds: ['demo-workspace'] });
    await seedIdentity({ userId: MEMBER.id, email: MEMBER.email, role: 'MEMBER', tenantId: 'demo-tenant', workspaceIds: ['demo-workspace'] });
  });
  test.afterAll(async () => {
    await cleanupIdentity(['ng64-demo-guest', 'ng64-demo-member']);
  });

  test('MEMBER sees the seeded opportunity; GUEST_PARTNER gets 403 and never its title', async ({ page }) => {
    await signInAs(page, { id: MEMBER.id, email: MEMBER.email, tenantId: 'demo-tenant', role: 'MEMBER' });
    await expectOpen(page, '/tr/main/pipeline/demo-opp-1');
    await expect(page.getByText(DEMO_TITLE).first()).toBeVisible();

    await signInAs(page, { id: GUEST.id, email: GUEST.email, tenantId: 'demo-tenant', role: 'GUEST_PARTNER' });
    for (const path of ['/tr/main/firsatlar', '/tr/main/pipeline/demo-opp-1', '/tr/main/opportunities/demo-opp-1/m2', '/tr/main/konsept-notlar', '/tr/main/onay-merkezi']) {
      await expectClosed(page, path);
      expect(await page.content(), path).not.toContain(DEMO_TITLE);
    }
  });
});

/**
 * NG-276 (NG-257 extra finding 2, NG-258 suggestion 2): GUEST_CLOSED runs on a tenant
 * with M1 ON, so it cannot tell whether the role door runs before the module lock. On a
 * tenant whose M1 is OFF a role without view_partner_search must still get the role
 * refusal (403, no lock screen); a role that holds it gets the lock. The module lock is
 * a normal page state, not an error, so it is told apart by its title and its sentence.
 */
test.describe.serial('NG-276 M1 OFF: the role door runs before the module lock', () => {
  const m1ws = `/tr/${M1OFF_WORKSPACE}`;
  const LOCK_TITLE = trMessages.ModuleGate.title;
  // The part of the MODULE_OFF sentence after the module name: "modülü kiracınızda kapalı."
  const LOCK_OFF_TAIL = trMessages.ModuleGate.reason.MODULE_OFF.split('{module}')[1]!.trim();
  const LOCK_ASK_ADMIN = trMessages.ModuleGate.askAdmin.split('{brand}')[0]!.trim();
  const PARTNER_PAGES = [
    { name: 'partners', path: `${m1ws}/partners` },
    { name: 'partners/[pic]', path: `${m1ws}/partners/${PIC}` },
    // NG-275: partners/resources still reads the module gate before the role door on dev.
    { name: 'partners/resources (red until NG-275 reaches dev)', path: `${m1ws}/partners/resources` },
  ];

  async function signInM1Off(page: Page, role: keyof typeof M1OFF_SEATS) {
    const seat = M1OFF_SEATS[role]!;
    await signInAs(page, { id: seat.id, email: seat.email, tenantId: M1OFF_TENANT, role });
  }

  test.beforeAll(setupM1OffTenant);
  test.afterAll(teardownM1OffTenant);

  for (const { name, path } of PARTNER_PAGES) {
    test(`GUEST_PARTNER on ${name}: 403 with the role refusal, no module lock`, async ({ page }) => {
      await signInM1Off(page, 'GUEST_PARTNER');
      const res = await page.goto(path);
      // The rendered text, not the markup: the i18n bundle in the page payload carries every
      // ModuleGate sentence on any page, so a markup search would match a page with no lock.
      await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toBeVisible();
      const shown = await page.locator('body').innerText();
      // Assert the lock first: when the order is wrong this names the lock as the cause.
      expect(shown, `${path} lock title`).not.toContain(LOCK_TITLE);
      expect(shown, `${path} lock sentence`).not.toContain(LOCK_OFF_TAIL);
      expect(shown, `${path} lock hint`).not.toContain(LOCK_ASK_ADMIN);
      expect(shown, `${path} lock icon`).not.toContain('🔒');
      await expect(page.getByRole('heading', { name: LOCK_TITLE }), path).toHaveCount(0);
      expect(res?.status(), path).toBe(403);
    });

    test(`control: MEMBER and TENANT_OWNER on ${name} see the M1 lock, not the role refusal`, async ({ page }) => {
      for (const role of ['MEMBER', 'TENANT_OWNER'] as const) {
        await signInM1Off(page, role);
        await page.goto(path);
        await expect(page.getByRole('heading', { name: LOCK_TITLE }), `${role} ${path}`).toBeVisible();
        expect(await page.locator('body').innerText(), `${role} ${path}`).toContain(LOCK_OFF_TAIL);
        await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), `${role} ${path}`).toHaveCount(0);
      }
    });
  }
});
