import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { DOC_E2E, seed, rollback } from '../../scripts/seed-doc-export-e2e';

/**
 * TASK-MTS9VGEKE8N3B — `/api/documents/export`, in a real browser and over real HTTP.
 *
 * The route used to have no `auth()` and no tenant filter: an anonymous `curl`
 * got 200, and `partId` went into `applicationPart.findUnique({ where: { id } })`,
 * so another tenant's Part B came back as a Word file. It also stamped a fixed
 * `FonBridge Teknoloji A.Ş.` as the applicant organisation onto every download.
 *
 * Four things are measured here, all of them through HTTP the product itself
 * serves:
 *   1. signed out            → 401, and no part content in the body
 *   2. tenant A, real click  → 200, A's OWN organisation and section text
 *   3. tenant A asks for B's partId → 404, B's marker string absent
 *   4. tenant B asks for A's partId → 404 (the mirror measurement: one
 *      direction can pass by accident, both cannot)
 */

const SHOTS = 'docs/agent-results/TASK-MTS9VGEKE8N3B-screenshots';

const APPLICATION_URL = `/tr/${DOC_E2E.workspaceSlug}/opportunities/${DOC_E2E.opportunityId}/application`;

const exportUrl = (partId: string) =>
  `/api/documents/export?type=PART_B&format=docx&partId=${partId}&title=Part_B_Technical_Proposal&locale=tr`;

test.describe.configure({ mode: 'serial' });

