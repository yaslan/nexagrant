import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { hashClientIp, PUBLIC_LEAD_EMAIL_LIMIT, PUBLIC_LEAD_IP_LIMIT } from '../../src/lib/leads/public-lead';
import { PUBLIC_LEAD_CONSENT } from '../../src/lib/leads/public-lead-policy';
import { withSystemScope } from '../../src/lib/system-scope';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MUU76P65BMO71 — the public contact form on the readiness result screen
 * (`/tr/fon-hazirlik`, `/en/funding-readiness`, server action submitReadinessLead).
 *
 * Every submit is a real click by a signed-out visitor; every "it was stored" (or
 * "it was not") is read from Postgres by this process, and the admin side is the
 * real /tr/admin/leads page under a platform-admin seat of this spec's own.
 *
 * Rows are keyed by a per-run e-mail domain, so the spec is safe to repeat on a
 * shared database; afterAll removes only those rows and its own admin seat
 * (never the demo tenant).
 */

const SHOTS = shotsDir('TASK-MUU76P65BMO71-public-lead-form');
const RUN = Math.random().toString(36).slice(2, 8);
const DOMAIN = `e2e-public-lead-${RUN}.test`;
const email = (who: string) => `${who}@${DOMAIN}`;

// A 15-answer share link opens straight on the result screen, where the form lives.
const ANSWERS = '012012012012012';
const TR_RESULT = `/tr/fon-hazirlik?kurum=municipality&cevap=${ANSWERS}&il=Samsun`;
const EN_RESULT = `/en/funding-readiness?kurum=municipality&cevap=${ANSWERS}`;

const ADMIN = {
  userId: `e2e-public-lead-admin-${RUN}`,
  email: `public-lead-admin-${RUN}@e2e.fabrika.test`,
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

async function anonymousPage(
  browser: Browser,
  viewport = { width: 1280, height: 900 },
  extraHTTPHeaders?: Record<string, string>,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, extraHTTPHeaders });
  await context.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
  });
  return { context, page: await context.newPage() };
}

async function leadsFor(address: string) {
  return withSystemScope('platform-admin', 'e2e.public-lead.read', (tx) =>
    tx.publicLead.findMany({ where: { email: address } }),
  );
}

async function fillTr(page: Page, values: { name?: string; email?: string; organisation?: string; district?: string }) {
  if (values.name !== undefined) await page.getByLabel('Adınız soyadınız').fill(values.name);
  if (values.email !== undefined) await page.getByLabel('E-posta adresiniz').fill(values.email);
  if (values.organisation !== undefined) await page.getByLabel('Kurumunuz').fill(values.organisation);
  if (values.district !== undefined) await page.getByLabel('İlçe (isteğe bağlı)').fill(values.district);
}

