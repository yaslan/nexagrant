import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../../src/lib/db';
import { PUBLIC_LEAD_CONSENT, PUBLIC_LEAD_TRANSFER_CONSENT } from '../../src/lib/leads/public-lead-policy';
import { withSystemScope } from '../../src/lib/system-scope';
import { presentIds, requireId } from '../helpers/teardown-guard';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MWG4H1YS5HQHC (NG-179) — the separate "transfer to the province's consultancy" box on the
 * readiness result form. Every submit is a real click by a signed-out visitor; every "stored" /
 * "not stored" is read from Postgres by this process.
 *
 * Two runs, one flag each (the webServer inherits the runner's environment):
 *   LEAD_TRANSFER_CONSENT_ENABLED=true   → scenarios a–d and the keyboard check
 *   LEAD_TRANSFER_CONSENT_ENABLED=false  → scenario e (box absent even for a mapped province)
 *
 * Evidence (screenshots + DB rows as JSON) is written to test-artifacts/NG-179-evidence/ (git-ignored).
 * To publish it on purpose: E2E_SHOTS_ROOT=docs/agent-results (see tests/e2e/fixtures/shots.ts).
 */

const FLAG_ON = process.env.LEAD_TRANSFER_CONSENT_ENABLED === 'true';
const EVIDENCE = shotsDir('NG-179-evidence');
const RUN = Math.random().toString(36).slice(2, 8);
const DOMAIN = `e2e-transfer-${RUN}.test`;
const email = (who: string) => `${who}@${DOMAIN}`;

// Sinop gets an active route to a consultancy tenant created by this spec; Ardahan has none.
const MAPPED = 'Sinop';
const UNMAPPED = 'Ardahan';
const ORG_NAME = `E2E Danışmanlık ${RUN}`;
const ORG_SLUG = `e2e-transfer-org-${RUN}`;

const ANSWERS = '012012012012012';
const url = (locale: 'tr' | 'en', il: string) =>
  locale === 'tr'
    ? `/tr/fon-hazirlik?kurum=municipality&cevap=${ANSWERS}&il=${encodeURIComponent(il)}`
    : `/en/funding-readiness?kurum=municipality&cevap=${ANSWERS}&il=${encodeURIComponent(il)}`;

/** Labels per locale (copied from messages/tr.json and messages/en.json, readiness.lead). */
const L = {
  tr: {
    name: 'Adınız soyadınız',
    email: 'E-posta adresiniz',
    org: 'Kurumunuz',
    province: 'İl (isteğe bağlı)',
    consent: /Adımın, e-posta adresimin/,
    transfer: /danışmanlık kuruluşuna aktarılmasına/,
    toggle: 'Bu aktarım hakkında ayrıntılar',
    submit: 'Gönder',
    title: 'Sonucunuzu bir uzmanla konuşun',
  },
  en: {
    name: 'Your full name',
    email: 'Your e-mail address',
    org: 'Your organisation',
    province: 'Province (optional)',
    consent: /explicit consent for .+ to process my name/,
    transfer: /passed on to the consultancy organisation/,
    toggle: 'Details about this transfer',
    submit: 'Send',
    title: 'Talk your result over with an expert',
  },
} as const;

type Locale = keyof typeof L;

async function openPage(browser: Browser, ip: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
  });
  return { context, page: await context.newPage() };
}

/** Opens the result screen and waits until the contact form is rendered (cold dev-server compiles are slow). */
async function openForm(page: Page, locale: Locale, il: string) {
  await page.goto(url(locale, il));
  await expect(page.getByRole('heading', { name: L[locale].title })).toBeVisible({ timeout: 120_000 });
}

async function fillContact(page: Page, locale: Locale, who: string) {
  const s = L[locale];
  await page.getByLabel(s.name).fill('Ayşe Yılmaz');
  await page.getByLabel(s.email).fill(email(who));
  await page.getByLabel(s.org).fill('Atakum Belediyesi');
}

/** Waits for the lead row of this visitor and returns the stored fields (raw, from Postgres). */
async function storedRow(who: string) {
  let row: Awaited<ReturnType<typeof readRow>> = null;
  await expect
    .poll(async () => {
      row = await readRow(who);
      return row !== null;
    })
    .toBe(true);
  return row!;
}

