import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MULQL8QB679LQ — K6 admin PDF upload screen (/admin/documents), driven by real clicks.
 *
 * The screen feeds the SHARED corpus (`tenantId: null`) that every tenant's retrieval reads,
 * at the platform's embedding expense, so the two things pinned first are the gate (page and
 * route both closed to a non-admin) and the refusals that must spend nothing.
 *
 * The one test that really embeds is opt-in (`E2E_LIVE_EMBED=1`): it calls OpenAI with a
 * two-chunk synthetic PDF, proves the `Chunk` rows exist with a vector, and then deletes the one
 * document it created by id. A routine e2e run never spends money.
 */

const SHOTS = shotsDir('TASK-MULQL8QB679LQ-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

async function signIn(page: Page, baseURL: string, admin: boolean): Promise<void> {
  const value = await encode({
    token: admin
      ? {
          sub: 'demo-user-superadmin',
          id: 'demo-user-superadmin',
          name: 'Platform Admin',
          email: 'admin@yasinaslan.com.tr',
          tenantId: 'demo-tenant',
          role: 'SUPER_ADMIN',
          isPlatformAdmin: true,
        }
      : {
          sub: 'e2e-member',
          id: 'e2e-member',
          name: 'Tenant Owner',
          email: 'member@example.com',
          tenantId: 'demo-tenant',
          role: 'TENANT_OWNER',
          isPlatformAdmin: false,
        },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' })
    );
  });
}

