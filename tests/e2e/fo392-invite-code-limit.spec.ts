import { test, expect, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { prisma } from '../../src/lib/db';
import { withTenant } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { createInviteCodeIn } from '../../src/lib/agency/codes';
import { INVITE_CODE_MAX_USE_LIMIT, INVITE_CODE_MIN_USE_LIMIT } from '../../src/lib/agency/invite-policy';
import trMessages from '../../messages/tr.json';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';
import { presentIds, requireId } from '../helpers/teardown-guard';

/**
 * FO-392 (se-fb) - agency invite codes have a use limit, in a real browser.
 *
 * The unit and live suites pin the SQL (tests/agency-invite.live.test.ts). What they
 * cannot show is the person: registering on /kayit?kod=... with a code that is full is
 * refused with the one message every unusable code gets, a code with places left works,
 * two people pressing "register" at the same moment on the last place do not both get in,
 * and the agency sees the limit and the status in its panel.
 *
 * Registration here goes through the demo e-mail form (the Credentials provider exists only
 * with DEMO_LOGIN_ENABLED, so under `next start` this file is skipped). The Google OAuth
 * path calls the same SQL function (src/lib/oauth-registration.ts), which the live suite
 * covers.
 */
const SHOTS = shotsDir('FO-392-screenshots');
const STAMP = `fo392-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;

test.skip(
  process.env.E2E_WEB_SERVER === 'start',
  'the e-mail registration form exists only with DEMO_LOGIN_ENABLED, which next start refuses',
);
test.describe.configure({ mode: 'serial' });

interface Fx {
  agencyId: string;
  ownerId: string;
  ownerEmail: string;
  /** limit 2: two people get in, the third is refused */
  two: { id: string; code: string };
  /** limit 1: the last-place race */
  one: { id: string; code: string };
  /** from before FO-392: no limit */
  legacy: { id: string; code: string };
  /** default limit, made through the panel's own create action in the test */
}
let fx: Fx;

const emailsOf = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${STAMP}-${tag}${i}@fabrika.test`);

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

function visibleForms(page: Page) {
  return page.locator('form').filter({ visible: true });
}

/** Opens /tr/kayit?kod=<code>, types the e-mail, ticks the box. Does not submit. */
async function fillRegistration(page: Page, code: string, email: string) {
  await acceptCookies(page);
  await page.goto(`/tr/kayit?kod=${encodeURIComponent(code)}`);
  const box = visibleForms(page).filter({ has: page.getByTestId('disclosure-ack') }).getByTestId('disclosure-ack');
  await expectHydrated(box);
  // Visible copy only: while Suspense streams, a hidden twin is in the DOM (see registration-consent.spec.ts).
  await expect(page.getByTestId('invite-code-banner').filter({ visible: true })).toBeVisible();
  const form = visibleForms(page).filter({ has: page.locator('input[type="email"]') });
  await form.locator('input[type="email"]').fill(email);
  await box.check();
  return form;
}

async function usedCount(id: string): Promise<number> {
  return withSystemScope('platform-admin', 'e2e.fo392.read', async (tx) => {
    const row = await tx.agencyInviteCode.findUniqueOrThrow({ where: { id }, select: { usedCount: true } });
    return row.usedCount;
  });
}

async function accountsFor(emails: string[]): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
  return rows.map((r) => r.email!).sort();
}

