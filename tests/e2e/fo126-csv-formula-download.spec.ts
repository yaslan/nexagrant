import { test, expect } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { prisma } from '../../src/lib/db';
import { formulaCells } from "../helpers/spreadsheet-csv";
import { requireId } from '../helpers/teardown-guard';
import { evidenceTenant } from './fixtures/evidence-tenant';
import { signInAs } from './fixtures/session';

/**
 * FO-126 (TASK-MVMFBXYRKJUO9) — the dashboard and evidence CSV downloads, read back from a real
 * browser download. A formula title saved on an opportunity and on an evidence item must come
 * out of both files as text: no cell in either file may start with a formula sign, under `,` or `;`.
 *
 * FO-133 Ö-2: the spec has a tenant of its own (fixtures/evidence-tenant.ts), so a failed teardown
 * cannot leave a formula-titled row in the shared demo tenant that other dashboard specs count.
 *
 * Set FO126_EVIDENCE_DIR to copy the two downloaded files and the page screenshots there.
 */

const PAYLOAD = "=cmd|' /C calc'!A0";
const EVIDENCE_DIR = process.env.FO126_EVIDENCE_DIR;

const tenant = evidenceTenant('fo126');
const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const RANGE = `from=${day(-365)}&to=${day(0)}`;

test.beforeAll(async () => {
  await tenant.setup();
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { tenantId: tenant.tenantId } });
  await prisma.opportunity.create({
    data: { tenantId: tenant.tenantId, workspaceId: workspace.id, title: PAYLOAD, stage: 'G2', status: 'ACTIVE' },
  });
  await prisma.evidence.create({
    data: {
      tenantId: tenant.tenantId,
      kind: 'corporate',
      category: 'CAT-01',
      title: PAYLOAD,
      body: 'FO-126 browser check',
      issuingAuthority: 'TSE;=cmd|x',
      status: 'VALID',
      fileName: '+SUM(A1)',
    },
  });
});

test.afterAll(async () => {
  // The fixture's teardown removes the tenant's evidence, memberships and workspace; the
  // opportunity has no cascade from the tenant row, so it goes first.
  await prisma.opportunity.deleteMany({ where: { tenantId: requireId(tenant.tenantId, 'tenantId') } });
  await tenant.teardown();
  await prisma.$disconnect();
});

function keep(source: string, name: string) {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  copyFileSync(source, join(EVIDENCE_DIR, name));
}

async function signIn(page: import('@playwright/test').Page) {
  await signInAs(page, { id: tenant.userId, email: tenant.email, tenantId: tenant.tenantId, role: 'TENANT_OWNER' });
}

test('the dashboard CSV download carries the formula title as text', async ({ page }) => {
  await signIn(page);
  // The English dashboard: its export link points at the real route. The Turkish panel path builds
  // `/tr/main/panel/api/export-csv`, which is a 404 (FO-126 report, out-of-scope finding).
  await page.goto(`/en/${tenant.workspace}/dashboard?${RANGE}`);
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
  await signIn(page);
  await page.goto(tenant.evidenceUrl);

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
