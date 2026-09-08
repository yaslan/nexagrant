import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTRH86RCGVEGC — the evidence module invented accreditation.
 *
 * `extractEvidenceMetadata()` had no OCR and no LLM behind it. For every upload it
 * returned a fixed certificate body ("Belge No: ISO-27001-2025-9921", issuer
 * "TÜRKAK / TSE Akredite Kurul"), a `Math.random()` document number, invented dates,
 * a "doğrulanmış" tag and two source-less compliance claims — persisted as Claim rows
 * at confidence 0.95. That content feeds EU funding applications (CLAUDE.md §7).
 *
 * This spec drives the real upload form in a real browser and asserts on what the
 * detail drawer shows. Nothing is stubbed.
 */

const SHOTS = shotsDir('TASK-MTRH86RCGVEGC-screenshots');
const WORKSPACE = 'org-1xnfma';
const TENANT_ID = 'cmtrhjys10001ncxk13gwtbcb';
const EVIDENCE_URL = `/tr/${WORKSPACE}/evidence`;

// The evidence page is behind moduleGate('M3'), and this tenant has no ModuleState
// row, which reads as OFF. The fixture turns M3 on for the run and puts the tenant
// back exactly as it was afterwards.
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
});

test.afterAll(async () => {
  if (!hadModuleRow) {
    await prisma.moduleState.deleteMany({ where: { tenantId: TENANT_ID, moduleId: 'M3' } });
  }
  await prisma.evidence.deleteMany({ where: { tenantId: TENANT_ID, fileName: PLAIN_FILE.name } });
  await prisma.$disconnect();
});

// A document with no certificate content at all. Whatever the drawer claims about
// an issuing authority or a document number for THIS file was not read off it.
const PLAIN_FILE = {
  name: 'bos-belge-tasrh86.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% intentionally empty test document\n%%EOF\n'),
};

test('an upload with no readable metadata does not gain invented metadata', async ({ page }) => {
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
  await page.screenshot({ path: `${SHOTS}/01-evidence-page.png`, fullPage: true });

  // ── Real upload through the real form.
  await page.getByRole('button', { name: /Belge Yükle|Upload/ }).first().click();
  await page.locator('input[type="file"]').setInputFiles(PLAIN_FILE);
  await page.screenshot({ path: `${SHOTS}/02-upload-form.png`, fullPage: true });
  await page.getByRole('button', { name: /Cloudflare R2/ }).click();

  // The new row appears at the top of the list.
  const card = page.getByText(PLAIN_FILE.name.replace(/\.[^/.]+$/, '')).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/03-uploaded.png`, fullPage: true });

  // ── Open the detail drawer: this is the surface that shows the metadata.
  await page.getByRole('button', { name: /İncele & İddialar/ }).first().click();
  const drawer = page.locator('text=Veren Kurum:').first();
  await expect(drawer).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/04-detail-drawer.png`, fullPage: true });

  const body = await page.locator('body').innerText();

  // Every one of these strings, if present, was invented for a document that
  // contains none of it.
  expect(body).not.toContain('ISO-27001-2025-9921');
  expect(body).not.toContain('TÜRKAK');
  expect(body).not.toContain('DOC-992182');
  expect(body).not.toMatch(/DOC-\d{6}/);
  expect(body).not.toContain('doğrulanmış');
  expect(body).not.toMatch(/uluslararası standartlara tam uyumlu/);
  expect(body).not.toMatch(/bağımsız akredite denetçi/);
  expect(body).not.toMatch(/AB veri koruması doğrulanmıştır/);

  // The status badge is computed from the expiry date alone, so it may say the
  // document is valid but never that it was verified. (The page intro's "Doğrulanmış
  // belgeleri yükleyerek..." is instruction to the user, not a claim about this file,
  // which is why the check is on the badge rather than on the whole page.)
  await expect(page.getByText('Doğrulanmış Geçerli')).toHaveCount(0);

  // And the honest replacements are on screen instead of the invented values.
  await expect(page.getByText('Belirtilmedi — elle doldurun').first()).toBeVisible();
  await expect(
    page.getByText(/Bu belgeden metin okunmadı/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Bu belgeye bağlı bir iddia yok/).first()).toBeVisible();
});