test.beforeAll(async () => {
  const agency = await withSystemScope('platform-admin', 'e2e.fo392.setup', async (tx) => {
    const t = await tx.tenant.create({
      data: { name: `Ajans ${STAMP}`, slug: `${STAMP}-ag`, country: 'TR', kind: 'AGENCY' },
      select: { id: true },
    });
    const owner = { id: `${STAMP}-owner`, email: `${STAMP}-owner@e2e.fabrika.test` };
    await tx.user.create({ data: { id: owner.id, email: owner.email, name: 'FO392 owner', locale: 'tr' } });
    await tx.membership.create({ data: { userId: owner.id, tenantId: t.id, role: 'TENANT_OWNER' } });
    // The agency panel is gated on a subscription like every (app) page.
    await tx.subscription.upsert({
      where: { tenantId: t.id },
      create: { tenantId: t.id, planId: 'ultra', status: 'ACTIVE' },
      update: {},
    });
    return { id: t.id, owner };
  });
  const make = async (label: string, useLimit: number | null) => {
    const c = await withTenant(agency.id, (tx) =>
      createInviteCodeIn(tx, {
        tenantId: agency.id,
        createdBy: agency.owner.id,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        label,
      }),
    );
    await withSystemScope('platform-admin', 'e2e.fo392.setup', (tx) =>
      tx.agencyInviteCode.update({ where: { id: c.id }, data: { useLimit } }),
    );
    return { id: c.id, code: c.code };
  };
  fx = {
    agencyId: agency.id,
    ownerId: agency.owner.id,
    ownerEmail: agency.owner.email,
    two: await make('limit-2', 2),
    one: await make('limit-1', 1),
    legacy: await make('legacy', null),
  };
});

test.afterAll(async () => {
  if (!fx) return;
  const all = await prisma.user.findMany({ where: { email: { startsWith: STAMP } }, select: { id: true } });
  const userIds = all.map((u) => u.id);
  await withSystemScope('platform-admin', 'e2e.fo392.cleanup', async (tx) => {
    const orgs = await tx.tenant.findMany({ where: { agencyId: fx.agencyId }, select: { id: true } });
    const orgIds = orgs.map((o) => o.id);
    const tenants = [...orgIds, fx.agencyId];
    if (userIds.length) {
      await tx.consent.deleteMany({ where: { userId: { in: presentIds(userIds) } } });
    }
    await tx.membership.deleteMany({ where: { tenantId: { in: tenants } } });
    await tx.user.deleteMany({ where: { id: { in: [...userIds, fx.ownerId] } } });
    await tx.auditEvent.deleteMany({ where: { tenantId: { in: tenants } } });
    await tx.agencyInviteCode.deleteMany({ where: { tenantId: requireId(fx.agencyId, 'agencyId') } });
    if (orgIds.length) await tx.tenant.deleteMany({ where: { id: { in: presentIds(orgIds) } } });
    await tx.tenant.deleteMany({ where: { id: requireId(fx.agencyId, 'agencyId') } });
  });
  await prisma.$disconnect();
});

