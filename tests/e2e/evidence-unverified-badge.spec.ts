import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

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
const WORKSPACE = 'org-1xnfma';
const TENANT_ID = 'cmtrhjys10001ncxk13gwtbcb';
const EVIDENCE_URL = `/tr/${WORKSPACE}/evidence`;

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

let hadModuleRow = false;

test.beforeAll(async () => {
  const existing = await prisma.moduleState.findUnique({
    where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M3' } },
    select: { status: true },
  });
  hadModuleRow = existing !== null;
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M3' } },
    update: { status: 'ON' },
    create: { tenantId: TENANT_ID, moduleId: 'M3', status: 'ON' },
  });

  await prisma.evidence.deleteMany({ where: { id: UNVERIFIED_ROW.id } });
  await prisma.evidence.create({ data: UNVERIFIED_ROW });
});

test.afterAll(async () => {
  await prisma.evidence.deleteMany({ where: { id: UNVERIFIED_ROW.id } });
  await prisma.evidence.deleteMany({
    where: { tenantId: TENANT_ID, fileName: UPLOAD_FILE.name },
  });
  if (!hadModuleRow) {
    await prisma.moduleState.deleteMany({ where: { tenantId: TENANT_ID, moduleId: 'M3' } });
  }
  await prisma.$disconnect();
});

async function signIn(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(EVIDENCE_URL)}`);
  await page.locator('input[type="email"]').fill('owner@demo.fabrika.test');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${EVIDENCE_URL}`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
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
