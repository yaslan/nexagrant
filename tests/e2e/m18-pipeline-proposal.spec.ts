import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { formatMoney } from '../../src/lib/money';
import { STAGE_ORDER } from '../../src/modules/m18/server/pipeline-rules';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-210 (NG-133 ring 6b) — the forward path of the M18 pipeline, by real clicks.
 *
 * `m18-client-pipeline.spec.ts` only walks NEW → QUALIFIED → CONTACTED → LOST. Here a deal goes
 * NEW → … → PROPOSAL one `<select>` change at a time, each stage proven on screen (column
 * heading count + the select value) and in the DB, and the refusal branch proves that skipping a
 * stage (`SKIPS_STAGES`, surfaced as the TRANSITION notice) changes nothing.
 *
 * Own tenant (own rows, never the shared M18 tenant). The only money on these screens is the
 * deal's estimated fee (`estimatedFeeCents` + `currency`); it is asserted in minor units and as
 * rendered. There is no quote-total screen to cover (see the card report).
 */
const TENANT = 'm18p-e2e-tenant';
const WORKSPACE_ID = 'm18p-e2e-workspace';
const WS = 'm18p-e2e';
const USER_ID = 'm18p-e2e-owner';
const EMAIL = 'm18p-e2e-owner@e2e.fabrika.test';
const SHOTS = shotsDir('NG-210');
const RUN = Date.now().toString(36);
/** Stages walked, in order: everything on the forward path up to and including PROPOSAL. */
const PATH_TO_PROPOSAL = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf('PROPOSAL') + 1);

async function signIn(page: Page) {
  await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' });
}

test.describe.configure({ mode: 'serial' });

