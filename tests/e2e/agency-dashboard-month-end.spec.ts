import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { withSystemScope } from '../../src/lib/system-scope';
import { generateAgencyReports, reportPeriod } from '../../src/lib/agency/report';
import { requireId } from '../helpers/teardown-guard';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * NG-340 (HUKUK-5 5b) — the agency dashboard shows the last closed month only.
 *
 * An agency with 20 SMEs, 20 municipalities, 3 NGOs and 8 universities opens its
 * dashboard: no month-end run yet, so no number. The monthly job function runs
 * (limited to this agency, as agency-report-retention.spec.ts does, so a parallel
 * spec's agencies are untouched): the dashboard says "Son güncelleme: <month>"
 * and shows the SMEs as 20. Fifteen more SMEs register: on reload the dashboard
 * text is exactly the same. A second run for the month adds nothing.
 */

const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const SHOTS = shotsDir('NG-340-screenshots');
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

type OrgTypeArg = 'SME' | 'MUNICIPALITY' | 'NGO' | 'UNIVERSITY';

async function signIn(context: BrowserContext, tenantId: string, userId: string, email: string) {
  const value = await encode({
    token: { sub: userId, id: userId, email, tenantId, role: 'TENANT_OWNER' },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await context.addCookies([{ name: COOKIE_NAME, value, url: BASE_URL }]);
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

interface Fixture {
  stamp: string;
  agencyId: string;
  user: { id: string; email: string };
}

let orgSeq = 0;
async function addOrgs(f: Fixture, orgType: OrgTypeArg, n: number) {
  await withSystemScope('platform-admin', 'e2e.agency-dashboard-month-end.orgs', async (tx) => {
    for (let i = 0; i < n; i++) {
      const k = ++orgSeq;
      await tx.tenant.create({
        data: { name: `${f.stamp} kurum ${k}`, slug: `${f.stamp}-o${k}`, country: 'TR', kind: 'ORGANIZATION', agencyId: f.agencyId, orgType, province: 'Samsun' },
      });
    }
  });
}

async function seed(): Promise<Fixture> {
  const stamp = `ng340-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const f = await withSystemScope('platform-admin', 'e2e.agency-dashboard-month-end.setup', async (tx) => {
    const a = await tx.tenant.create({
      data: { name: `Ay Sonu Ajansı ${stamp}`, slug: stamp, country: 'TR', kind: 'AGENCY' },
      select: { id: true },
    });
    const u = { id: `${stamp}-u`, email: `${stamp}-u@e2e.fabrika.test` };
    await tx.user.create({ data: { id: u.id, email: u.email, name: 'NG340', locale: 'tr' } });
    await tx.membership.create({ data: { userId: u.id, tenantId: a.id, role: 'TENANT_OWNER' } });
    return { stamp, agencyId: a.id, user: u };
  });
  await addOrgs(f, 'SME', 20);
  await addOrgs(f, 'MUNICIPALITY', 20);
  await addOrgs(f, 'NGO', 3);
  await addOrgs(f, 'UNIVERSITY', 8);
  return f;
}

async function cleanup(f: Fixture | undefined) {
  if (!f) return;
  await withSystemScope('platform-admin', 'e2e.agency-dashboard-month-end.cleanup', async (tx) => {
    const agencyId = requireId(f.agencyId, 'agencyId');
    await tx.membership.deleteMany({ where: { tenantId: agencyId } });
    await tx.user.deleteMany({ where: { id: { startsWith: requireId(f.stamp, 'stamp') } } });
    await tx.auditEvent.deleteMany({ where: { tenantId: agencyId } });
    await tx.tenant.deleteMany({ where: { agencyId } });
    await tx.tenant.deleteMany({ where: { id: agencyId } });
  });
}

test.describe('agency dashboard month-end snapshot (NG-340)', () => {
  let f: Fixture | undefined;
  test.beforeEach(async () => {
    f = await seed();
  });
  test.afterEach(async () => {
    await cleanup(f);
    f = undefined;
  });

  test('no number before the run; the run fills it; a registration during the month changes nothing', async ({ page, context }) => {
    const fx = f!;
    await signIn(context, fx.agencyId, fx.user.id, fx.user.email);
    const funnelSection = page.locator('section[aria-labelledby="agency-funnel-title"]');

    // 1. No month-end run yet: no number at all.
    await page.goto('/tr/ajans?kirilim=tur');
    await expect(page.getByTestId('agency-funnel-updated')).toHaveText('Son güncelleme: henüz yok');
    await expect(page.getByTestId('agency-funnel-empty')).toBeVisible();
    await expect(page.getByTestId('agency-funnel')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/d1-before-run-tr.png`, fullPage: true });

    // 2. The monthly job function, by hand, for the last closed month.
    const now = new Date();
    const period = reportPeriod(now);
    const month = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${period}-01T00:00:00Z`),
    );
    expect(await generateAgencyReports(period, now, { agencies: async () => [{ id: fx.agencyId }] })).toMatchObject({
      generated: 1,
      failed: 0,
    });
    await page.reload();
    await expect(page.getByTestId('agency-funnel-updated')).toHaveText(`Son güncelleme: ${month}`);
    await page.getByTestId('agency-group-filter').selectOption('SME');
    await expect(page.getByTestId('funnel-registered')).toContainText('20');
    const before = await funnelSection.innerText();
    await page.screenshot({ path: `${SHOTS}/d2-after-run-tr.png`, fullPage: true });

    // 3. Fifteen SMEs register during the month (a live count would now say 40).
    await addOrgs(fx, 'SME', 15);
    await page.reload();
    await page.getByTestId('agency-group-filter').selectOption('SME');
    await expect(page.getByTestId('funnel-registered')).toContainText('20');
    expect(await funnelSection.innerText()).toBe(before);
    await page.screenshot({ path: `${SHOTS}/d3-after-registrations-tr.png`, fullPage: true });

    // 4. A second run for the same month adds nothing; the dashboard stays.
    expect(await generateAgencyReports(period, new Date(), { agencies: async () => [{ id: fx.agencyId }] })).toMatchObject({
      generated: 0,
      skipped: 1,
    });
    await page.reload();
    await page.getByTestId('agency-group-filter').selectOption('SME');
    expect(await funnelSection.innerText()).toBe(before);

    // English: the month is named too.
    await page.goto('/en/agency?kirilim=tur');
    await expect(page.getByTestId('agency-funnel-updated')).toHaveText(
      `Last updated: ${new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`))}`,
    );
    await page.screenshot({ path: `${SHOTS}/d4-after-run-en.png`, fullPage: true });
  });
});