test.describe('public lead form — /tr/fon-hazirlik result screen', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
  });

  test.afterAll(async () => {
    await withSystemScope('platform-admin', 'e2e.public-lead.cleanup', (tx) =>
      tx.publicLead.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } }),
    );
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test('signed out → submit → one PublicLead row → the platform admin sees it on /tr/admin/leads', async ({ browser, baseURL }) => {
    const { context, page } = await anonymousPage(browser);
    const address = email('ayse');

    const session = await page.request.get('/api/auth/session');
    expect(await session.json()).toBeNull();

    await page.goto(TR_RESULT);
    await expect(page.getByRole('heading', { name: 'Sonucunuzu bir uzmanla konuşun' })).toBeVisible();
    // The province chosen on the scorecard carries into the form.
    await expect(page.getByLabel('İl (isteğe bağlı)')).toHaveValue('Samsun');

    // Mixed case on purpose: the row stores the address lower-cased.
    await fillTr(page, { name: 'Ayşe Yılmaz', email: `  AYSE@${DOMAIN.toUpperCase()} `, organisation: 'Atakum Belediyesi', district: 'Atakum' });
    await page.getByLabel(/açık rıza veriyorum/).check();
    await page.getByRole('button', { name: 'Gönder' }).click();

    await expect(page.getByRole('heading', { name: 'Teşekkürler, talebiniz alındı.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Teşekkürler, talebiniz alındı.' })).toBeFocused();
    await page.screenshot({ path: `${SHOTS}/tr-success.png`, fullPage: true });

    const rows = await leadsFor(address);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      name: 'Ayşe Yılmaz',
      email: address,
      organisation: 'Atakum Belediyesi',
      province: 'Samsun',
      district: 'Atakum',
      readinessCode: `municipality.${ANSWERS}`,
      consentVersion: PUBLIC_LEAD_CONSENT.version,
      source: 'fon-hazirlik',
      locale: 'tr',
    });
    // Recomputed on the server from the answers, never taken from the client.
    expect(row.readinessTotal).not.toBeNull();
    expect(row.readinessLevel).not.toBeNull();
    await context.close();

    // The admin side: the real list page, under a seeded platform-admin seat.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await signInAs(adminPage, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL);
    await adminPage.goto('/tr/admin/leads');
    await expect(adminPage.getByRole('heading', { level: 1, name: 'İletişim talepleri' })).toBeVisible();
    const tableRow = adminPage.getByRole('row').filter({ hasText: address });
    await expect(tableRow).toHaveCount(1);
    await expect(tableRow).toContainText('Ayşe Yılmaz');
    await expect(tableRow).toContainText('Atakum Belediyesi');
    await expect(tableRow).toContainText(`${row.readinessTotal}/100`);
    await expect(tableRow).toContainText(PUBLIC_LEAD_CONSENT.version);
    await adminPage.screenshot({ path: `${SHOTS}/tr-admin-leads.png`, fullPage: true });
    await admin.close();
  });

  test('the admin list is not public: a signed-out visitor gets 404', async ({ browser }) => {
    const { context, page } = await anonymousPage(browser);
    const response = await page.goto('/tr/admin/leads');
    expect(response?.status()).toBe(404);
    await expect(page.getByText(email('ayse'))).toHaveCount(0);
    await context.close();
  });

  test('before hydration the submit button is disabled, so no native GET puts the details in the URL', async ({ browser }) => {
    // JavaScript off = the server-rendered form as it stands until React hydrates it.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(TR_RESULT);
    await page.getByLabel('Adınız soyadınız').fill('Ön Yükleme');
    await page.getByLabel('E-posta adresiniz').fill(email('prehydration'));
    const submit = page.getByRole('button', { name: 'Gönder' });
    await expect(submit).toBeDisabled();
    // Implicit submission (Enter in a field) is blocked too while the default button is disabled.
    await page.getByLabel('E-posta adresiniz').press('Enter');
    expect(new URL(page.url()).searchParams.get('email')).toBeNull();
    expect(page.url()).toContain(`cevap=${ANSWERS}`);
    await context.close();
  });

  test('opening a shared result keeps focus and scroll where the visitor left them', async ({ browser }) => {
    const { context, page } = await anonymousPage(browser);
    await page.goto(TR_RESULT);
    const submit = page.getByRole('button', { name: 'Gönder' });
    // Enabled = hydrated; the mount effects have run by then.
    await expect(submit).toBeEnabled();
    await expect(page.locator('#result-heading')).not.toBeFocused();
    await submit.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThan(0);
    await submit.click();
    await expect(page.getByText('Adınızı yazın (en az 2 karakter).')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await context.close();
  });

  test('required fields, an invalid e-mail and a missing consent each block the submit', async ({ browser }) => {
    const { context, page } = await anonymousPage(browser);
    const address = email('blocked');
    await page.goto(TR_RESULT);
    const submit = page.getByRole('button', { name: 'Gönder' });

    // 1) Nothing filled: every required field and the consent box say why, focus goes to the first.
    await submit.click();
    await expect(page.getByText('Adınızı yazın (en az 2 karakter).')).toBeVisible();
    await expect(page.getByText('Geçerli bir e-posta adresi yazın (ör. ad@belediye.bel.tr).')).toBeVisible();
    await expect(page.getByText('Kurumunuzun adını yazın (en az 2 karakter).')).toBeVisible();
    await expect(page.getByText('Göndermek için açık rıza kutusunu işaretleyin.')).toBeVisible();
    await expect(page.getByLabel('Adınız soyadınız')).toBeFocused();
    await expect(page.getByLabel('Adınız soyadınız')).toHaveAttribute('aria-invalid', 'true');
    await page.screenshot({ path: `${SHOTS}/tr-required.png`, fullPage: true });

    // 2) Everything valid except the address.
    await fillTr(page, { name: 'Mehmet Kaya', email: 'mehmet@belediye', organisation: 'Bafra Belediyesi' });
    await page.getByLabel(/açık rıza veriyorum/).check();
    await submit.click();
    await expect(page.getByText('Geçerli bir e-posta adresi yazın (ör. ad@belediye.bel.tr).')).toBeVisible();
    await expect(page.getByLabel('E-posta adresiniz')).toBeFocused();
    await expect(page.getByText('Adınızı yazın (en az 2 karakter).')).toHaveCount(0);

    // Fix the email and verify the error clears when the field changes.
    await fillTr(page, { email: 'mehmet@belediye.bel.tr' });
    await expect(page.getByText('Geçerli bir e-posta adresi yazın (ör. ad@belediye.bel.tr).')).toHaveCount(0);

    // 2c) Everything valid except the name (empty).
    await fillTr(page, { name: '', email: 'valid@email.bel.tr', organisation: 'Test Kurumu' });
    await submit.click();
    await expect(page.getByText('Adınızı yazın (en az 2 karakter).')).toBeVisible();
    await expect(page.getByLabel('Adınız soyadınız')).toBeFocused();

    // Fix the name and verify the error clears when the field changes.
    await fillTr(page, { name: 'Test Adı' });
    await expect(page.getByText('Adınızı yazın (en az 2 karakter).')).toHaveCount(0);

    // 3) A valid address, but the consent box unticked.
    await fillTr(page, { email: address });
    await page.getByLabel(/açık rıza veriyorum/).uncheck();
    await submit.click();
    await expect(page.getByText('Göndermek için açık rıza kutusunu işaretleyin.')).toBeVisible();
    await expect(page.getByLabel(/açık rıza veriyorum/)).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Teşekkürler, talebiniz alındı.' })).toHaveCount(0);

    expect(await leadsFor(address)).toHaveLength(0);
    expect(await leadsFor('mehmet@belediye')).toHaveLength(0);
    await context.close();
  });

  test('honeypot: a filled hidden field looks like success but stores nothing', async ({ browser }) => {
    const { context, page } = await anonymousPage(browser);
    const address = email('bot');
    await page.goto(TR_RESULT);
    await fillTr(page, { name: 'Bot Bot', email: address, organisation: 'Bot Org' });
    await page.getByLabel(/açık rıza veriyorum/).check();
    // Off-screen and out of the tab order; only a script reaches it.
    await page.locator('#lead-website').evaluate((el: HTMLInputElement) => {
      el.value = 'https://spam.example';
    });
    await page.getByRole('button', { name: 'Gönder' }).click();
    await expect(page.getByRole('heading', { name: 'Teşekkürler, talebiniz alındı.' })).toBeVisible();
    expect(await leadsFor(address)).toHaveLength(0);
    await context.close();
  });

  test(`rate limit: the ${PUBLIC_LEAD_EMAIL_LIMIT + 1}th request for one address in 24 h is refused`, async ({ browser }) => {
    const address = email('repeat');
    await withSystemScope('platform-admin', 'e2e.public-lead.seed', (tx) =>
      tx.publicLead.createMany({
        data: Array.from({ length: PUBLIC_LEAD_EMAIL_LIMIT }, (_, i) => ({
          name: `Önceki ${i}`,
          email: address,
          organisation: 'Tekrar Belediyesi',
          consentVersion: PUBLIC_LEAD_CONSENT.version,
          consentAt: new Date(),
          source: 'fon-hazirlik',
          locale: 'tr',
        })),
      }),
    );

    const { context, page } = await anonymousPage(browser);
    await page.goto(TR_RESULT);
    await fillTr(page, { name: 'Tekrar Eden', email: address, organisation: 'Tekrar Belediyesi' });
    await page.getByLabel(/açık rıza veriyorum/).check();
    await page.getByRole('button', { name: 'Gönder' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Kısa sürede çok fazla talep gönderildi.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Teşekkürler, talebiniz alındı.' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/tr-rate-limited.png`, fullPage: true });
    expect(await leadsFor(address)).toHaveLength(PUBLIC_LEAD_EMAIL_LIMIT);
    await context.close();
  });

  test(`rate limit: the ${PUBLIC_LEAD_IP_LIMIT + 1}th request from one client IP in an hour is refused`, async ({ browser }) => {
    // One proxy of ours (TRUSTED_PROXY_HOPS default 1) appends the client address to
    // X-Forwarded-For; the context sends that header, so this is the address the server reads.
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    const ipHash = hashClientIp(ip, process.env.AUTH_SECRET);
    expect(ipHash).not.toBeNull();
    await withSystemScope('platform-admin', 'e2e.public-lead.seed', (tx) =>
      tx.publicLead.createMany({
        data: Array.from({ length: PUBLIC_LEAD_IP_LIMIT }, (_, i) => ({
          name: `Aynı IP ${i}`,
          email: email(`ip-${i}`),
          organisation: 'IP Belediyesi',
          consentVersion: PUBLIC_LEAD_CONSENT.version,
          consentAt: new Date(),
          source: 'fon-hazirlik',
          locale: 'tr',
          ipHash,
        })),
      }),
    );

    const { context, page } = await anonymousPage(browser, undefined, { 'x-forwarded-for': ip });
    await page.goto(TR_RESULT);
    const address = email('ip-new');
    await fillTr(page, { name: 'Yeni Adres', email: address, organisation: 'IP Belediyesi' });
    await page.getByLabel(/açık rıza veriyorum/).check();
    await page.getByRole('button', { name: 'Gönder' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Kısa sürede çok fazla talep gönderildi.' })).toBeVisible();
    expect(await leadsFor(address)).toHaveLength(0);
    await context.close();
  });

  test('EN at 390 px: the form fits, sends, and the row is stored with locale en', async ({ browser }) => {
    const { context, page } = await anonymousPage(browser, { width: 390, height: 844 });
    const address = email('jane');
    await page.goto(EN_RESULT);
    await expect(page.getByRole('heading', { name: 'Talk your result over with an expert' })).toBeVisible();

    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Enter your name (at least 2 characters).')).toBeVisible();
    await expect(page.getByText('Tick the explicit consent box to send the form.')).toBeVisible();

    await page.getByLabel('Your full name').fill('Jane Doe');
    await page.getByLabel('Your e-mail address').fill(address);
    await page.getByLabel('Your organisation').fill('Ankara Metropolitan');
    await page.getByLabel(/I give my explicit consent/).check();

    // No horizontal page scroll at phone width, and the button is in view and full width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const send = page.getByRole('button', { name: 'Send' });
    const box = await send.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${SHOTS}/en-390-filled.png`, fullPage: true });

    await send.click();
    await expect(page.getByRole('heading', { name: 'Thank you, we have your request.' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/en-390-success.png`, fullPage: true });

    const rows = await leadsFor(address);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locale: 'en', province: null, source: 'fon-hazirlik', organisation: 'Ankara Metropolitan' });
    await context.close();
  });
});
