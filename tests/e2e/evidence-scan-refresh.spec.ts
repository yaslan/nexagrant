import fs from 'node:fs';
import path from 'node:path';

import { test, expect, type Page, type Request } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { scanEvidence } from '../../src/lib/evidence-scan';
import { cleanDocx, eicarDocx, DOCX_MIME } from '../helpers/eicar';
import { evidenceTenant } from './fixtures/evidence-tenant';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * NG-264 (b) — the evidence screen refreshes a scan badge by itself.
 *
 * A row that is still PENDING (or ERROR, which is retried) used to keep its
 * "Taranıyor" badge until a full page reload. The list now polls the tenant's
 * evidence rows while one of them is waiting: 5 s to start, growing up to a
 * 30 s ceiling, and it stops when the tab is hidden and when no row is waiting.
 * Only the scan state is taken from the poll; the download gate is unchanged.
 *
 * Kept apart from tests/e2e/evidence-scan.spec.ts (NG-239 owns that file). Only
 * the EICAR test string is used, never malware. The clamd tests run when
 * NG239_CLAMD_HOST / CLAMD_HOST is set and skip otherwise.
 */

const SHOTS = shotsDir('NG-264-evidence-refresh');
const CLAMD_HOST = process.env.NG239_CLAMD_HOST || process.env.CLAMD_HOST || '';
const CLAMD_PORT = Number(process.env.NG239_CLAMD_PORT || process.env.CLAMD_PORT || 3310);

const waiting = evidenceTenant('scan-refresh');
const idle = evidenceTenant('scan-refresh-idle');

test.beforeAll(async () => {
  await waiting.setup();
  await idle.setup();
});

// Each test starts with an empty waiting tenant: a row left by an earlier test would
// match the same badge locators.
test.beforeEach(async () => {
  await waiting.setup();
});

test.afterAll(async () => {
  // Uploads queue real jobs; no worker runs here, so remove them with the tenants.
  await prisma
    .$queryRawUnsafe(
      `select graphile_worker.remove_job(key)::text from graphile_worker.jobs where task_identifier = 'evidence-scan' and (payload->>'tenantId' = $1 or payload->>'tenantId' = $2) and key is not null`,
      waiting.tenantId,
      idle.tenantId
    )
    .catch(() => {});
  await waiting.teardown();
  await idle.teardown();
  await prisma.$disconnect();
});

async function openEvidence(page: Page, tenant: ReturnType<typeof evidenceTenant>) {
  await signInAs(page, { id: tenant.userId, email: tenant.email, tenantId: tenant.tenantId, role: 'TENANT_OWNER' });
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
    where: { fileName: name, tenantId: waiting.tenantId },
    select: { id: true, scanStatus: true },
  });
}

const scanState = (page: Page, kind: string) => page.locator(`[data-testid="evidence-scan-state"][data-scan="${kind}"]`);
const downloadLinkOf = (page: Page, id: string) => page.locator(`a[href*="/api/evidence/${id}/download"]`);

/**
 * The id Next gives the evidence refresh action (getEvidenceScanStatusAction), read from
 * the server-action manifest of the running dev or start build. Other server
 * actions (the notification bell polls listNotifications) are not counted.
 */
function evidenceListActionId(): string {
  for (const rel of ['.next/dev/server/server-reference-manifest.json', '.next/server/server-reference-manifest.json']) {
    const file = path.resolve(rel);
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { node?: Record<string, { exportedName?: string; filename?: string }> };
    for (const [id, entry] of Object.entries(manifest.node ?? {})) {
      if (entry.exportedName === 'getEvidenceScanStatusAction' && String(entry.filename).endsWith('evidence/actions.ts')) return id;
    }
  }
  throw new Error('getEvidenceScanStatusAction is not in the server-action manifest');
}

/** POSTs of the evidence list action. */
function countEvidenceListCalls(page: Page): { count: () => number } {
  const id = evidenceListActionId();
  let n = 0;
  page.on('request', (req: Request) => {
    if (req.method() === 'POST' && req.headers()['next-action'] === id) n += 1;
  });
  return { count: () => n };
}

/** Runs the scan job against a clamd that does not answer (nothing on port 9). */
async function scanWithClamdDown(evidenceId: string) {
  return scanEvidence(
    { tenantId: waiting.tenantId, evidenceId, attempt: 0 },
    { clamd: { host: '127.0.0.1', port: 9, timeoutMs: 3000 }, enqueue: async () => true }
  );
}

