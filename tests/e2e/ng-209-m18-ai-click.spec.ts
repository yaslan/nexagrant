import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { AI_ACTION_CREDITS } from '../../src/lib/billing/catalog';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-209 (NG-133 rings 4 and 5) — the M18 AI buttons clicked for real, end to end:
 *   click → site read → "provider" → credit reserved → AiUsageLog row → result on screen.
 *
 * No model and no outside network is ever reached: the web server runs with E2E_FAKE_AI=true
 * (playwright.config.ts). src/lib/llm.ts then answers from its fake provider (no fetch, no key) and
 * the website reader reads an in-process fake site (no DNS, no socket) through its unchanged guards.
 * The guard below stops this spec before any click if the flag is not on, so a run without the seam
 * cannot send an organisation's website address to a real resolver.
 */
const TENANT = 'ng209-e2e-tenant';
const WORKSPACE_ID = 'ng209-e2e-workspace';
const WS = 'ng209-e2e';
const USER_ID = 'ng209-e2e-owner';
const EMAIL = 'ng209-e2e-owner@e2e.fabrika.test';
const ORG_ID = 'ng209-e2e-org';
const CALL_ID = 'ng209-e2e-call';
const CALL_IDENTIFIER = 'NG209-E2E-DIGITAL-SME';
const WEBSITE = 'https://acme-ng209.com.tr';
const START_BALANCE = 10;
const SHOTS = shotsDir('NG-209');

const ENRICH_PRICE = AI_ACTION_CREDITS['M18:enrich-organization']!.credits;
const ELIGIBILITY_PRICE = AI_ACTION_CREDITS['M18:eligibility-pre-report']!.credits;

async function seed() {
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: { id: TENANT, name: 'NG-209 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'CONSULTANCY' },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'NG-209 e2e', slug: WS },
    update: { slug: WS },
  });
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: EMAIL, name: 'NG-209 E2E Owner', locale: 'tr' },
    update: { email: EMAIL },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: TENANT, userId: USER_ID } },
    create: { tenantId: TENANT, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    update: { role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
  });
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M18' } },
    create: { tenantId: TENANT, moduleId: 'M18', status: 'PILOT', changedBy: 'ng209 e2e' },
    update: { status: 'PILOT' },
  });
  const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
  await prisma.call.upsert({
    where: { id: CALL_ID },
    create: { id: CALL_ID, programmeId: programme.id, callIdentifier: CALL_IDENTIFIER, title: 'Digital SMEs (NG-209 e2e)', eligibleApplicantTypes: ['SME'] },
    update: {},
  });
}

/** Every run of a test starts from the same organisation, no reports, no AI rows, and `balance` credits. */
async function reset(balance: number) {
  await prisma.leadEligibilityReport.deleteMany({ where: { tenantId: TENANT } });
  await prisma.aiUsageLog.deleteMany({ where: { tenantId: TENANT } });
  await prisma.creditLedger.deleteMany({ where: { tenantId: TENANT } });
  if (balance > 0) await prisma.creditLedger.create({ data: { tenantId: TENANT, delta: balance, reason: 'purchase', refId: 'ng209-e2e-grant' } });
  await prisma.leadOrganization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, tenantId: TENANT, name: 'Acme Teknoloji (NG-209 e2e)', orgType: 'SME', provinceCode: '06', website: WEBSITE },
    update: { deletedAt: null, website: WEBSITE, legalName: null, district: null, sizeBand: null, themes: [], sectorCodes: [] },
  });
  await prisma.leadMatch.upsert({
    where: { tenantId_organizationId_callId: { tenantId: TENANT, organizationId: ORG_ID, callId: CALL_ID } },
    create: { tenantId: TENANT, organizationId: ORG_ID, callId: CALL_ID },
    update: { deletedAt: null },
  });
}

