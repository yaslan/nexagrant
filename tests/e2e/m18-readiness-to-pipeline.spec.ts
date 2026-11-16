import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../../src/lib/db';
import { createEventBus } from '../../src/core/events';
import { forwardPublicLead } from '../../src/lib/leads/public-lead-intake';
import { createLeadIntakePort } from '../../src/modules/m18/server/intake-repo';
import { withSystemScope } from '../../src/lib/system-scope';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * NG-208 (NG-133 halka 2 + 3) — one scenario from the public readiness scorecard to the
 * consultancy's own client pipeline:
 *
 *   /tr/fon-hazirlik (real clicks, signed out) → PublicLead row → province route → M18 intake →
 *   LeadOrganization + Deal on the mapped organisation's /musteri-hatti screens.
 *
 * Every "stored" / "visible" / "absent" is read from Postgres by this process or from the page.
 *
 * The transfer box exists only with the publication gate open, so the spec follows
 * lead-transfer-consent.spec.ts: one flag per run (the webServer inherits the runner's environment).
 *   LEAD_TRANSFER_CONSENT_ENABLED=true   → chain + bridge + unmapped arm
 *   LEAD_TRANSFER_CONSENT_ENABLED=false  → box absent, nothing routed even for a mapped province
 *
 * Three kinds of test, on purpose kept apart:
 *   - "PRODUCT CHAIN": submit only, then wait for the lead to reach the pipeline by itself. Red while
 *     no production code path calls forwardPublicLead (see the NG-208 report for file:line).
 *   - "DOWNSTREAM": same submit, then THIS TEST calls the bridge (forwardPublicLead + the real M18
 *     port) where the product does not. Proves the rest of the chain, not that the product wires it.
 *   - negative arm: an unmapped province never lands anywhere.
 */

const FLAG_ON = process.env.LEAD_TRANSFER_CONSENT_ENABLED === 'true';
const EVIDENCE = join(process.cwd(), 'docs/agent-results/NG-208-evidence');
const RUN = Math.random().toString(36).slice(2, 8);
const DOMAIN = `e2e-m18-chain-${RUN}.test`;
const email = (who: string) => `${who}@${DOMAIN}`;

const MAPPED = 'Kastamonu';
const UNMAPPED = 'Hakkari';
const TENANT = `e2e-m18-chain-org-${RUN}`;
const WS = { id: `e2e-m18-chain-ws-${RUN}`, slug: `m18-chain-${RUN}`, name: 'M18 chain' };
const OWNER = { userId: `e2e-m18-chain-owner-${RUN}`, email: `owner-${RUN}@e2e.fabrika.test` };
const ORG_NAME = `E2E Danışmanlık ${RUN}`;

const ANSWERS = '012012012012012';
const result = (locale: 'tr' | 'en', il: string) =>
  locale === 'tr'
    ? `/tr/fon-hazirlik?kurum=municipality&cevap=${ANSWERS}&il=${encodeURIComponent(il)}`
    : `/en/funding-readiness?kurum=municipality&cevap=${ANSWERS}&il=${encodeURIComponent(il)}`;

const L = {
  tr: {
    name: 'Adınız soyadınız', email: 'E-posta adresiniz', org: 'Kurumunuz', province: 'İl (isteğe bağlı)',
    consent: /Adımın, e-posta adresimin/, transfer: /danışmanlık kuruluşuna aktarılmasına/, submit: 'Gönder',
    title: 'Sonucunuzu bir uzmanla konuşun', thanks: 'Teşekkürler, talebiniz alındı.',
  },
  en: {
    name: 'Your full name', email: 'Your e-mail address', org: 'Your organisation', province: 'Province (optional)',
    consent: /explicit consent for .+ to process my name/, transfer: /passed on to the consultancy organisation/, submit: 'Send',
    title: 'Talk your result over with an expert', thanks: 'Thank you, we have your request.',
  },
} as const;
type Locale = keyof typeof L;

async function anonymous(browser: Browser, ip: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-forwarded-for': ip } });
  await context.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
  });
  return { context, page: await context.newPage() };
}