test.describe('a waiting row refreshes by itself', () => {
  test('clamd silent: "Taranıyor" turns into "Taranamadı" without a reload', async ({ page }) => {
    await openEvidence(page, waiting);
    const row = await uploadThroughScreen(page, 'ng264-sessiz.docx', cleanDocx('sessiz'));
    expect(row.scanStatus).toBe('PENDING');
    await expect(scanState(page, 'scan_pending')).toHaveText('Taranıyor');

    expect(await scanWithClamdDown(row.id)).toMatchObject({ status: 'ERROR' });

    // No reload: the poll has to pick the result up on its own.
    await expect(scanState(page, 'scan_error')).toHaveText('Taranamadı, yeniden denenecek', { timeout: 40_000 });
    await expect(downloadLinkOf(page, row.id)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/refresh-01-taranamadi-yenilemeden.png`, fullPage: true });
  });

  test('TR and EN screens: the refreshed badge, for the evidence record', async ({ page }) => {
    await openEvidence(page, waiting);
    const row = await uploadThroughScreen(page, 'ng264-ekran.docx', cleanDocx('ekran'));
    await expect(scanState(page, 'scan_pending')).toHaveText('Taranıyor');
    await scanState(page, 'scan_pending').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/refresh-03-tr-taraniyor.png` });

    expect(await scanWithClamdDown(row.id)).toMatchObject({ status: 'ERROR' });
    await expect(scanState(page, 'scan_error')).toHaveText('Taranamadı, yeniden denenecek', { timeout: 40_000 });
    await scanState(page, 'scan_error').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/refresh-04-tr-taranamadi.png` });

    await page.goto(waiting.evidenceUrl.replace('/tr/', '/en/'));
    await expectHydrated(page.getByRole('button', { name: /Upload|Belge Yükle/ }).first());
    await expect(scanState(page, 'scan_error')).toHaveText('Could not be scanned, will retry');
    await scanState(page, 'scan_error').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/refresh-05-en-could-not-be-scanned.png` });
  });

  test('real clamd: a clean file gets its download link and EICAR its infected badge, without a reload', async ({ page }) => {
    test.skip(!CLAMD_HOST, 'no clamd configured (NG239_CLAMD_HOST / CLAMD_HOST)');
    const clamd = { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 60_000 };
    await openEvidence(page, waiting);

    const clean = await uploadThroughScreen(page, 'ng264-temiz.docx', cleanDocx('temiz kanıt'));
    const eicar = await uploadThroughScreen(page, 'ng264-eicar.docx', eicarDocx());
    await expect(scanState(page, 'scan_pending').first()).toBeVisible();

    expect(await scanEvidence({ tenantId: waiting.tenantId, evidenceId: clean.id, attempt: 0 }, { clamd })).toEqual({ status: 'CLEAN' });
    expect(await scanEvidence({ tenantId: waiting.tenantId, evidenceId: eicar.id, attempt: 0 }, { clamd })).toMatchObject({ status: 'INFECTED' });

    await expect(downloadLinkOf(page, clean.id)).toHaveCount(1, { timeout: 40_000 });
    await expect(downloadLinkOf(page, eicar.id)).toHaveCount(0);
    await expect(scanState(page, 'scan_infected')).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/refresh-02-temiz-ve-zararli-yenilemeden.png`, fullPage: true });

    // The download gate itself is unchanged: CLEAN downloads, INFECTED does not.
    const ok = await page.request.get(`/api/evidence/${clean.id}/download`);
    expect(ok.status()).toBe(200);
    const blocked = await page.request.get(`/api/evidence/${eicar.id}/download`);
    expect(blocked.status()).toBe(409);
  });
});

/** The announcer: the one polite live region the list keeps in the page (review E-1, Ö-3). */
const ANNOUNCER = '[data-testid="evidence-scan-announcer"]';

test.describe('the scan result is announced, and the refresh knows when to stop', () => {
  test('a clean scan: the announcer stays in the page and its text changes', async ({ page }) => {
    test.skip(!CLAMD_HOST, 'no clamd configured (NG239_CLAMD_HOST / CLAMD_HOST)');
    const clamd = { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 60_000 };
    await openEvidence(page, waiting);
    const announcer = page.locator(ANNOUNCER);
    await expect(announcer).toHaveCount(1);
    const row = await uploadThroughScreen(page, 'ng264-anons.docx', cleanDocx('anons'));
    // Nothing is announced on first load or on the upload itself: the region is empty.
    await expect(announcer).toHaveText('');
    await page.evaluate(() => {
      (window as unknown as { __announcer?: Element }).__announcer = document.querySelector('[data-testid="evidence-scan-announcer"]') ?? undefined;
    });

    expect(await scanEvidence({ tenantId: waiting.tenantId, evidenceId: row.id, attempt: 0 }, { clamd })).toEqual({ status: 'CLEAN' });
    await expect(downloadLinkOf(page, row.id)).toHaveCount(1, { timeout: 40_000 });

    // The same element is still in the document (a removed live region announces nothing), and it now says the result.
    await expect(announcer).toHaveText('ng264-anons: Taranıp temiz bulundu');
    const sameElement = await page.evaluate(() => {
      const before = (window as unknown as { __announcer?: Element }).__announcer;
      return Boolean(before && before.isConnected && before === document.querySelector('[data-testid="evidence-scan-announcer"]'));
    });
    expect(sameElement).toBe(true);
  });

  test('a row whose retries ran out: the refresh stops and does not keep reading the list', async ({ page }) => {
    test.setTimeout(150_000);
    await openEvidence(page, waiting);
    const row = await uploadThroughScreen(page, 'ng264-bitti.docx', cleanDocx('bitti'));
    // The scan failed for the last time: attempts used up, the sweep has the row from here.
    await prisma.evidence.updateMany({
      where: { id: row.id, tenantId: waiting.tenantId },
      data: { scanStatus: 'ERROR', scanAttempts: 3, scannedAt: new Date() },
    });
    await expect(scanState(page, 'scan_error')).toHaveText('Taranamadı, yeniden denenecek', { timeout: 20_000 });
    const calls = countEvidenceListCalls(page);
    await page.waitForTimeout(40_000);
    const settled = calls.count();
    await page.waitForTimeout(40_000);
    expect(calls.count()).toBe(settled);
  });

  test('a waiting row deleted on the server leaves the list and the refresh stops', async ({ page }) => {
    test.setTimeout(150_000);
    await openEvidence(page, waiting);
    const row = await uploadThroughScreen(page, 'ng264-silinen.docx', cleanDocx('silinen'));
    await prisma.evidence.deleteMany({ where: { id: row.id, tenantId: waiting.tenantId } });
    await expect(page.getByText('ng264-silinen', { exact: true })).toHaveCount(0, { timeout: 20_000 });
    const calls = countEvidenceListCalls(page);
    await page.waitForTimeout(40_000);
    const settled = calls.count();
    await page.waitForTimeout(40_000);
    expect(calls.count()).toBe(settled);
  });
});

test.describe('nothing waiting, or tab hidden: no polling', () => {
  test('with no waiting row the screen sends no refresh request', async ({ page }) => {
    await openEvidence(page, idle);
    const actions = countEvidenceListCalls(page);
    await page.waitForTimeout(12_000);
    expect(actions.count()).toBe(0);
  });

  test('a hidden tab stops polling and resumes when visible again', async ({ page }) => {
    await openEvidence(page, waiting);
    const row = await uploadThroughScreen(page, 'ng264-gizli.docx', cleanDocx('gizli'));
    await expect(scanState(page, 'scan_pending')).toHaveText('Taranıyor');

    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);

    await setVisibility('hidden');
    const actions = countEvidenceListCalls(page);
    // The scan finishes while the tab is hidden; nothing should ask the server meanwhile.
    expect(await scanWithClamdDown(row.id)).toMatchObject({ status: 'ERROR' });
    await page.waitForTimeout(12_000);
    expect(actions.count()).toBe(0);
    await expect(scanState(page, 'scan_pending')).toHaveCount(1);

    await setVisibility('visible');
    await expect(scanState(page, 'scan_error')).toHaveText('Taranamadı, yeniden denenecek', { timeout: 20_000 });
    // The answer can reach the DOM before Node has seen the request event: poll the count.
    await expect.poll(() => actions.count()).toBeGreaterThan(0);
  });
});