async function balance(): Promise<number> {
  const r = await prisma.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

async function usageRows() {
  return prisma.aiUsageLog.findMany({
    where: { tenantId: TENANT },
    orderBy: { createdAt: 'asc' },
    select: { module: true, purpose: true, provider: true, credits: true, userId: true },
  });
}

async function openLead(page: Page, locale: 'tr' | 'en') {
  await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' });
  await page.goto(`/${locale}/${WS}/musteri-hatti/leads/${ORG_ID}`);
}

test.describe.configure({ mode: 'serial' });

test.describe('NG-209 M18 YZ butonları — gerçek tıklama, sahte sağlayıcı', () => {
  test.beforeAll(async () => {
    // No seam, no click: without it the enrichment click would look the website up for real.
    expect(process.env.E2E_FAKE_AI, 'the e2e web server must run with E2E_FAKE_AI=true (playwright.config.ts)').toBe('true');
    await seed();
  });
  test.afterAll(async () => {
    await prisma.leadEligibilityReport.deleteMany({ where: { tenantId: TENANT } });
    await prisma.aiUsageLog.deleteMany({ where: { tenantId: TENANT } });
    await prisma.creditLedger.deleteMany({ where: { tenantId: TENANT } });
    await prisma.$disconnect();
  });

  for (const locale of ['tr', 'en'] as const) {
    const m = (locale === 'tr' ? trMessages : enMessages).m18.ai;

    test(`${locale}: "${m.enrichRun}" click → proposal on screen with the AI-draft label, one AiUsageLog row, balance −${ENRICH_PRICE}`, async ({ page }) => {
      await reset(START_BALANCE);
      await openLead(page, locale);

      await page.getByRole('button', { name: m.enrichRun }).click();

      const proposal = page.getByTestId('enrichment-proposal');
      await expect(proposal).toBeVisible();
      await expect(proposal.getByTestId('ai-draft-label')).toHaveText(m.enrichDraftLabel);
      await expect(proposal).toContainText('Acme Teknoloji A.Ş. (E2E_FAKE_AI)');
      await expect(proposal).toContainText(`${m.enrichSources}: ${WEBSITE}/`);
      await page.screenshot({ path: path.join(SHOTS, `ng209-${locale}-01-enrich-proposal.png`), fullPage: true });

      expect(await usageRows()).toEqual([
        { module: 'M18', purpose: 'enrich-organization-attempt', provider: 'fake', credits: 0, userId: USER_ID },
      ]);
      expect(await balance()).toBe(START_BALANCE - ENRICH_PRICE);
      // Nothing is written to the record before the user ticks and applies.
      const org = await prisma.leadOrganization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { legalName: true } });
      expect(org.legalName).toBeNull();
    });

    test(`${locale}: "${m.eligibilityRun}" click → a DRAFT made by the click, then APPROVE`, async ({ page }) => {
      await reset(START_BALANCE);
      await openLead(page, locale);

      const reports = page.getByTestId('eligibility-report');
      await expect(reports).toHaveCount(0);
      await page.getByRole('button', { name: m.eligibilityRun }).click();
      await expect(page.getByRole('status').filter({ hasText: m.eligibilityCreated })).toBeVisible();

      await expect(reports).toHaveCount(1);
      const report = reports.first();
      await expect(report).toContainText(CALL_IDENTIFIER);
      await expect(report).toContainText(m.status.DRAFT);
      await expect(report).toContainText('E2E_FAKE_AI');
      await expect(report.getByTestId('pre-assessment-label')).toHaveText(m.label);

      const draft = await prisma.leadEligibilityReport.findFirstOrThrow({
        where: { tenantId: TENANT },
        select: { status: true, model: true, locale: true, createdByUserId: true, callId: true },
      });
      // Made by the click through the fake provider, not seeded.
      expect(draft).toEqual({ status: 'DRAFT', model: 'fake-e2e', locale, createdByUserId: USER_ID, callId: CALL_ID });
      expect(await usageRows()).toEqual([
        { module: 'M18', purpose: 'eligibility-pre-report-attempt', provider: 'fake', credits: 0, userId: USER_ID },
      ]);
      expect(await balance()).toBe(START_BALANCE - ELIGIBILITY_PRICE);
      await report.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `ng209-${locale}-02-eligibility-draft.png`), fullPage: true });

      await report.getByRole('button', { name: m.approve }).click();
      await expect(report).toContainText(m.status.APPROVED);
      await expect(report.getByRole('button', { name: m.approve })).toHaveCount(0);
      const row = await prisma.leadEligibilityReport.findFirstOrThrow({ where: { tenantId: TENANT }, select: { status: true, approvedByUserId: true } });
      expect(row).toEqual({ status: 'APPROVED', approvedByUserId: USER_ID });
      await page.screenshot({ path: path.join(SHOTS, `ng209-${locale}-03-eligibility-approved.png`), fullPage: true });
    });

    test(`${locale}: balance 0 → NO_CREDITS on both buttons, no provider call, no credit moved`, async ({ page }) => {
      await reset(0);
      await openLead(page, locale);

      await page.getByRole('button', { name: m.enrichRun }).click();
      await expect(page.getByRole('alert').filter({ hasText: m.errors.NO_CREDITS })).toBeVisible();
      await expect(page.getByTestId('enrichment-proposal')).toHaveCount(0);

      await page.getByRole('button', { name: m.eligibilityRun }).click();
      await expect(page.getByRole('alert').filter({ hasText: m.errors.NO_CREDITS })).toHaveCount(2);
      await expect(page.getByTestId('eligibility-report')).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOTS, `ng209-${locale}-04-no-credits.png`), fullPage: true });

      // Every provider call writes an AiUsageLog row (llm.ts): none means none was made.
      expect(await usageRows()).toEqual([]);
      expect(await prisma.creditLedger.count({ where: { tenantId: TENANT } })).toBe(0);
      expect(await balance()).toBe(0);
      expect(await prisma.leadEligibilityReport.count({ where: { tenantId: TENANT } })).toBe(0);
    });
  }
});