/** Opens the scorecard result for a province, fills it and clicks send. Returns the visitor's organisation name. */
async function submitScorecard(page: Page, locale: Locale, il: string, who: string, opts: { tickTransfer: boolean }) {
  const s = L[locale];
  const visitorOrg = `Atakum Belediyesi ${who} ${RUN}`;
  await page.goto(result(locale, il));
  await expect(page.getByRole('heading', { name: s.title })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByLabel(s.province, { exact: true })).toHaveValue(il);
  await page.getByLabel(s.name).fill('Ayşe Yılmaz');
  await page.getByLabel(s.email).fill(email(who));
  await page.getByLabel(s.org).fill(visitorOrg);
  await page.getByLabel(s.consent).check();
  if (opts.tickTransfer) {
    const box = page.getByRole('checkbox', { name: s.transfer });
    await expect(box).toBeVisible();
    await expect(page.getByText(ORG_NAME)).toBeVisible();
    await box.check();
  }
  return visitorOrg;
}

async function leadRow(who: string) {
  let row: Awaited<ReturnType<typeof readLead>> = null;
  await expect.poll(async () => ((row = await readLead(who)) !== null)).toBe(true);
  return row!;
}
async function readLead(who: string) {
  return withSystemScope('platform-admin', 'e2e.m18-chain.read-lead', (tx) =>
    tx.publicLead.findFirst({
      where: { email: email(who) },
      select: { id: true, province: true, locale: true, transferConsent: true, routeStatus: true, routeReason: true, routedTenantId: true },
    }),
  );
}

/** Landed rows in the organisation tenant for one lead (tenant table: read through the e2e DB role like m18-client-pipeline.spec). */
async function landed(leadId: string) {
  const sourceRef = `public-lead:${leadId}`;
  const [orgs, deals, contacts] = await Promise.all([
    prisma.leadOrganization.findMany({ where: { sourceRef }, select: { tenantId: true, name: true } }),
    prisma.deal.findMany({ where: { sourceRef }, select: { tenantId: true, title: true, stage: true } }),
    prisma.leadContact.findMany({ where: { sourceRef }, select: { tenantId: true } }),
  ]);
  return { orgs, deals, contacts };
}

function evidence(name: string, value: unknown) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, name), JSON.stringify(value, null, 2) + '\n');
}

async function ownerPage(browser: Browser, locale: Locale) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });
  return { context, page, base: `/${locale}/${WS.slug}/musteri-hatti` };
}


