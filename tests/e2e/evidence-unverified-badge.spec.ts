import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { evidenceTenant } from './fixtures/evidence-tenant';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTRH86RCGVEGC (second pass) — the "verified" badge.
 *
 * `Evidence.status` documents a real verification state:
 * `UNVERIFIED | VALID | EXPIRING_SOON | EXPIRED | REJECTED`. Two things ignored it:
 *
 *   1. `confirmEvidenceUploadAction()` wrote `status: 'VALID'` on every upload, so a
 *      file nobody had checked was recorded as valid the moment it landed.
 *   2. `getStatusBadge()` never looked at `UNVERIFIED` (or `REJECTED`). Both fell
 *      through to the green tick badge.
 *
 * So an unverified document was shown to the user as verified-and-valid, which is the
 * same CLAUDE.md §7 failure as the invented certificate numbers: a claim on screen
 * that no record backs.
 */

const SHOTS = process.env.EVIDENCE_SHOTS
  ?? `${shotsDir('TASK-MTRH86RCGVEGC-screenshots')}/badge-after`;
// A tenant of the spec's own (fixtures/evidence-tenant.ts): plan `basic`, M3 on,
// and no documents but the ones below, which is what lets the tests count badges.
const tenant = evidenceTenant('badge');
const TENANT_ID = tenant.tenantId;

// A row that states, in the column built for it, that nothing has verified it.
const UNVERIFIED_ROW = {
  id: 'ev-unverified-mtrh86',
  tenantId: TENANT_ID,
  kind: 'certificate',
  category: 'CAT-03',
  title: 'Doğrulanmamış Test Belgesi',
  body: '',
  status: 'UNVERIFIED',
};

const UPLOAD_FILE = {
  name: 'yeni-yukleme-mtrh86.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% no certificate content\n%%EOF\n'),
};

test.beforeAll(async () => {
  await tenant.setup();
  // The id is fixed; a run from before this tenant existed may still hold it.
  await prisma.evidence.deleteMany({ where: { id: UNVERIFIED_ROW.id } });
  await prisma.evidence.create({ data: UNVERIFIED_ROW });
});

test.afterAll(async () => {
  await tenant.teardown();
  await prisma.$disconnect();
});

/**
 * A minted session for the user `tenant.setup()` writes (TENANT_OWNER of the spec's own
 * tenant; fixtures/evidence-tenant.ts owns its User + Membership and removes them), not
 * `tenant.signIn`, which drives the demo sign-in form and so cannot run against
 * `next start` (TASK-MUSBCXP9RKS3D). evidence-tenant.ts is shared with
 * evidence-fabrication.spec.ts and is left as it is; its user id is `ev-<key>-e2e-user`.
 */
async function signIn(page: import('@playwright/test').Page) {
  await signInAs(page, { id: 'ev-badge-e2e-user', email: tenant.email, tenantId: tenant.tenantId, role: 'TENANT_OWNER' });
  await page.goto(tenant.evidenceUrl);
  await page.waitForURL(`**${tenant.evidenceUrl}`, { timeout: 30_000 });
  // The evidence page is ready when its upload button is hydrated: the second test
  // clicks it first, and the first photographs the page straight after this.
  await expectHydrated(page.getByRole('button', { name: /Belge Yükle|Upload/ }).first());
}

test('a document nothing has verified is not shown as verified', async ({ page }) => {
  await signIn(page);
  await page.screenshot({ path: `${SHOTS}/01-evidence-page.png`, fullPage: true });

  // The row whose status column literally reads UNVERIFIED. Only one document exists
  // for this tenant during the test, so its badge is the only one on the page.
  const title = page.getByRole('heading', { name: UNVERIFIED_ROW.title });
  await expect(title).toBeVisible({ timeout: 15_000 });
  await title.scrollIntoViewIfNeeded();

  const badge = page.getByTestId('evidence-badge');
  await expect(badge).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/02-unverified-row.png`, fullPage: true });

  // The decision, not the label: the green valid outcome must be unreachable here.
  await expect(badge).toHaveAttribute('data-badge-kind', 'UNVERIFIED');
  await expect(badge).toHaveText('Doğrulanmamış');

  // And the readiness figure must not count it either.
  await expect(page.getByText('0 Geçerli Belge')).toBeVisible();
});

test('a fresh upload is recorded as unverified, not valid', async ({ page }) => {
  await signIn(page);

  await page.getByRole('button', { name: /Yeni Belge Yükle/ }).first().click();
  await page.locator('input[type="file"]').setInputFiles(UPLOAD_FILE);
  await page.getByRole('button', { name: /Cloudflare R2/ }).click();

  const title = UPLOAD_FILE.name.replace(/\.[^/.]+$/, '');
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/03-fresh-upload.png`, fullPage: true });

  // The row the upload wrote says nothing has verified it.
  const row = await prisma.evidence.findFirst({
    where: { tenantId: TENANT_ID, fileName: UPLOAD_FILE.name },
    select: { status: true },
  });
  expect(row?.status).toBe('UNVERIFIED');
});
