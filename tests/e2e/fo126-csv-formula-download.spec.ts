import { test, expect } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withSystemScope } from '../../src/lib/system-scope';
import { formulaCells } from '../helpers/spreadsheet-csv';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * FO-126 (TASK-MVMFBXYRKJUO9) — the dashboard and evidence CSV downloads, read back from a real
 * browser download. A formula title saved on an opportunity and on an evidence item must come
 * out of both files as text: no cell in either file may start with a formula sign, under `,` or `;`.
 *
 * Set FO126_EVIDENCE_DIR to copy the two downloaded files and the page screenshots there.
 */

const TENANT = 'demo-tenant';
const PAYLOAD = "=cmd|' /C calc'!A0";
const OWNER = {
  userId: 'e2e-fo126-csv-owner',
  email: 'fo126-csv-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: TENANT,
};
const EVIDENCE_DIR = process.env.FO126_EVIDENCE_DIR;

const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const RANGE = `from=${day(-365)}&to=${day(0)}`;

let opportunityId = '';
let evidenceId = '';

test.beforeAll(async () => {
  await seedIdentity({ ...OWNER, workspaceIds: [] });
  await withSystemScope('platform-admin', 'fo126.csv.seed', async (tx) => {
    const workspace = await tx.workspace.findFirstOrThrow({ where: { tenantId: TENANT, slug: 'main' } });
    const opportunity = await tx.opportunity.create({
      data: { tenantId: TENANT, workspaceId: workspace.id, title: PAYLOAD, stage: 'G2', status: 'ACTIVE' },
    });
    opportunityId = opportunity.id;
    const evidence = await tx.evidence.create({
      data: {
        tenantId: TENANT,
        kind: 'corporate',
        category: 'CAT-01',
        title: PAYLOAD,
        body: 'FO-126 browser check',
        issuingAuthority: 'TSE;=cmd|x',
        status: 'VALID',
        fileName: '+SUM(A1)',
      },
    });
    evidenceId = evidence.id;
  });
});

test.afterAll(async () => {
  await withSystemScope('platform-admin', 'fo126.csv.cleanup', async (tx) => {
    if (evidenceId) await tx.evidence.deleteMany({ where: { id: evidenceId } });
    if (opportunityId) await tx.opportunity.deleteMany({ where: { id: opportunityId } });
  });
  await cleanupIdentity([OWNER.userId]);
});

function keep(source: string, name: string) {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  copyFileSync(source, join(EVIDENCE_DIR, name));
}

test('the dashboard CSV download carries the formula title as text', async ({ page }) => {
  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
  // The English dashboard: its export link points at the real route. The Turkish panel path builds
  // `/tr/main/panel/api/export-csv`, which is a 404 (FO-126 report, out-of-scope finding).
  await page.goto(`/en/main/dashboard?${RANGE}`);
  await page.locator('#dashboard-tab-export').click();

  const link = page.locator('a[href*="api/export-csv"]').first();
  await expect(link).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const path = await download.path();
  keep(path, 'dashboard-export.csv');
  if (EVIDENCE_DIR) await page.screenshot({ path: join(EVIDENCE_DIR, 'dashboard-export-page.png'), fullPage: false });

  const text = readFileSync(path, 'utf8');
  expect(formulaCells(text)).toEqual({ ',': [], ';': [] });
  expect(text).toContain(`'${PAYLOAD}`);
});

test('the evidence pack CSV download carries the formula title as text', async ({ page }) => {
  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
  await page.goto('/tr/main/kanitlar');

  const button = page.getByRole('button', { name: 'CSV Dışa Aktar' });
  await expect(button).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const path = await download.path();
  keep(path, 'evidence-export.csv');
  if (EVIDENCE_DIR) await page.screenshot({ path: join(EVIDENCE_DIR, 'evidence-export-page.png'), fullPage: false });

  const text = readFileSync(path, 'utf8');
  expect(formulaCells(text)).toEqual({ ',': [], ';': [] });
  expect(text).toContain(`'${PAYLOAD}`);
});