async function readRow(who: string) {
  const rows = await withSystemScope('platform-admin', 'e2e.lead-transfer.read', (tx) =>
    tx.publicLead.findMany({
      where: { email: email(who) },
      select: {
        email: true,
        province: true,
        locale: true,
        consentVersion: true,
        transferConsent: true,
        transferConsentVersion: true,
        transferConsentAt: true,
      },
    }),
  );
  return rows[0] ?? null;
}

function saveEvidence(name: string, value: unknown) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, name), JSON.stringify(value, null, 2) + '\n');
}

test.describe('transfer box (NG-179)', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    // Seeded in BOTH runs: with the flag off Sinop must still be mapped, or (e) could not tell
    // "gate closed" from "province unmapped".
    await withSystemScope('platform-admin', 'e2e.lead-transfer.setup', async (tx) => {
      // A run that was killed never reaches afterAll: clear its leftovers so the Sinop route is free.
      const stale = await tx.tenant.findMany({ where: { slug: { startsWith: 'e2e-transfer-org-' } }, select: { id: true } });
      await tx.provinceLeadRoute.deleteMany({ where: { targetTenantId: { in: presentIds(stale.map((t) => t.id)) } } });
      await tx.tenant.deleteMany({ where: { id: { in: presentIds(stale.map((t) => t.id)) } } });
      const org = await tx.tenant.create({
        data: { name: ORG_NAME, slug: ORG_SLUG, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' },
      });
      await tx.provinceLeadRoute.create({ data: { province: MAPPED, targetTenantId: org.id, active: true } });
    });
  });

  test.afterAll(async () => {
    // E2E_KEEP_TRANSFER_ROWS=1 leaves the rows and the test organisation in place for a raw psql read.
    if (process.env.E2E_KEEP_TRANSFER_ROWS === '1') return;
    await withSystemScope('platform-admin', 'e2e.lead-transfer.cleanup', async (tx) => {
      await tx.publicLead.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
      const org = await tx.tenant.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
      if (org) {
        await tx.provinceLeadRoute.deleteMany({ where: { targetTenantId: requireId(org.id, 'org.id') } });
        await tx.tenant.delete({ where: { id: org.id } });
      }
    });
    await prisma.$disconnect();
  });

  test.describe('flag ON', () => {
    test.skip(!FLAG_ON, 'runs only with LEAD_TRANSFER_CONSENT_ENABLED=true');

    test('(a) mapped province + box ticked → consent version and time written, box text in both locales', async ({ browser }) => {
      for (const locale of ['tr', 'en'] as const) {
        const who = `a-${locale}`;
        const { context, page } = await openPage(browser, `10.20.${locale === 'tr' ? 1 : 2}.1`);
        await openForm(page, locale, MAPPED);
        await expect(page.getByLabel(L[locale].province, { exact: true })).toHaveValue(MAPPED);

        const box = page.getByRole('checkbox', { name: L[locale].transfer });
        await expect(box).toBeVisible();
        await expect(box).not.toBeChecked();
        await expect(page.getByText(ORG_NAME)).toBeVisible();

        await fillContact(page, locale, who);
        await page.getByLabel(L[locale].consent).check();
        await box.check();
        await page.screenshot({ path: join(EVIDENCE, `box-${locale}.png`), fullPage: true });
        await page.getByRole('button', { name: L[locale].submit }).click();

        const row = await storedRow(who);
        saveEvidence(`db-a-${locale}.json`, row);
        expect(row).toMatchObject({
          transferConsent: true,
          transferConsentVersion: PUBLIC_LEAD_TRANSFER_CONSENT.version,
          consentVersion: PUBLIC_LEAD_CONSENT.version,
        });
        expect(row.transferConsentAt).not.toBeNull();
        await context.close();
      }
    });

    test('(b) mapped province + box unticked → lead stored, no transfer consent', async ({ browser }) => {
      const who = 'b';
      const { context, page } = await openPage(browser, '10.20.3.1');
      await openForm(page, 'tr', MAPPED);
      await fillContact(page, 'tr', who);
      await page.getByLabel(L.tr.consent).check();
      await page.getByRole('button', { name: L.tr.submit }).click();

      const row = await storedRow(who);
      saveEvidence('db-b.json', row);
      expect(row).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
      await context.close();
    });

    test('(c) unmapped province → box not in the DOM, no transfer consent', async ({ browser }) => {
      const who = 'c';
      const { context, page } = await openPage(browser, '10.20.4.1');
      await openForm(page, 'tr', UNMAPPED);
      await expect(page.getByLabel(L.tr.province, { exact: true })).toHaveValue(UNMAPPED);
      await expect(page.getByRole('checkbox', { name: L.tr.transfer })).toHaveCount(0);
      await expect(page.locator('#lead-transfer')).toHaveCount(0);

      await fillContact(page, 'tr', who);
      await page.getByLabel(L.tr.consent).check();
      await page.getByRole('button', { name: L.tr.submit }).click();

      const row = await storedRow(who);
      saveEvidence('db-c.json', row);
      expect(row).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
      await context.close();
    });

    test('(d) box ticked, then province changed to unmapped → box disappears, no transfer consent', async ({ browser }) => {
      const who = 'd';
      const { context, page } = await openPage(browser, '10.20.5.1');
      await openForm(page, 'tr', MAPPED);
      const box = page.getByRole('checkbox', { name: L.tr.transfer });
      await expect(box).toBeVisible();
      await box.check();

      await page.getByLabel(L.tr.province, { exact: true }).selectOption(UNMAPPED);
      await expect(page.getByRole('checkbox', { name: L.tr.transfer })).toHaveCount(0);
      await expect(page.getByText(ORG_NAME)).toHaveCount(0);

      await fillContact(page, 'tr', who);
      await page.getByLabel(L.tr.consent).check();
      await page.getByRole('button', { name: L.tr.submit }).click();

      const row = await storedRow(who);
      saveEvidence('db-d.json', row);
      expect(row).toMatchObject({ province: UNMAPPED, transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
      await context.close();
    });

    test('keyboard: Tab reaches the box, Space ticks it, Tab reaches the details button, Enter/Space toggle aria-expanded', async ({ browser }) => {
      const { context, page } = await openPage(browser, '10.20.6.1');
      await openForm(page, 'tr', MAPPED);
      // The box arrives after the organisation lookup, so wait for it before walking the tab order.
      await expect(page.getByRole('checkbox', { name: L.tr.transfer })).toBeVisible();

      await page.getByLabel(L.tr.consent).focus();
      const order: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const id = await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; return el ? `${el.tagName}#${el.id}:${(el.textContent ?? '').trim().slice(0, 25)}` : ''; });
        order.push(id);
        if (id.startsWith('INPUT#lead-transfer')) break;
        await page.keyboard.press('Tab');
      }
      expect(order.at(-1), `tab order seen: ${order.join(' > ')}`).toMatch(/^INPUT#lead-transfer/);
      await expect(page.getByLabel(L.tr.transfer)).toHaveAttribute('aria-describedby', 'lead-transfer-org');

      await page.keyboard.press('Space');
      await expect(page.locator('#lead-transfer')).toBeChecked();

      const toggle = page.getByRole('button', { name: L.tr.toggle });
      await page.keyboard.press('Tab');
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#lead-transfer-details')).toBeHidden();

      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#lead-transfer-details')).toBeVisible();

      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#lead-transfer-details')).toBeHidden();
      await context.close();
    });
  });

  test.describe('flag OFF', () => {
    test.skip(FLAG_ON, 'runs only with LEAD_TRANSFER_CONSENT_ENABLED unset or false');

    test('(e) mapped province → box absent from the page and no transfer consent is written', async ({ browser }) => {
      const who = 'e';
      const { context, page } = await openPage(browser, '10.20.7.1');
      await openForm(page, 'tr', MAPPED);
      await expect(page.getByLabel(L.tr.province, { exact: true })).toHaveValue(MAPPED);
      await expect(page.getByRole('checkbox', { name: L.tr.transfer })).toHaveCount(0);
      await expect(page.locator('#lead-transfer')).toHaveCount(0);
      await page.screenshot({ path: join(EVIDENCE, 'flag-off-tr.png'), fullPage: true });

      await fillContact(page, 'tr', who);
      await page.getByLabel(L.tr.consent).check();
      await page.getByRole('button', { name: L.tr.submit }).click();

      const row = await storedRow(who);
      saveEvidence('db-e.json', row);
      expect(row).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
      await context.close();
    });
  });
});
