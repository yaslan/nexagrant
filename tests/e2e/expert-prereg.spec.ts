import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { withSystemScope } from '../../src/lib/system-scope';
import { encodeVerifiedOutcome } from '../../src/lib/expert-prereg/server/verified-outcome';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * FO-20 (TASK-MVBIYE9O6JCQ7) — public expert pre-registration, driven by real
 * typing and clicks: /tr/uzman and /en/experts, the verification redirect
 * page, and the platform-admin table + CSV at /admin/uzman-kayitlari.
 *
 * The end-to-end path (form → mail → verify link → Founding Expert number →
 * admin row) reads the verification mail from mailpit, so it needs the dev
 * server running with SMTP_HOST=localhost SMTP_PORT=1025 and
 * E2E_MAILPIT_URL=http://localhost:8025 here (same opt-in as
 * team-members-ui.spec.ts). Without them that test is skipped, never faked.
 *
 * Every row it creates has an `fo20-e2e-` address and is deleted in afterAll.
 */

const SHOTS = shotsDir('TASK-MVBIYE9O6JCQ7-evidence');
const MAILPIT = process.env.E2E_MAILPIT_URL;
const COOKIE_NAME = 'authjs.session-token';
const EMAIL_PREFIX = 'fo20-e2e-';
const runEmail = (tag: string) => `${EMAIL_PREFIX}${tag}-${Date.now().toString(36)}@e2e.fabrika.test`;

async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
}

async function signIn(page: Page, baseURL: string, admin: boolean) {
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
    secret: e2eAuthSecret(),
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
}

