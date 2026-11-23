import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { withTenant } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { AGENCY_REPORT_EVENT, buildAgencyReport, generateAgencyReports, reportPeriod } from '../../src/lib/agency/report';
import { agencyReportRetentionCutoff, purgeExpiredAgencyReports } from '../../src/lib/agency/retention';
import { requireId } from '../helpers/teardown-guard';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * NG-341 (HUKUK-5 5d) — agency report retention, end to end.
 *
 * An agency has two reports: this month's, written by the monthly job function, and one
 * generated 13 months ago (past the 12-month retention). The destruction run — the same
 * function the `agency-report-retention` job and `pnpm jobs:agency-report-retention` call,
 * limited to this agency so a parallel spec's agencies are not touched — deletes the old one
 * and keeps the new one. The panel then lists only the new report, still with no download and
 * with the retention note; the deletion record exists in the agency's own tenant with the
 * count, period range and basis. A second run deletes nothing and writes no second record.
 */

const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const SHOTS = shotsDir('NG-341-screenshots');
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

async function signIn(context: BrowserContext, tenantId: string, userId: string, email: string) {
  const value = await encode({
    token: { sub: userId, id: userId, email, tenantId, role: 'TENANT_OWNER' },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await context.addCookies([{ name: COOKIE_NAME, value, url: BASE_URL }]);
  // The cookie banner is a full-screen alertdialog and swallows clicks.
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
  period: string;
  oldPeriod: string;
}

async function seed(): Promise<Fixture> {
  const stamp = `ng341-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const now = new Date();
  const period = reportPeriod(now);
  const { agencyId, user } = await withSystemScope('platform-admin', 'e2e.agency-report-retention.setup', async (tx) => {
    const a = await tx.tenant.create({
      data: { name: `Saklama Ajansı ${stamp}`, slug: stamp, country: 'TR', kind: 'AGENCY' },
      select: { id: true },
    });
    const u = { id: `${stamp}-u`, email: `${stamp}-u@e2e.fabrika.test` };
    await tx.user.create({ data: { id: u.id, email: u.email, name: 'NG341', locale: 'tr' } });
    await tx.membership.create({ data: { userId: u.id, tenantId: a.id, role: 'TENANT_OWNER' } });
    return { agencyId: a.id, user: u };
  });

  // This month's report, by the job function.
  const run = await generateAgencyReports(period, now, { agencies: async () => [{ id: agencyId }] });
  expect(run).toMatchObject({ generated: 1, failed: 0 });

  // A report generated 13 months ago, for the month before that (a valid snapshot).
  const oldAt = new Date(now);
  oldAt.setUTCMonth(oldAt.getUTCMonth() - 13);
  const oldPeriod = reportPeriod(oldAt);
  await withTenant(agencyId, (tx) =>
    tx.auditEvent.create({
      data: {
        tenantId: agencyId,
        type: AGENCY_REPORT_EVENT,
        target: oldPeriod,
        data: JSON.parse(JSON.stringify(buildAgencyReport(new Map(), oldPeriod, oldAt))),
        createdAt: oldAt,
      },
    }),
  );
  return { stamp, agencyId, user, period, oldPeriod };
}

async function cleanup(f: Fixture | undefined) {
  if (!f) return;
  await withSystemScope('platform-admin', 'e2e.agency-report-retention.cleanup', async (tx) => {
    await tx.membership.deleteMany({ where: { tenantId: f.agencyId } });
    await tx.user.deleteMany({ where: { id: { startsWith: requireId(f.stamp, 'stamp') } } });
    await tx.auditEvent.deleteMany({ where: { tenantId: f.agencyId } });
    // The deletion records go with the tenant (FK ON DELETE CASCADE).
    await tx.tenant.deleteMany({ where: { id: f.agencyId } });
  });
}

const reportsOf = (agencyId: string) =>
  withTenant(agencyId, (tx) =>
    tx.auditEvent.findMany({ where: { tenantId: agencyId, type: AGENCY_REPORT_EVENT }, select: { target: true } }),
  );
const logsOf = (agencyId: string) =>
  withTenant(agencyId, (tx) => tx.agencyReportDeletionLog.findMany({ where: { tenantId: agencyId } }));

test.describe('agency report retention (NG-341)', () => {
  let f: Fixture | undefined;

  test.beforeEach(async () => {
    f = await seed();
  });
  test.afterEach(async () => {
    await cleanup(f);
    f = undefined;
  });

  test('the run deletes the 13-month-old report, keeps this month’s, records it; the panel shows only the new one', async ({
    page,
    context,
  }) => {
    const { agencyId, user, period, oldPeriod } = f!;
    await signIn(context, agencyId, user.id, user.email);

    // Before: both reports are listed.
    expect((await reportsOf(agencyId)).map((r) => r.target).sort()).toEqual([oldPeriod, period].sort());
    await page.goto('/tr/ajans');
    const rows = page.getByTestId('agency-report-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('agency-reports')).toContainText(oldPeriod);
    await page.getByTestId('agency-reports').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/r1-before-purge-tr.png`, fullPage: true });

    // The destruction run.
    const at = new Date();
    const runId = `manual:e2e-${f!.stamp}`;
    const r = await purgeExpiredAgencyReports(at, runId, { agencies: async () => [{ id: agencyId }] });
    expect(r).toMatchObject({ deleted: 1, failed: 0, purged: [{ tenantId: agencyId, deleted: 1, periodFrom: oldPeriod, periodTo: oldPeriod }] });

    // After: the old one is gone, the new one stays, one record.
    expect((await reportsOf(agencyId)).map((x) => x.target)).toEqual([period]);
    const logs = await logsOf(agencyId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      runId,
      tenantId: agencyId,
      reportCount: 1,
      periodFrom: oldPeriod,
      periodTo: oldPeriod,
      basis: 'retention-12m',
    });
    expect(logs[0]!.cutoffAt.toISOString()).toBe(agencyReportRetentionCutoff(at).toISOString());

    await page.reload();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(period);
    await expect(page.getByTestId('agency-reports')).not.toContainText(oldPeriod);
    await expect(page.getByTestId('agency-report-retention')).toHaveText(
      'Bu rapor 12 ay saklanır; süresi dolanlar 6 ayda bir toplu silinir.',
    );
    await expect(page.getByTestId('agency-reports').locator('a[download]')).toHaveCount(0);
    await page.getByTestId('agency-reports').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/r2-after-purge-tr.png`, fullPage: true });

    // The new report still opens on screen.
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      rows.first().getByRole('link', { name: `Raporu görüntüle: ${period} (yeni sekmede açılır)` }).click(),
    ]);
    await tab.waitForLoadState('domcontentloaded');
    expect(await tab.locator('body').innerText()).toContain(period);
    await tab.close();

    // A second run: nothing to delete, no second record.
    const again = await purgeExpiredAgencyReports(new Date(), `${runId}-again`, { agencies: async () => [{ id: agencyId }] });
    expect(again).toMatchObject({ deleted: 0, purged: [], failed: 0 });
    expect(await logsOf(agencyId)).toHaveLength(1);
    expect((await reportsOf(agencyId)).map((x) => x.target)).toEqual([period]);
  });
});
