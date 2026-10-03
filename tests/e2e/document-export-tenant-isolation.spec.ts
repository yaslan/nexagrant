import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { test, expect, type Page } from '@playwright/test';
import unzipper from 'unzipper';

import { PRODUCT_NAME } from '../../src/lib/brand';
import { prisma } from '../../src/lib/db';
import { DOC_E2E, seed, rollback } from '../../scripts/seed-doc-export-e2e';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

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
 *
 * TASK-MTSHTIYJWTQKO extends it with what the served bytes actually SAY: the download is a
 * real Office Open XML package (it used to be bare `word/document.xml` under a `.docx` name,
 * which no zip tool could open), its letterhead is the tenant's own organisation rather than
 * a fixed `EUROPEAN COMMISSION - HORIZON EUROPE` badge, and its document reference is the
 * stored part id rather than a fresh `doc-export-<epoch>` per download.
 */

const SHOTS = shotsDir('TASK-MTS9VGEKE8N3B-screenshots');

/** The reference the route used to mint per download: `doc-export-` + epoch milliseconds. */
const MINTED_REF = /doc-export-\d{10,}/;

const APPLICATION_URL = `/tr/${DOC_E2E.workspaceSlug}/opportunities/${DOC_E2E.opportunityId}/application`;

/** The readable text of a .docx — proof, at the same time, that the file is a real zip. */
async function docxText(path: string): Promise<string> {
  const archive = await unzipper.Open.buffer(readFileSync(path));
  const document = archive.files.find((f) => f.path === 'word/document.xml');
  expect(document, `${path} is not an OOXML package: no word/document.xml`).toBeTruthy();
  return (await document!.buffer()).toString('utf-8');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * The document's paragraphs, each as the plain text of its runs — the LINES a reader sees.
 *
 * A label and its value are two separate `w:r` runs of one `w:p`, so `docxText().toContain(x)`
 * cannot tell "the organisation field holds x" from "x appears somewhere in the file". These
 * tests need the difference: TASK-MTVT0VLF4AP19 found the file asserting `not.toContain('FonBridge')`
 * over the whole document, which the product's own name in the provenance sentence satisfied —
 * a red that said nothing about whether the organisation field was right (it was).
 */
async function docxParagraphs(path: string): Promise<string[]> {
  const xml = await docxText(path);
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(([, body]) => {
    if (body === undefined) return '';
    return [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map(([, run]) => (run === undefined ? '' : unescapeXml(run)))
      .join('');
  });
}

/** The Turkish labels the DOCX prints its identity fields under, at `locale=tr`. */
const DOCX_IDENTITY_LABELS = ['Kuruluş', 'Proje Başlığı', 'Doküman Ref'] as const;

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

  /**
   * Signs in as `email` and lands on `target`; `waitForURL` is the proof the session is real.
   * The session is a minted cookie for a user `seed()` wrote (TENANT_OWNER of its own
   * tenant, scripts/seed-doc-export-e2e.ts), not the demo sign-in form, so the spec runs
   * against `next start` too (TASK-MUSBCXP9RKS3D). The seed owns User + Membership and
   * `rollback` removes them; the session fixture only adds the cookie.
   */
  async function signIn(page: Page, email: string, target: string) {
    const seat = [
      { id: DOC_E2E.userId, email: DOC_E2E.email, tenantId: DOC_E2E.tenantId },
      { id: DOC_E2E.otherUserId, email: DOC_E2E.otherEmail, tenantId: DOC_E2E.otherTenantId },
    ].find((t) => t.email === email);
    if (!seat) throw new Error(`no doc-export fixture user with e-mail ${email}`);
    await signInAs(page, { ...seat, role: 'TENANT_OWNER' });
    await page.goto(target);
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

  test('tenant A clicks "Resmî DOCX İndir" and every identity field is its OWN, not an invented organisation', async ({
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
    const text = await docxText(saved);

    // What the tenant actually owns.
    expect(text).toContain(DOC_E2E.tenantName);
    expect(text).toContain(DOC_E2E.opportunityTitle);
    expect(text).toContain(DOC_E2E.sectionText);

    // Each identity field EQUALS the tenant's stored row — `toContain` over the whole file
    // would still pass on a letterhead reading "FonBridge Teknoloji A.Ş. / Doc Export E2E
    // Kiracı A", which is the exact defect this test exists for.
    const paragraphs = await docxParagraphs(saved);
    const field = (label: string) => paragraphs.find((p) => p.startsWith(`${label}: `));
    expect(field('Kuruluş')).toBe(`Kuruluş: ${DOC_E2E.tenantName}`);
    expect(field('Proje Başlığı')).toBe(`Proje Başlığı: ${DOC_E2E.opportunityTitle}`);
    expect(field('Doküman Ref')).toBe(`Doküman Ref: ${DOC_E2E.partId}`);

    // The PRODUCT's name is not an IDENTITY. It belongs in the provenance sentence that says
    // who prepared the draft and where; it may never stand in a field that names the
    // applicant, the call or the document. Read from `src/lib/brand.ts` rather than re-typed:
    // this assertion used to be a literal `not.toContain('FonBridge')` over the whole file, so
    // when 9af3f63 restored `PRODUCT_NAME = 'FonBridge'` the provenance sentence tripped it and
    // the suite went red over a document that was entirely correct (TASK-MTVT0VLF4AP19).
    for (const label of DOCX_IDENTITY_LABELS) {
      expect(field(label), `${label} must not be the product's name`).not.toContain(PRODUCT_NAME);
    }
    const provenance = paragraphs.find((p) => p.includes('resmî bir belge DEĞİLDİR'));
    expect(provenance, 'the provenance notice must be on the document').toBeTruthy();
    expect(provenance).toContain(`${DOC_E2E.tenantName} tarafından ${PRODUCT_NAME}`);

    // The organisation the route used to stamp on every tenant's document. Spelled out, not
    // derived from PRODUCT_NAME: a future rename does not retire this string — it stays a
    // fixture organisation nobody's document may carry.
    expect(text).not.toContain('FonBridge Teknoloji');
    expect(text).not.toContain('HORIZON-CL5-2026-D3-01');
    // And nothing of tenant B's — neither its prose nor its name.
    expect(text).not.toContain(DOC_E2E.otherSectionText);
    expect(text).not.toContain(DOC_E2E.otherTenantName);

    // The bytes really are an OOXML package — `docxText` above would have thrown otherwise —
    // and the file starts with the ZIP magic instead of `<?xml`.
    expect(readFileSync(saved).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    // No funding body issued this: the letterhead is the tenant, and the notice says so.
    expect(text).not.toContain('EUROPEAN COMMISSION');
    expect(text).not.toContain('HORIZON EUROPE');
    expect(text).toContain('resmî bir belge DEĞİLDİR');

    // The reference identifies the DOCUMENT, so a second download of the same part carries
    // the same one. It used to be `doc-export-${Date.now()}` — different every time.
    expect(text).toContain(DOC_E2E.partId);
    // The minted reference was `doc-export-<epoch millis>`; the fixture's own part id happens
    // to start `doc-export-e2e-`, so the epoch shape is what is asserted against.
    expect(text).not.toMatch(MINTED_REF);

    const second = await page.request.get(exportUrl(DOC_E2E.partId));
    expect(second.status()).toBe(200);
    const secondPath = `${SHOTS}/10-tenant-a-export-again.docx`;
    writeFileSync(secondPath, Buffer.from(await second.body()));
    expect(await docxText(secondPath)).toContain(DOC_E2E.partId);
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
    // The body used to open with "OFFICIAL APPLICATION DOCUMENT … produced in line with the
    // official Horizon Europe … standards" on a document nobody official had seen.
    // The product's name is read from `src/lib/brand.ts`, not re-typed: this line held the
    // literal `… produced in Fabrika` and went red the day 9af3f63 renamed the product back
    // to FonBridge, over a document that said exactly what it should (TASK-MTVT0VLF4AP19).
    expect(en).toContain(`This document is a draft produced in ${PRODUCT_NAME}`);
    expect(en).toContain('Parties and rights');
    expect(en).not.toContain('OFFICIAL APPLICATION DOCUMENT');
    expect(en).not.toContain('kuruluşun kendi başvuru çalışması');

    const tr = await (await page.request.get(printUrl('tr'))).text();
    writeFileSync(`${SHOTS}/07-nda-print-tr.html`, tr);
    expect(tr).toContain('kuruluşun kendi başvuru çalışması');
    expect(tr).not.toContain('RESMÎ BAŞVURU DOKÜMANI');
    expect(tr).not.toContain('Parties and rights');

    for (const body of [en, tr]) {
      // The applicant organisation is this tenant's stored name, not a fixture.
      expect(body).toContain(DOC_E2E.tenantName);
      expect(body).not.toContain('FonBridge Teknoloji');
      expect(body).not.toContain('HORIZON-CL5-2026-D3-01');

      // The letterhead is that same stored organisation, and no funding body's badge.
      expect(body).toContain(`<div class="logo-badge">${DOC_E2E.tenantName}</div>`);
      expect(body).not.toContain('EUROPEAN COMMISSION');
      expect(body).not.toContain('TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ');

      // This print URL names no stored document, so it gets no reference at all rather
      // than a minted one.
      expect(body).not.toMatch(MINTED_REF);
    }

    expect(en).toContain('No document reference recorded');
    expect(tr).toContain('Kayıtlı bir doküman referansı yok');
    // The header date is the date of THIS export, and is labelled as such.
    expect(en).toContain('Exported on:');
    expect(tr).toContain('Dışa aktarma tarihi:');

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