test('a code with 2 places: the first two registrations work, the third is refused with the one message, no account is made', async ({ page }) => {
  const [a, b, c] = emailsOf('two', 3) as [string, string, string];

  for (const email of [a, b]) {
    const form = await fillRegistration(page, fx.two.code, email);
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tr\/.*(dashboard|panel|no-workspace)/, { timeout: 30_000 });
    await page.context().clearCookies();
  }
  expect(await accountsFor([a, b])).toEqual([a, b].sort());
  expect(await usedCount(fx.two.id)).toBe(2);

  // The third: the code is full.
  const form = await fillRegistration(page, fx.two.code, c);
  await form.locator('button[type="submit"]').click();
  await expect(page.getByText(trMessages.Auth.signInError.invite_invalid).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-third-registration-refused.png`, fullPage: true });
  expect(page.url()).toContain('/kayit');

  expect(await accountsFor([c]), 'a full code still opened an account').toEqual([]);
  expect(await usedCount(fx.two.id), 'the counter passed the limit').toBe(2);

  // The two that got in are linked to the agency; the refused one never was.
  const linked = await prisma.tenant.count({ where: { agencyId: fx.agencyId } });
  expect(linked).toBeGreaterThanOrEqual(2);
});

test('the last place, pressed by two people at the same moment: exactly one gets in', async ({ browser }) => {
  const [x, y] = emailsOf('race', 2) as [string, string];
  const open = async (b: Browser, email: string) => {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const form = await fillRegistration(page, fx.one.code, email);
    return { ctx, page, submit: form.locator('button[type="submit"]') };
  };
  const px = await open(browser, x);
  const py = await open(browser, y);
  try {
    // Both forms are filled and ticked; now both submit in the same tick.
    await Promise.all([px.submit.click(), py.submit.click()]);
    await expect
      .poll(async () => (await accountsFor([x, y])).length + (await refusedCount([px.page, py.page])), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(2);
    const made = await accountsFor([x, y]);
    expect(made, 'both people got into a code with one place').toHaveLength(1);
    expect(await usedCount(fx.one.id)).toBe(1);
    // The loser sees the one refusal.
    const loser = made[0] === x ? py : px;
    await expect(loser.page.getByText(trMessages.Auth.signInError.invite_invalid).first()).toBeVisible();
    await loser.page.screenshot({ path: `${SHOTS}/02-race-loser-refused.png`, fullPage: true });
  } finally {
    await px.ctx.close();
    await py.ctx.close();
  }
});

async function refusedCount(pages: Page[]): Promise<number> {
  let n = 0;
  for (const p of pages) {
    if (await p.getByText(trMessages.Auth.signInError.invite_invalid).first().isVisible().catch(() => false)) n++;
  }
  return n;
}

test('a code from before FO-392 has no limit and still registers', async ({ page }) => {
  const [e] = emailsOf('legacy', 1) as [string];
  const form = await fillRegistration(page, fx.legacy.code, e);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL(/\/tr\/.*(dashboard|panel|no-workspace)/, { timeout: 30_000 });
  expect(await accountsFor([e])).toEqual([e]);
  expect(await usedCount(fx.legacy.id)).toBe(1);
});

test('the agency panel: "Sınıra ulaştı" on the full code, "en az N" - never the exact limit or a count - and a new code carries a hidden limit of 500..524', async ({ page }) => {
  // N-2 (FO-392-crw-fb.md): everything the browser receives while the panel loads and a code is
  // made - the HTML, the RSC payloads, the server-action response - is collected and searched.
  const bodies: Array<{ url: string; kind: string; text: string }> = [];
  const pending: Array<Promise<void>> = [];
  page.on('response', (res) => {
    const type = res.request().resourceType();
    if (!['document', 'fetch', 'xhr'].includes(type)) return;
    pending.push(
      res
        .text()
        .then((text) => void bodies.push({ url: res.url(), kind: `${res.request().method()} ${type}`, text }))
        .catch(() => undefined),
    );
  });

  await signInAs(page, { id: fx.ownerId, email: fx.ownerEmail, name: 'FO392 owner', tenantId: fx.agencyId, role: 'TENANT_OWNER' });
  await page.goto('/tr/ajans');
  const table = page.getByTestId('invite-codes-table');
  await expect(table).toBeVisible();
  await expectHydrated(page.getByTestId('invite-codes-limit-note'));

  const rowOf = async (id: string) => {
    const row = await withSystemScope('platform-admin', 'e2e.fo392.read', (tx) =>
      tx.agencyInviteCode.findUniqueOrThrow({ where: { id }, select: { codeHint: true } }),
    );
    return table.getByTestId(`invite-row-${row.codeHint}`);
  };
  const atLeast = trMessages.agency.codes.limitAtLeast.replace('{min}', String(INVITE_CODE_MIN_USE_LIMIT));
  const full = await rowOf(fx.two.id);
  await expect(full).toContainText(trMessages.agency.codes.status.exhausted);
  // The code's real limit is 2 here (fixture), the panel still says only "at least 500".
  await expect(full).toContainText(atLeast);
  await expect(full).not.toContainText('2 kullanım');
  const old = await rowOf(fx.legacy.id);
  await expect(old).toContainText(trMessages.agency.codes.limitUnlimited);
  await expect(old).toContainText(trMessages.agency.codes.status.active);
  // The count is nowhere in the page: neither the exact use count of the old code, nor "1/2".
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\b2\s*\/\s*2\b/);

  await table.screenshot({ path: `${SHOTS}/03-agency-panel-table.png` });

  // A new code from the panel's own form.
  // The create action's body is read on the Node side, not through the browser. The create navigates
  // the page away, and Chromium then drops the response body ("No data found for resource", NG-347),
  // so response.text() from the browser races the navigation. Here page.route fetches the one POST to
  // .../ajans (no redirects followed), keeps its body, and hands the same response to the browser.
  let markAction!: (b: { url: string; text: string }) => void;
  let failAction!: (e: unknown) => void;
  const actionBodyP = new Promise<{ url: string; text: string }>((resolve, reject) => {
    markAction = resolve;
    failAction = reject;
  });
  // The panel also polls notifications with a POST to the same URL (under load it can come first).
  // Those responses carry "notifications" and are passed through untouched; the first other POST is the create.
  let seenAction = false;
  await page.route(
    (url) => url.pathname.endsWith('/ajans'),
    async (route) => {
      if (route.request().method() !== 'POST' || seenAction) return route.continue();
      try {
        const res = await route.fetch({ maxRedirects: 0 });
        const text = (await res.body()).toString('utf8');
        await route.fulfill({ response: res });
        if (text.includes('"notifications"')) return;
        seenAction = true;
        markAction({ url: route.request().url(), text });
      } catch (err) {
        failAction(err);
        await route.abort().catch(() => undefined);
      }
    },
  );
  await page.getByRole('button', { name: trMessages.agency.codes.create }).click();
  const action = await actionBodyP;
  bodies.push({ url: action.url, kind: 'POST action', text: action.text });
  await expect(page.getByText(trMessages.agency.codes.createdTitle)).toBeVisible();
  const created = await withSystemScope('platform-admin', 'e2e.fo392.read', (tx) =>
    tx.agencyInviteCode.findFirstOrThrow({
      where: { tenantId: fx.agencyId, label: null },
      orderBy: { createdAt: 'desc' },
      select: { useLimit: true, expiresAt: true, createdAt: true },
    }),
  );
  // A real limit, in the window, and not the one fixed number.
  expect(created.useLimit).toBeGreaterThanOrEqual(INVITE_CODE_MIN_USE_LIMIT);
  expect(created.useLimit).toBeLessThanOrEqual(INVITE_CODE_MAX_USE_LIMIT);
  await page.screenshot({ path: `${SHOTS}/03-agency-panel.png`, fullPage: true });

  // N-2: nothing received by the browser carries the limit or a use count.
  // Read every body BEFORE the reload: a body still being read when the page navigates is lost,
  // which in the isolated gate run left the server-action response out of the list.
  await Promise.all(pending);
  await page.reload();
  await expectHydrated(page.getByTestId('invite-codes-limit-note'));
  await Promise.all(pending);
  expect(bodies.length).toBeGreaterThan(0);
  const exact = created.useLimit!;
  for (const b of bodies) {
    expect(b.text, `${b.kind} ${b.url} carries useLimit`).not.toMatch(/useLimit/);
    expect(b.text, `${b.kind} ${b.url} carries usedCount`).not.toMatch(/usedCount/);
  }
  // Server-action responses are small: the code's exact limit must not be among them.
  const actions = bodies.filter((b) => b.kind.startsWith('POST'));
  expect(actions.length).toBeGreaterThan(0);
  expect(actions.some((b) => b.text.includes('code'))).toBe(true); // it really is the create response
  if (exact !== INVITE_CODE_MIN_USE_LIMIT) {
    for (const b of actions) expect(b.text, `${b.url} carries the exact limit ${exact}`).not.toMatch(new RegExp(`(?<![0-9A-Za-z])${exact}(?![0-9A-Za-z])`));
    const visible = await page.locator('main').innerText();
    expect(visible).not.toMatch(new RegExp(`(?<![0-9])${exact}(?![0-9])`));
  }
  await expect(page.getByTestId('invite-codes-limit-note')).toContainText(String(INVITE_CODE_MIN_USE_LIMIT));
});
