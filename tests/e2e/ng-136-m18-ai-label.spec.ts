import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-136 (M18-F5) — the eligibility pre-report on the lead detail screen, tr and en:
 *  - the section and every report carry the "internal pre-assessment — not an official score" label;
 *  - a DRAFT is approved by a real click (DRAFT → APPROVED), the label stays.
 *
 * No AI call: the report rows are seeded (PATRON KURALI 15.11.2026 — no provider is ever reached).
 * The "generate" and "enrich" buttons are only checked for presence, never clicked.
 */
const TENANT = 'ng136-e2e-tenant';
const WORKSPACE_ID = 'ng136-e2e-workspace';
const WS = 'ng136-e2e';
const USER_ID = 'ng136-e2e-owner';
const EMAIL = 'ng136-e2e-owner@e2e.fabrika.test';
const ORG_ID = 'ng136-e2e-org';
const CALL_ID = 'ng136-e2e-call';
const CALL_IDENTIFIER = 'NG136-E2E-DIGITAL-SME';
const SHOTS = shotsDir('NG-136');

const REPORT_TEXT: Record<'tr' | 'en', string> = {
  tr: '### Özet\nKurum KOBİ olarak çağrının başvuru sahibi türüne uyuyor görünüyor.\n\n### Eksik bilgiler\n- Eş finansman oranı kayıtlı değil.',
  en: '### Summary\nThe organisation appears to fit the applicant type as an SME.\n\n### Missing information\n- Co-financing rate not recorded.',
};

async function seed() {
  await prisma.leadEligibilityReport.deleteMany({ where: { tenantId: TENANT } });
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: { id: TENANT, name: 'NG-136 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'CONSULTANCY' },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'NG-136 e2e', slug: WS },
    update: { slug: WS },
  });
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: EMAIL, name: 'NG-136 E2E Owner', locale: 'tr' },
    update: { email: EMAIL },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: TENANT, userId: USER_ID } },
    create: { tenantId: TENANT, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    update: { role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
  });
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M18' } },
    create: { tenantId: TENANT, moduleId: 'M18', status: 'PILOT', changedBy: 'ng136 e2e' },
    update: { status: 'PILOT' },
  });
  await prisma.leadOrganization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, tenantId: TENANT, name: 'Acme Teknoloji (NG-136 e2e)', orgType: 'SME', provinceCode: '06', website: 'https://acme.example.com.tr' },
    update: { deletedAt: null },
  });
  const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
  await prisma.call.upsert({
    where: { id: CALL_ID },
    create: { id: CALL_ID, programmeId: programme.id, callIdentifier: CALL_IDENTIFIER, title: 'Digital SMEs (NG-136 e2e)', eligibleApplicantTypes: ['SME'] },
    update: {},
  });
  await prisma.leadMatch.upsert({
    where: { tenantId_organizationId_callId: { tenantId: TENANT, organizationId: ORG_ID, callId: CALL_ID } },
    create: { tenantId: TENANT, organizationId: ORG_ID, callId: CALL_ID },
    update: { deletedAt: null },
  });
}

async function seedDraft(locale: 'tr' | 'en') {
  await prisma.leadEligibilityReport.deleteMany({ where: { tenantId: TENANT } });
  await prisma.leadEligibilityReport.create({
    data: { tenantId: TENANT, organizationId: ORG_ID, callId: CALL_ID, content: REPORT_TEXT[locale], locale, model: 'stub (e2e seed)', createdByUserId: USER_ID },
  });
}

async function signIn(page: Page) {
  await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' });
}

test.describe.configure({ mode: 'serial' });

test.describe('NG-136 M18 iç ön değerlendirme etiketi — gerçek tıklama', () => {
  test.beforeAll(seed);
  test.afterAll(async () => {
    await prisma.leadEligibilityReport.deleteMany({ where: { tenantId: TENANT } });
    await prisma.$disconnect();
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`${locale}: label on the section and on the report; DRAFT → APPROVED by click`, async ({ page }) => {
      const m = (locale === 'tr' ? trMessages : enMessages).m18.ai;
      await seedDraft(locale);
      await signIn(page);
      await page.goto(`/${locale}/${WS}/musteri-hatti/leads/${ORG_ID}`);

      await expect(page.getByRole('heading', { name: m.eligibilityHeading })).toBeVisible();
      await expect(page.getByRole('button', { name: m.enrichRun })).toBeVisible();
      await expect(page.getByRole('button', { name: m.eligibilityRun })).toBeVisible();

      const report = page.getByTestId('eligibility-report');
      await expect(report).toHaveCount(1);
      await expect(report).toContainText(CALL_IDENTIFIER);
      await expect(report).toContainText(m.status.DRAFT);
      // Section label + the report's own label, same text.
      const labels = page.getByTestId('pre-assessment-label');
      await expect(labels).toHaveCount(2);
      for (const l of await labels.all()) await expect(l).toHaveText(m.label);
      await report.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `ng136-${locale}-01-draft-label.png`), fullPage: true });

      await report.getByRole('button', { name: m.approve }).click();
      await expect(report).toContainText(m.status.APPROVED);
      await expect(report.getByRole('button', { name: m.approve })).toHaveCount(0);
      await expect(report.getByTestId('pre-assessment-label')).toHaveText(m.label);
      const row = await prisma.leadEligibilityReport.findFirstOrThrow({ where: { tenantId: TENANT }, select: { status: true, approvedByUserId: true } });
      expect(row).toEqual({ status: 'APPROVED', approvedByUserId: USER_ID });
      await page.screenshot({ path: path.join(SHOTS, `ng136-${locale}-02-approved-label.png`), fullPage: true });
    });
  }
});