test.describe('Document export — session required, tenant scoped, no invented organisation', () => {
  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.DOC_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // The cookie banner is a full-screen alertdialog and swallows clicks.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
  });

  /** Signs in as `email` and lands on `target`; `waitForURL` is the proof the session is real. */
  async function signIn(page: Page, email: string, target: string) {
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${target}`, { timeout: 60_000 });
  }

  test('signed out: the export refuses with 401 and hands over no content', async ({ page }) => {
    // No sign-in in this test — the context is fresh, so this is the anonymous
    // request the old route answered with 200 and a Word file.
    const res = await page.request.get(exportUrl(DOC_E2E.partId));
    const body = await res.text();

    expect(res.status(), 'anonymous export must be refused').toBe(401);
    expect(body).not.toContain(DOC_E2E.sectionText);
    expect(body).not.toContain('FonBridge Teknoloji');

    // The same URL typed into the address bar, for the screenshot.
    await page.goto(exportUrl(DOC_E2E.partId));
    await page.screenshot({ path: `${SHOTS}/01-anonymous-401.png`, fullPage: true });
  });

  test('tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge', async ({
    page,
  }) => {
    await signIn(page, DOC_E2E.email, APPLICATION_URL);
    await page.screenshot({ path: `${SHOTS}/02-tenant-a-partb-editor.png`, fullPage: true });

    const link = page.getByRole('link', { name: 'Resmî DOCX İndir' });
    await expect(link).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      link.click(),
    ]);
    const saved = `${SHOTS}/03-tenant-a-export.docx`;
    await download.saveAs(saved);
    const text = readFileSync(saved, 'utf-8');

    // What the tenant actually owns.
    expect(text).toContain(DOC_E2E.tenantName);
    expect(text).toContain(DOC_E2E.opportunityTitle);
    expect(text).toContain(DOC_E2E.sectionText);

    // What used to be printed on every tenant's document.
    expect(text).not.toContain('FonBridge');
    expect(text).not.toContain('HORIZON-CL5-2026-D3-01');
    // And nothing of tenant B's.
    expect(text).not.toContain(DOC_E2E.otherSectionText);
  });

  test('tenant A asking for tenant B’s partId gets 404 and none of B’s text', async ({ page }) => {
    // Asserted, not assumed: a 404 over a row that does not exist would prove nothing.
    const b = await prisma.applicationPart.findUnique({
      where: { id: DOC_E2E.otherPartId },
      select: { tenantId: true },
    });
    expect(b, 'tenant B fixture must exist for this test to mean anything').not.toBeNull();
    expect(b!.tenantId).toBe(DOC_E2E.otherTenantId);

    await signIn(page, DOC_E2E.email, APPLICATION_URL);

    const res = await page.request.get(exportUrl(DOC_E2E.otherPartId));
    const body = await res.text();

    expect(res.status(), 'cross-tenant partId must not be served').toBe(404);
    expect(body).not.toContain(DOC_E2E.otherSectionText);
    expect(body).not.toContain(DOC_E2E.otherTenantName);

    await page.goto(exportUrl(DOC_E2E.otherPartId));
    await page.screenshot({ path: `${SHOTS}/04-tenant-a-asks-b-404.png`, fullPage: true });
  });

  test('tenant B asking for tenant A’s partId gets 404 as well', async ({ page }) => {
    const otherApplicationUrl = `/tr/${DOC_E2E.otherWorkspaceSlug}/opportunities/${DOC_E2E.otherOpportunityId}/application`;
    await signIn(page, DOC_E2E.otherEmail, otherApplicationUrl);

    const res = await page.request.get(exportUrl(DOC_E2E.partId));
    const body = await res.text();

    expect(res.status(), 'the mirror direction must be refused too').toBe(404);
    expect(body).not.toContain(DOC_E2E.sectionText);
    expect(body).not.toContain(DOC_E2E.tenantName);

    await page.goto(exportUrl(DOC_E2E.partId));
    await page.screenshot({ path: `${SHOTS}/05-tenant-b-asks-a-404.png`, fullPage: true });
  });
  test('the printable document follows the session language and states nothing was signed', async ({
    page,
  }) => {
    await signIn(page, DOC_E2E.email, APPLICATION_URL);

    // `type=NDA` carries no sections, so this is the boilerplate body that used
    // to be a Turkish template literal inside the route handler (rule 8).
    const printUrl = (locale: string) =>
      `/api/documents/export?type=NDA&format=pdf&opportunityId=${DOC_E2E.opportunityId}&locale=${locale}`;

    const en = await (await page.request.get(printUrl('en'))).text();
    writeFileSync(`${SHOTS}/06-nda-print-en.html`, en);
    expect(en).toContain('OFFICIAL APPLICATION DOCUMENT');
    expect(en).toContain('Parties and rights');
    expect(en).not.toContain('İşbu doküman');

    const tr = await (await page.request.get(printUrl('tr'))).text();
    writeFileSync(`${SHOTS}/07-nda-print-tr.html`, tr);
    expect(tr).toContain('İşbu doküman');
    expect(tr).not.toContain('Parties and rights');

    for (const body of [en, tr]) {
      // The applicant organisation is this tenant's stored name, not a fixture.
      expect(body).toContain(DOC_E2E.tenantName);
      expect(body).not.toContain('FonBridge Teknoloji');
      expect(body).not.toContain('HORIZON-CL5-2026-D3-01');
    }

    // The whole printable page follows the language, not just the body: the meta
    // table headings, the print button and the footer used to stay Turkish while
    // the body was English.
    expect(en).toContain('Applicant organisation');
    expect(en).toContain('Project / call name');
    expect(en).not.toContain('Başvuran Kuruluş');
    expect(en).not.toContain('Proje / Çağrı Adı');
    expect(tr).toContain('Başvuran Kuruluş');

    // Nobody signed anything by downloading a file: with no signatory record the
    // status line says so, in each language.
    expect(en).toContain('No signatory assigned');
    expect(tr).toContain('İmzalayan atanmadı');
    expect(en).not.toContain('Digitally signed');
    expect(tr).not.toContain('Dijital İmzalandı');

    await page.goto(printUrl('en'));
    await page.screenshot({ path: `${SHOTS}/08-nda-print-en.png`, fullPage: true });
    await page.goto(printUrl('tr'));
    await page.screenshot({ path: `${SHOTS}/09-nda-print-tr.png`, fullPage: true });
  });
});