test.describe(`M18 karne → PublicLead → il yönlendirmesi → kurum/fırsat (LEAD_TRANSFER_CONSENT_ENABLED=${FLAG_ON})`, () => {
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    await withSystemScope('platform-admin', 'e2e.m18-chain.setup', async (tx) => {
      const stale = await tx.tenant.findMany({ where: { slug: { startsWith: 'e2e-m18-chain-org-' } }, select: { id: true } });
      for (const t of stale) await tx.provinceLeadRoute.deleteMany({ where: { targetTenantId: t.id } });
      const org = await tx.tenant.create({
        data: { id: TENANT, name: ORG_NAME, slug: TENANT, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' },
      });
      await tx.provinceLeadRoute.create({ data: { province: MAPPED, targetTenantId: org.id, active: true } });
    });
    await seedIdentity({ userId: OWNER.userId, email: OWNER.email, name: 'M18 Chain Owner', role: 'TENANT_OWNER', tenantId: TENANT }, WS);
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M18' } },
      create: { tenantId: TENANT, moduleId: 'M18', status: 'PILOT', changedBy: 'ng-208 e2e' },
      update: { status: 'PILOT' },
    });
  });

  test.afterAll(async () => {
    if (process.env.E2E_KEEP_CHAIN_ROWS !== '1') {
      await prisma.dealTask.deleteMany({ where: { tenantId: TENANT } });
      await prisma.dealActivity.deleteMany({ where: { tenantId: TENANT } });
      await prisma.deal.deleteMany({ where: { tenantId: TENANT } });
      await prisma.leadContact.deleteMany({ where: { tenantId: TENANT } });
      await prisma.leadOrganization.deleteMany({ where: { tenantId: TENANT } });
      await prisma.consent.deleteMany({ where: { tenantId: TENANT } });
      await withSystemScope('platform-admin', 'e2e.m18-chain.cleanup', async (tx) => {
        await tx.publicLead.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
        await tx.provinceLeadRoute.deleteMany({ where: { targetTenantId: TENANT } });
      });
      await cleanupIdentity([OWNER.userId]);
      await prisma.moduleState.deleteMany({ where: { tenantId: TENANT } });
      await withSystemScope('platform-admin', 'e2e.m18-chain.cleanup-tenant', (tx) => tx.tenant.deleteMany({ where: { id: TENANT } }));
    }
    await prisma.$disconnect();
  });

  if (FLAG_ON) {
    test('PRODUCT CHAIN (tr): scorecard of a mapped province → lead reaches the organisation\'s pipeline without any manual step', async ({ browser }) => {
      const who = 'chain-tr';
      const { context, page } = await anonymous(browser, '10.30.1.1');
      const visitorOrg = await submitScorecard(page, 'tr', MAPPED, who, { tickTransfer: true });
      await page.screenshot({ path: join(EVIDENCE, 'chain-tr-1-form.png'), fullPage: true });
      await page.getByRole('button', { name: L.tr.submit }).click();
      await expect(page.getByRole('heading', { name: L.tr.thanks })).toBeVisible();
      await context.close();

      const lead = await leadRow(who);
      expect(lead).toMatchObject({ province: MAPPED, transferConsent: true });

      // Nothing here calls the bridge: whatever happens now is the product's own doing.
      await expect
        .poll(async () => (await landed(lead.id)).orgs.length, { timeout: 20_000, message: 'no LeadOrganization ever appeared for the submitted lead' })
        .toBe(1);

      const owner = await ownerPage(browser, 'tr');
      await owner.page.goto(`${owner.base}/leads`);
      await expect(owner.page.getByText(visitorOrg)).toBeVisible();
      await owner.page.screenshot({ path: join(EVIDENCE, 'chain-tr-2-leads.png'), fullPage: true });
      await owner.page.goto(`${owner.base}/pipeline`);
      await expect(owner.page.getByText(`${visitorOrg} — Fon Hazırlık Karnesi`)).toBeVisible();
      await owner.page.screenshot({ path: join(EVIDENCE, 'chain-tr-3-pipeline.png'), fullPage: true });
      await owner.context.close();
    });

    for (const locale of ['tr', 'en'] as const) {
      test(`DOWNSTREAM (${locale}): submit by click, then the test calls forwardPublicLead (the product never does) → org + deal visible on musteri-hatti`, async ({ browser }) => {
        const who = `bridge-${locale}`;
        const { context, page } = await anonymous(browser, `10.30.2.${locale === 'tr' ? 1 : 2}`);
        const visitorOrg = await submitScorecard(page, locale, MAPPED, who, { tickTransfer: true });
        await page.getByRole('button', { name: L[locale].submit }).click();
        await expect(page.getByRole('heading', { name: L[locale].thanks })).toBeVisible();
        await context.close();

        const lead = await leadRow(who);
        expect(lead).toMatchObject({ province: MAPPED, transferConsent: true, routeStatus: null });

        const outcome = await forwardPublicLead(lead.id, createLeadIntakePort(prisma, createEventBus()), prisma);
        expect(outcome.status).toBe('created');
        const after = await leadRow(who);
        expect(after).toMatchObject({ routeStatus: 'routed', routedTenantId: TENANT });
        const rows = await landed(lead.id);
        expect(rows.orgs).toHaveLength(1);
        expect(rows.contacts).toHaveLength(1);
        expect(rows.deals).toMatchObject([{ tenantId: TENANT, stage: 'NEW' }]);
        evidence(`db-bridge-${locale}.json`, { lead: after, landed: rows, outcome: outcome.status });

        const owner = await ownerPage(browser, locale);
        await owner.page.goto(`${owner.base}/leads`);
        await expect(owner.page.getByText(visitorOrg)).toBeVisible();
        await owner.page.screenshot({ path: join(EVIDENCE, `bridge-${locale}-1-leads.png`), fullPage: true });
        await owner.page.goto(`${owner.base}/pipeline`);
        await expect(owner.page.getByText(visitorOrg).first()).toBeVisible();
        await owner.page.screenshot({ path: join(EVIDENCE, `bridge-${locale}-2-pipeline.png`), fullPage: true });
        await owner.context.close();
      });
    }

    test('NEGATIVE: unmapped province → no box, lead stored, never lands in any organisation (even if the bridge is run)', async ({ browser }) => {
      const who = 'unmapped';
      const { context, page } = await anonymous(browser, '10.30.3.1');
      const visitorOrg = await submitScorecard(page, 'tr', UNMAPPED, who, { tickTransfer: false });
      await expect(page.getByRole('checkbox', { name: L.tr.transfer })).toHaveCount(0);
      await page.getByRole('button', { name: L.tr.submit }).click();
      await expect(page.getByRole('heading', { name: L.tr.thanks })).toBeVisible();
      await context.close();

      const lead = await leadRow(who);
      expect(lead).toMatchObject({ province: UNMAPPED, transferConsent: false, routedTenantId: null });

      const outcome = await forwardPublicLead(lead.id, createLeadIntakePort(prisma, createEventBus()), prisma);
      expect(outcome).toEqual({ status: 'skipped', reason: 'transfer_consent_off' });
      const rows = await landed(lead.id);
      expect(rows).toEqual({ orgs: [], deals: [], contacts: [] });
      evidence('db-unmapped.json', { lead: await leadRow(who), landed: rows, outcome });

      const owner = await ownerPage(browser, 'tr');
      for (const path of ['leads', 'pipeline']) {
        await owner.page.goto(`${owner.base}/${path}`);
        await expect(owner.page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(owner.page.getByText(visitorOrg)).toHaveCount(0);
      }
      await owner.page.goto(`${owner.base}/leads`);
      await owner.page.screenshot({ path: join(EVIDENCE, 'unmapped-tr-leads.png'), fullPage: true });
      await owner.context.close();
    });
  } else {
    test('GATE OFF: mapped province shows no transfer box; nothing is routed, even when the bridge is run', async ({ browser }) => {
      const who = 'gate-off';
      const { context, page } = await anonymous(browser, '10.30.4.1');
      const visitorOrg = await submitScorecard(page, 'tr', MAPPED, who, { tickTransfer: false });
      await expect(page.getByRole('checkbox', { name: L.tr.transfer })).toHaveCount(0);
      await page.getByRole('button', { name: L.tr.submit }).click();
      await expect(page.getByRole('heading', { name: L.tr.thanks })).toBeVisible();
      await context.close();

      const lead = await leadRow(who);
      expect(lead).toMatchObject({ province: MAPPED, transferConsent: false, routedTenantId: null });
      const outcome = await forwardPublicLead(lead.id, createLeadIntakePort(prisma, createEventBus()), prisma);
      expect(outcome).toEqual({ status: 'skipped', reason: 'transfer_consent_off' });
      expect(await landed(lead.id)).toEqual({ orgs: [], deals: [], contacts: [] });

      const owner = await ownerPage(browser, 'tr');
      await owner.page.goto(`${owner.base}/leads`);
      await expect(owner.page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(owner.page.getByText(visitorOrg)).toHaveCount(0);
      await owner.context.close();
    });
  }
});