test.describe('M18 NEW → PROPOSAL — gerçek tıklama', () => {
  test.beforeAll(async () => {
    await prisma.dealTask.deleteMany({ where: { tenantId: TENANT } });
    await prisma.dealActivity.deleteMany({ where: { tenantId: TENANT } });
    await prisma.deal.deleteMany({ where: { tenantId: TENANT } });
    await prisma.leadContact.deleteMany({ where: { tenantId: TENANT } });
    await prisma.leadOrganization.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'M18 proposal e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.workspace.upsert({
      where: { id: WORKSPACE_ID },
      create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'M18 proposal e2e', slug: WS },
      update: { slug: WS },
    });
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: EMAIL, name: 'M18P E2E Owner', locale: 'tr' },
      update: { email: EMAIL },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT, userId: USER_ID } },
      create: { tenantId: TENANT, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
      update: { role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    });
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M18' } },
      create: { tenantId: TENANT, moduleId: 'M18', status: 'PILOT', changedBy: 'm18 proposal e2e' },
      update: { status: 'PILOT' },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`${locale}: NEW → PROPOSAL one step at a time, a skip is refused`, async ({ page }) => {
      const m = (locale === 'tr' ? trMessages : enMessages).m18;
      const orgName = `M18P ${locale} Org ${RUN}`;
      const dealTitle = `M18P ${locale} Deal ${RUN}`;
      const fee = locale === 'tr' ? '1500,00' : '1500.00';
      const shot = (n: string) => path.join(SHOTS, `m18p-${locale}-${n}.png`);
      await signIn(page);
      const base = `/${locale}/${WS}/musteri-hatti`;

      // Open a deal through the real form (fee 1500 EUR → 150000 minor units).
      const org = await prisma.leadOrganization.create({ data: { tenantId: TENANT, name: orgName } });
      await page.goto(`${base}/leads/${org.id}`);
      const dealForm = page.getByRole('form', { name: m.deal.heading });
      await dealForm.getByLabel(m.deal.titleLabel).fill(dealTitle);
      await dealForm.getByLabel(m.deal.feeLabel).fill(fee);
      await dealForm.getByRole('button', { name: m.deal.submit }).click();
      await expect(page.getByRole('status')).toContainText(m.deal.created);
      const deal = await prisma.deal.findFirstOrThrow({ where: { tenantId: TENANT, title: dealTitle } });
      expect(deal.stage).toBe('NEW');
      expect(deal.estimatedFeeCents).toBe(150000);
      expect(deal.currency).toBe('EUR');

      await page.goto(`${base}/pipeline`);
      const card = page
        .locator('li')
        .filter({ has: page.getByRole('link', { name: dealTitle }) })
        .filter({ hasNot: page.locator('li') });
      // The column of `stage` that holds this deal; the count in the heading is free because the
      // other locale's deal (same tenant) may sit in the same column.
      const column = (stage: string) =>
        page
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: new RegExp(`^${m.stage[stage as keyof typeof m.stage]} \\(\\d+\\)$`) }) })
          .filter({ has: page.getByRole('link', { name: dealTitle }) });
      const notice = page.locator('[aria-live="polite"]');
      await expect(column('NEW')).toContainText(dealTitle);

      // Negative first, from NEW: NEW → PROPOSAL skips four stages.
      await card.getByLabel(m.pipeline.moveLabel).selectOption('PROPOSAL');
      await expect(notice.getByText(m.errors.TRANSITION, { exact: true })).toBeVisible();
      await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('NEW');
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage).toBe('NEW');
      await page.screenshot({ path: shot('01-skip-refused'), fullPage: true, caret: 'initial' });

      // Forward, one step at a time, each stage proven on screen and in the DB.
      for (const stage of PATH_TO_PROPOSAL.slice(1)) {
        await card.getByLabel(m.pipeline.moveLabel).selectOption(stage);
        await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue(stage);
        await expect(column(stage)).toContainText(dealTitle);
        await expect(notice.getByText(m.pipeline.moved, { exact: true })).toBeVisible();
        await expect
          .poll(async () => (await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage)
          .toBe(stage);
      }

      // At PROPOSAL: backwards skip is refused too, and the refusal changes nothing.
      await card.getByLabel(m.pipeline.moveLabel).selectOption('CONTACTED');
      await expect(notice.getByText(m.errors.TRANSITION, { exact: true })).toBeVisible();
      await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('PROPOSAL');
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage).toBe('PROPOSAL');
      // One STAGE_CHANGE activity per accepted move (5 forward steps); refused moves wrote none.
      expect(await prisma.dealActivity.count({ where: { tenantId: TENANT, dealId: deal.id, kind: 'STAGE_CHANGE' } })).toBe(
        PATH_TO_PROPOSAL.length - 1,
      );

      // NG-216: entering PROPOSAL created its auto tasks, once each, titled in the user's locale.
      // Refused moves created none (ELIGIBILITY_ANALYSIS was entered once, so one of its task).
      const sendQuoteTitle = m.autoTasks.proposal['send-quote'];
      const autoTasks = await prisma.dealTask.findMany({
        where: { tenantId: TENANT, dealId: deal.id, deletedAt: null },
        select: { autoRuleKey: true, title: true, autoGenerated: true, dueAt: true },
      });
      const sendQuote = autoTasks.filter((t) => t.autoRuleKey === 'proposal.send-quote');
      expect(sendQuote).toHaveLength(1);
      expect(sendQuote[0]).toMatchObject({ title: sendQuoteTitle, autoGenerated: true });
      expect(sendQuote[0]?.dueAt).not.toBeNull();
      expect(autoTasks.map((t) => t.autoRuleKey).sort()).toEqual([
        'contacted.book-discovery-meeting',
        'discovery.send-meeting-notes',
        'eligibility.check-call-rules',
        'proposal.follow-up',
        'proposal.send-quote',
        'qualified.contact-decision-maker',
      ]);

      // The only money on the screen: the estimated fee, minor units + currency, no success-fee claim.
      const after = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
      expect(after.estimatedFeeCents).toBe(150000);
      const shown = formatMoney(150000, 'EUR', locale);
      await expect(card).toContainText(`${m.pipeline.fee}: ${shown}`);
      await expect(page.locator('body')).not.toContainText(/uygun maliyet|cost[- ]eligible|eligible cost/i);
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: shot('02-proposal'), fullPage: true, caret: 'initial' });

      // …and the task is on the tasks screen, next to its deal, marked as automatic.
      await page.goto(`${base}/tasks`);
      const taskRow = page
        .getByRole('row')
        .filter({ hasText: sendQuoteTitle })
        .filter({ hasText: dealTitle });
      await expect(taskRow).toHaveCount(1);
      await expect(taskRow).toContainText(m.tasks.auto);
      await expect(taskRow).toContainText(m.tasks.open);
      await page.screenshot({ path: shot('03-send-quote-task'), fullPage: true, caret: 'initial' });
    });
  }
});