/** Fills every required field by keyboard and clicks, the way a person does. */
async function fillRequired(page: Page, email: string) {
  await page.getByLabel(/Ad Soyad/).fill('Ayşe Deneme');
  await page.getByLabel(/^E-posta/).fill(email);
  const province = page.getByRole('combobox', { name: /^İl/ });
  await province.click();
  await province.pressSequentially('izm');
  await page.keyboard.press('Enter');
  await expect(province).toHaveValue('İzmir');
  // FO-28: leaving and re-entering the field, then Enter, keeps İzmir (not Adana).
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(province).toHaveValue('İzmir');
  await page.getByLabel('Enerji', { exact: true }).check();
  await page.getByLabel('Koordinatör', { exact: true }).check();
  await page.getByLabel('Erasmus+', { exact: true }).check();
  await page.getByLabel('İngilizce', { exact: true }).check();
  await page.getByLabel(/KVKK Aydınlatma Metni/).check();
  await page.getByLabel(/Profilimin uzman rehberinde/).check();
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.afterAll(async () => {
  await withSystemScope('platform-admin', 'e2e.fo20.cleanup', async (tx) => {
    await tx.expertPreRegistration.deleteMany({ where: { email: { startsWith: 'fo20-e2e-' } } });
  });
});

test.describe('expert pre-registration (FO-20)', () => {
  test.beforeEach(async ({ page }) => acceptCookies(page));

  test('consents start unticked; empty submit gives field-level errors and focuses the first', async ({ page }) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/expert-preregistration') && r.method() === 'POST') posts += 1;
    });
    await page.goto('/tr/uzman');
    await expect(page).toHaveTitle('AB Proje Uzmanları Rehberi — Ön Kayıt | FonBridge');
    for (const name of [/KVKK Aydınlatma Metni/, /Profilimin uzman rehberinde/, /FonBridge duyurularını/]) {
      await expect(page.getByLabel(name)).not.toBeChecked();
    }
    await page.getByRole('button', { name: 'Ön kaydı gönder' }).click();
    const fullName = page.getByLabel(/Ad Soyad/);
    await expect(fullName).toBeFocused();
    await expect(fullName).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#ep-fullName-error')).toHaveText('Bu alan zorunludur.');
    await expect(page.locator('#ep-email-error')).toHaveText('Geçerli bir e-posta adresi yazın.');
    await expect(page.locator('#expertiseAreas-error')).toHaveText('Bu alan zorunludur.');
    await expect(page.locator('#ep-kvkkAccepted-error')).toHaveText('Devam etmek için bu onay gereklidir.');
    expect(posts).toBe(0);
    await page.screenshot({ path: `${SHOTS}/e2e-01-empty-submit.png`, fullPage: true });
  });

  test('the KVKK notice opens in a modal and closes with Escape', async ({ page }) => {
    await page.goto('/tr/uzman');
    await page.getByRole('button', { name: 'KVKK Aydınlatma Metni' }).click();
    const dialog = page.getByRole('dialog', { name: 'Uzman Ön Kayıt Aydınlatma Metni' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('[FonBridge tüzel kişi unvanı]');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel(/KVKK Aydınlatma Metni/)).not.toBeChecked();
  });

  test('register → verify mail → Founding Expert number → admin row + CSV; same e-mail refused', async ({
    page,
    baseURL,
  }) => {
    test.skip(!MAILPIT, 'opt-in: set E2E_MAILPIT_URL=http://localhost:8025 and run the server with SMTP_HOST=localhost SMTP_PORT=1025');
    const email = runEmail('flow');

    await page.goto('/tr/uzman?utm_source=e2e&utm_medium=test&utm_campaign=fo20');
    await fillRequired(page, email);
    await page.getByRole('button', { name: 'Ön kaydı gönder' }).click();
    await expect(page.getByRole('heading', { name: 'Teşekkürler, ön kaydınız alındı' })).toBeFocused();
    await expect(page.getByRole('status')).toContainText(email);
    await expect(page.getByTestId('ep-share-linkedin')).toHaveAttribute('href', /linkedin\.com/);
    await page.screenshot({ path: `${SHOTS}/e2e-02-success.png`, fullPage: true });

    let link = '';
    await expect
      .poll(
        async () => {
          const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
          const body = (await res.json()) as { messages?: { ID: string }[] };
          const id = body.messages?.[0]?.ID;
          if (!id) return '';
          const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML?: string; Text?: string };
          const m = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(/\/api\/expert-preregistration\/verify\?token=[A-Za-z0-9_\-.%]+/);
          link = m?.[0] ?? '';
          return link;
        },
        { timeout: 20_000 },
      )
      .not.toBe('');

    // The verify route redirects onto the configured app origin (invitationMailBaseUrl),
    // which need not be this test server's port: follow its Location path here.
    const verify = await page.request.get(link, { maxRedirects: 0 });
    expect(verify.status()).toBe(307);
    const target = new URL(verify.headers()['location'] ?? '');
    expect(target.pathname).toBe('/tr/uzman/dogrulandi');
    await page.goto(`${target.pathname}${target.search}`);
    // FO-29: the result travels only as a signed r; no readable n/error in the URL.
    expect([...target.searchParams.keys()]).toEqual(['r']);
    await expect(page).toHaveURL(/\/tr\/uzman\/dogrulandi\?r=/);
    await expect(page.getByRole('heading', { name: 'E-postanız doğrulandı' })).toBeVisible();
    const founder = page.getByTestId('ep-founder-number');
    const n = (await founder.count()) ? ((await founder.textContent())?.match(/#(\d+)/)?.[1] ?? null) : null;
    if (n) await expect(founder).toHaveText(`Kurucu Uzman numaranız: #${n}`);
    await page.screenshot({ path: `${SHOTS}/e2e-03-verified.png`, fullPage: true });

    // The same address a second time: 409 → message on the e-mail field, focus there.
    await page.goto('/tr/uzman');
    await fillRequired(page, email);
    await page.getByRole('button', { name: 'Ön kaydı gönder' }).click();
    await expect(page.locator('#ep-email-error')).toHaveText('Bu e-posta adresiyle zaten ön kayıt yapılmış.');
    await expect(page.getByLabel(/^E-posta/)).toBeFocused();

    // Admin sees the verified row and downloads the CSV with the same filter.
    await signIn(page, baseURL!, true);
    await page.goto(`/tr/admin/uzman-kayitlari?q=${encodeURIComponent(email)}&status=verified`);
    const row = page.getByTestId('ep-admin-row').filter({ hasText: email });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('İzmir');
    await expect(row).toContainText('Doğrulandı');
    if (n) await expect(row).toContainText(n);
    await page.screenshot({ path: `${SHOTS}/e2e-04-admin.png`, fullPage: true });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('ep-admin-csv').click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = await (await download.createReadStream()).toArray();
    expect(Buffer.concat(csv).toString('utf8')).toContain(email);
  });

  test('a non-admin does not see the admin table', async ({ page, baseURL }) => {
    await signIn(page, baseURL!, false);
    const res = await page.goto('/tr/admin/uzman-kayitlari');
    expect(res?.status()).toBe(404);
    const csv = await page.request.get('/api/admin/expert-preregistrations/export.csv');
    expect([401, 403, 404]).toContain(csv.status());
  });

  test('English page, verified-page errors, 375px without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/en/experts');
    await expect(page).toHaveTitle('EU Project Experts Directory — Pre-registration | FonBridge');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your EU project experience visible');
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/e2e-05-en-375.png`, fullPage: true });
    await page.goto('/tr/uzman');
    await noHorizontalScroll(page);
    const expired = encodeVerifiedOutcome({ outcome: 'expired', founderNumber: null }, { secret: e2eAuthSecret() });
    await page.goto(`/en/experts/verified?r=${expired}`);
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
    await noHorizontalScroll(page);
    await page.goto('/tr/uzman/dogrulandi?error=invalid');
    await expect(page.getByRole('heading', { name: 'Bağlantı geçersiz' })).toBeVisible();
  });

  test('FO-29: a hand-typed ?n=1 or a tampered r is an invalid link, not "verified"', async ({ page }) => {
    await page.goto('/tr/uzman/dogrulandi?n=1');
    await expect(page.getByRole('heading', { name: 'Bağlantı geçersiz' })).toBeVisible();
    await expect(page.getByTestId('ep-founder-number')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/fo29-01-bare-n.png`, fullPage: true });
    const r = encodeVerifiedOutcome({ outcome: 'ok', founderNumber: 1 }, { secret: `${e2eAuthSecret()}-wrong` });
    await page.goto(`/tr/uzman/dogrulandi?r=${r}`);
    await expect(page.getByRole('heading', { name: 'Bağlantı geçersiz' })).toBeVisible();
    await expect(page.getByTestId('ep-founder-number')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/fo29-02-tampered-r.png`, fullPage: true });
  });
});
