import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { scanEvidence } from '../../src/lib/evidence-scan';
import { cleanDocx, eicarDocx, DOCX_MIME } from '../helpers/eicar';
import { evidenceTenant } from './fixtures/evidence-tenant';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * NG-239 (§18.3) — the evidence screen while and after a file is virus-scanned.
 *
 * A file uploaded through the screen (presign → PUT → confirm) shows "Taranıyor"
 * and no download link. The scan is the `evidence-scan` job's body
 * (`scanEvidence`), run here by the spec rather than by a worker process (the e2e
 * server starts none): against a real clamd when NG239_CLAMD_HOST / CLAMD_HOST
 * is set (`docker compose --profile scan up -d clamav`), otherwise those steps
 * skip. Without a clamd answering, the screen says "Taranamadı, yeniden
 * denenecek" — that test always runs. Only the EICAR test string, never malware.
 */

const SHOTS = shotsDir('NG-239-evidence');
const tenant = evidenceTenant('scan');
const CLAMD_HOST = process.env.NG239_CLAMD_HOST || process.env.CLAMD_HOST || '';
const CLAMD_PORT = Number(process.env.NG239_CLAMD_PORT || process.env.CLAMD_PORT || 3310);

test.beforeAll(async () => {
  await tenant.setup();
});

test.afterAll(async () => {
  // The upload queued real jobs; no worker runs here, so they are removed with the tenant.
  await prisma
    .$queryRawUnsafe(
      `select graphile_worker.remove_job(key)::text from graphile_worker.jobs where task_identifier = 'evidence-scan' and payload->>'tenantId' = $1 and key is not null`,
      tenant.tenantId
    )
    .catch(() => {});
  await tenant.teardown();
  await prisma.$disconnect();
});

async function openEvidence(page: Page) {
  await signInAs(page, { id: 'ev-scan-e2e-user', email: tenant.email, tenantId: tenant.tenantId, role: 'TENANT_OWNER' });
  await page.goto(tenant.evidenceUrl);
  await page.waitForURL(`**${tenant.evidenceUrl}`, { timeout: 30_000 });
  await expectHydrated(page.getByRole('button', { name: /Belge Yükle|Upload/ }).first());
}

/** Uploads through the screen and returns the row it wrote. */
async function uploadThroughScreen(page: Page, name: string, buffer: Buffer) {
  await page.getByRole('button', { name: /Yeni Belge Yükle/ }).first().click();
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: DOCX_MIME, buffer });
  await page.getByRole('button', { name: /Cloudflare R2/ }).click();
  await expect(page.getByText(name.replace(/\.[^/.]+$/, '')).first()).toBeVisible({ timeout: 30_000 });
  return prisma.evidence.findFirstOrThrow({
    where: { tenantId: tenant.tenantId, fileName: name },
    select: { id: true, scanStatus: true },
  });
}

const scanState = (page: Page, kind: string) => page.locator(`[data-testid="evidence-scan-state"][data-scan="${kind}"]`);
const downloadLinkOf = (page: Page, id: string) => page.locator(`a[href*="/api/evidence/${id}/download"]`);

test('a fresh upload says "Taranıyor" and offers no download; clamd silent → "Taranamadı, yeniden denenecek"', async ({ page }) => {
  await openEvidence(page);
  const row = await uploadThroughScreen(page, 'ng239-beklemede.docx', cleanDocx('beklemede'));
  expect(row.scanStatus).toBe('PENDING');
  await expect(scanState(page, 'scan_pending')).toHaveText('Taranıyor');
  await expect(downloadLinkOf(page, row.id)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/e2e-01-taraniyor.png`, fullPage: true });

  // The server refuses it too, not only the screen.
  const refused = await page.request.get(`/api/evidence/${row.id}/download`);
  expect(refused.status()).toBe(409);

  // The job runs with clamd down (nothing listens on port 9).
  const out = await scanEvidence(
    { tenantId: tenant.tenantId, evidenceId: row.id, attempt: 0 },
    { clamd: { host: '127.0.0.1', port: 9, timeoutMs: 3000 }, enqueue: async () => true }
  );
  expect(out).toMatchObject({ status: 'ERROR' });
  await page.reload();
  await expect(scanState(page, 'scan_error')).toHaveText('Taranamadı, yeniden denenecek');
  await scanState(page, 'scan_error').scrollIntoViewIfNeeded();
  await expect(downloadLinkOf(page, row.id)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/e2e-02-taranamadi.png`, fullPage: true });
});

test('against a real clamd: a clean file gets its download link, EICAR is "Zararlı bulundu, kaldırıldı"', async ({ page }) => {
  test.skip(!CLAMD_HOST, 'no clamd configured (NG239_CLAMD_HOST / CLAMD_HOST)');
  const clamd = { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 60_000 };
  await openEvidence(page);

  const clean = await uploadThroughScreen(page, 'ng239-temiz.docx', cleanDocx('temiz kanıt'));
  const eicar = await uploadThroughScreen(page, 'ng239-eicar.docx', eicarDocx());
  await expect(scanState(page, 'scan_pending').first()).toBeVisible();
  await scanState(page, 'scan_pending').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/e2e-03-iki-dosya-taraniyor.png`, fullPage: true });

  expect(await scanEvidence({ tenantId: tenant.tenantId, evidenceId: clean.id, attempt: 0 }, { clamd })).toEqual({ status: 'CLEAN' });
  expect(await scanEvidence({ tenantId: tenant.tenantId, evidenceId: eicar.id, attempt: 0 }, { clamd })).toMatchObject({
    status: 'INFECTED',
    objectDeleted: true,
  });

  await page.reload();
  await expect(downloadLinkOf(page, clean.id)).toHaveCount(1);
  await expect(downloadLinkOf(page, eicar.id)).toHaveCount(0);
  await expect(scanState(page, 'scan_infected')).toHaveText('Zararlı bulundu, kaldırıldı');
  await scanState(page, 'scan_infected').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/e2e-04-sonuc-temiz-ve-zararli.png`, fullPage: true });

  const ok = await page.request.get(`/api/evidence/${clean.id}/download`);
  expect(ok.status()).toBe(200);
  expect(Buffer.from(await ok.body()).equals(cleanDocx('temiz kanıt'))).toBe(true);
  const blocked = await page.request.get(`/api/evidence/${eicar.id}/download`);
  expect(blocked.status()).toBe(409);
  expect(await blocked.text()).not.toContain('EICAR-STANDARD');
});