/** A minimal, well-formed one-page PDF whose text layer is `lines`. */
function syntheticPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = ['BT', '/F1 9 Tf', '40 800 Td', '11 TL', ...lines.map((l) => `(${esc(l)}) '`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

test.describe('admin documents (K6) — gate', () => {
  test('a signed-in non-admin gets a 404 page and a 403 from the route', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, false);

    const res = await page.goto('/tr/admin/documents');
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('k6-file')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/05-non-admin-404-tr.png`, fullPage: true });

    const api = await page.request.post('/api/admin/documents/upload', {
      multipart: {
        file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: syntheticPdf(['x']) },
        kind: 'work_programme',
        title: 'non-admin probe',
      },
    });
    expect(api.status()).toBe(403);
    await expect(api.json()).resolves.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
  });
});

test.describe('admin documents (K6) — screen', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, true);
  });

  test('renders in tr and en, is linked from the admin menu, fits 390px', async ({ page }) => {
    // /admin has no page of its own (404); the app's way in is the sidebar's
    // ADMIN link to /admin/modules, which renders the admin menu.
    await page.goto('/tr/admin/modules');
    await page.getByRole('link', { name: /Belgeler \(K6 RAG\)/ }).first().click();
    await expect(page).toHaveURL(/\/tr\/admin\/documents$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Belgeler (K6 RAG)' })).toBeVisible();
    await expect(page.getByTestId('k6-submit')).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/01-page-tr.png`, fullPage: true });

    await page.goto('/en/admin/documents');
    await expect(page.getByRole('heading', { level: 1, name: 'Documents (K6 RAG)' })).toBeVisible();
    await expect(page.getByLabel('Document type')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-page-en.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tr/admin/documents');
    await expect(page.getByTestId('k6-file')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/03-page-tr-390.png`, fullPage: true });
  });

  test('a renamed non-PDF is refused by the server with a readable message, nothing stored', async ({ page }) => {
    await page.goto('/tr/admin/documents');
    const before = await prisma.document.count({ where: { tenantId: null } });

    await page.getByTestId('k6-file').setInputFiles({
      name: 'not-really.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is plain text, not a PDF'),
    });
    await expect(page.getByTestId('k6-title')).toHaveValue('not-really');
    await page.getByTestId('k6-submit').click();

    await expect(page.getByTestId('k6-error')).toContainText('Bu dosya PDF değil.');
    expect(await prisma.document.count({ where: { tenantId: null } })).toBe(before);
    await page.screenshot({ path: `${SHOTS}/04-not-pdf-error-tr.png`, fullPage: true });

    // Keyboard only: clearing the title and submitting with Enter is caught before any request.
    await page.getByTestId('k6-title').fill('');
    await page.getByTestId('k6-title').press('Enter');
    await expect(page.getByTestId('k6-title')).toBeFocused();
  });

  test('LIVE: a platform admin uploads a small PDF, Chunk rows appear, a re-upload is flagged', async ({ page }) => {
    test.skip(process.env.E2E_LIVE_EMBED !== '1', 'spends OpenAI embedding calls; opt in with E2E_LIVE_EMBED=1');
    test.setTimeout(120_000);

    const stamp = new Date().toISOString();
    const title = `E2E K6 probe ${stamp}`;
    const lines = Array.from(
      { length: 24 },
      (_, i) => `Line ${i + 1}: Horizon Europe cluster 5 synthetic work programme text for the K6 upload probe.`
    );
    const pdf = syntheticPdf(lines);
    let docId = '';

    try {
      await page.goto('/tr/admin/documents');
      await page.getByTestId('k6-file').setInputFiles({ name: 'k6-probe.pdf', mimeType: 'application/pdf', buffer: pdf });
      await page.getByTestId('k6-title').fill(title);
      await page.getByTestId('k6-kind').selectOption('work_programme');
      await page.getByTestId('k6-submit').click();
      await expect(page.getByTestId('k6-status')).toContainText('PDF ayrıştırılıyor');

      const result = page.getByTestId('k6-result');
      await expect(result).toBeVisible({ timeout: 90_000 });
      const text = (await result.textContent()) ?? '';
      docId = /Belge kimliği:\s*(\S+)/.exec(text)?.[1] ?? '';
      expect(docId).not.toBe('');
      await expect(page.getByTestId('k6-list')).toContainText(title);
      await page.screenshot({ path: `${SHOTS}/06-upload-success-tr.png`, fullPage: true });

      const rows = await prisma.$queryRaw<{ chunks: bigint; embedded: bigint; tenantless: bigint }[]>`
        SELECT count(*) AS chunks,
               count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
               count(*) FILTER (WHERE "tenantId" IS NULL) AS tenantless
        FROM "Chunk" WHERE "documentId" = ${docId}`;
      const counted = rows[0]!;
      console.log(`[K6 live] docId=${docId} chunks=${counted.chunks} embedded=${counted.embedded} tenantless=${counted.tenantless}`);
      expect(Number(counted.chunks)).toBeGreaterThan(0);
      expect(counted.embedded).toBe(counted.chunks);
      expect(counted.tenantless).toBe(counted.chunks);
      await expect(result).toContainText(`${Number(counted.chunks)} parça kaydedildi`);

      // Same kind + title again: refused with 409 before any embedding, and explained.
      await page.goto('/en/admin/documents');
      await page.getByTestId('k6-file').setInputFiles({ name: 'k6-probe.pdf', mimeType: 'application/pdf', buffer: pdf });
      await page.getByTestId('k6-title').fill(title);
      await page.getByTestId('k6-submit').click();
      await expect(page.getByTestId('k6-error')).toContainText('A document with this type and title already exists.');
      await expect(page.getByTestId('k6-upload-anyway')).toBeVisible();
      expect(await prisma.document.count({ where: { tenantId: null, title } })).toBe(1);
      await page.screenshot({ path: `${SHOTS}/07-duplicate-warning-en.png`, fullPage: true });
    } finally {
      // One id, and only when there is one: an empty id must never become a broad delete.
      if (docId) {
        await prisma.document.delete({ where: { id: docId } });
        const left = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Chunk" WHERE "documentId" = ${docId}`;
        console.log(`[K6 live] cleanup docId=${docId} remainingChunks=${left[0]!.n}`);
      }
    }
  });
});
