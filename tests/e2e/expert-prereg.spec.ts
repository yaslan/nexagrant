import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { withSystemScope } from '../../src/lib/system-scope';
import { encodeVerifiedOutcome } from '../../src/lib/expert-prereg/server/verified-outcome';
import { EXPERT_PREREG_CONSENT_VERSION, FOUNDER_SEAT_LIMIT, VERIFY_TOKEN_TTL_MS } from '../../src/lib/expert-prereg/server/constants';
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

// FO-47: the numbers on the page come from constants.ts, so the expected ones do too.
// next-intl does not type message arguments: a dropped {limit}/{hours} still compiles
// and only shows up here, as missing copy or a raw `ExpertPrereg.` key.
const verifyHours = VERIFY_TOKEN_TTL_MS / 3_600_000;
const FOUNDER_COPY = {
  tr: { strip: `İlk ${FOUNDER_SEAT_LIMIT} kayıt`, full: 'Kurucu kadro tamamlandı, kayıtlar açık', meta: `İlk ${FOUNDER_SEAT_LIMIT}` },
  en: {
    strip: `The first ${FOUNDER_SEAT_LIMIT} sign-ups`,
    full: 'The founding cohort is complete — registration is still open',
    meta: `first ${FOUNDER_SEAT_LIMIT}`,
  },
};

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

/** Fills every required field (FO-25: Diller is optional and stays empty) by keyboard and clicks, the way a person does. */
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
  await page.getByLabel(/^Unvan/).fill('Proje Koordinatörü');
  await page.getByLabel(/^Kurum/).fill('Ege Deneme Üniversitesi');
  await page.getByLabel('Enerji', { exact: true }).check();
  await page.getByLabel('Koordinatör', { exact: true }).check();
  await page.getByLabel('Erasmus+', { exact: true }).check();
  await page.getByLabel(/KVKK Aydınlatma Metni/).check();
  await page.getByLabel(/Profilimin uzman rehberinde/).check();
}

/** No message key reaches the page untranslated (a missing ICU argument renders the key). */
async function noRawMessageKeys(page: Page) {
  await expect(page.getByText(/ExpertPrereg\./)).toHaveCount(0);
}

/**
 * The founder strip and the meta description name the seat limit. The seats left
 * depend on the database, so they are not checked. Once the cohort is full the strip
 * no longer names the limit: its own copy is accepted then, and the meta description
 * still carries the limit.
 */
async function expectFounderLimit(page: Page, locale: 'tr' | 'en') {
  const copy = FOUNDER_COPY[locale];
  const strip = page.getByTestId('ep-founder-strip');
  await expect(strip).toBeVisible();
  if ((await strip.textContent())?.trim() === copy.full) {
    test.info().annotations.push({ type: 'founder_full', description: `${locale}: strip shows the full-cohort copy` });
  } else {
    await expect(strip).toContainText(copy.strip);
  }
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', new RegExp(copy.meta));
  await noRawMessageKeys(page);
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
    await expect(page).toHaveTitle('AB Proje Uzmanları Rehberi — Ön Kayıt | NexaGrant');
    await expectFounderLimit(page, 'tr');
    for (const name of [/KVKK Aydınlatma Metni/, /Profilimin uzman rehberinde/]) {
      await expect(page.getByLabel(name)).not.toBeChecked();
    }
    // FO-144 (K-572235): the marketing box is gone.
    await expect(page.locator('#ep-marketingConsent')).toHaveCount(0);
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

  // NG-7 (madde 4): the pre-registration is free. The form carries no price, fee, card or payment field,
  // and its text has no amount; the registration itself is covered by the test that follows.
  test('NG-7: the free pre-registration form asks for no payment, fee or price', async ({ page }) => {
    await page.goto('/tr/uzman');
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Ön kaydı gönder' }) });
    await expect(form).toHaveCount(1);
    const paymentField = /price|fee|card|iban|payment|amount|fiyat|ucret|ücret|odeme|ödeme|kart|tutar/i;
    const fieldNames = await form.locator('input, select, textarea').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('name') ?? ''} ${el.id} ${el.getAttribute('autocomplete') ?? ''}`)
    );
    expect(fieldNames.filter((name) => paymentField.test(name))).toEqual([]);
    const formText = (await form.innerText()).toLowerCase();
    expect(formText).not.toMatch(/₺|€|\$|ücret|ödeme|kredi kart|fiyat|abonelik/);
    await page.screenshot({ path: `${SHOTS}/ng-7-expert-prereg-no-fee.png`, fullPage: true });
  });

  // FO-25 (K-516717): Kurum is required on its own; leaving it blank keeps the form here.
  test('no organisation: field error on Kurum, focus there, nothing is posted', async ({ page }) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/expert-preregistration') && r.method() === 'POST') posts += 1;
    });
    await page.goto('/tr/uzman');
    await fillRequired(page, runEmail('noorg'));
    await page.getByLabel(/^Kurum/).fill('');
    await page.getByRole('button', { name: 'Ön kaydı gönder' }).click();
    const org = page.getByLabel(/^Kurum/);
    await expect(org).toBeFocused();
    await expect(org).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#ep-organization-error')).toHaveText('Bu alan zorunludur.');
    await expect(page.locator('#languages-error')).toHaveCount(0);
    expect(posts).toBe(0);
    await page.screenshot({ path: `${SHOTS}/e2e-05-no-organisation.png`, fullPage: true });
  });

  test('the KVKK notice opens in a modal and closes with Escape', async ({ page }) => {
    await page.goto('/tr/uzman');
    await page.getByRole('button', { name: 'KVKK Aydınlatma Metni' }).click();
    const dialog = page.getByRole('dialog', { name: 'Uzman Ön Kayıt Aydınlatma Metni' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.');
    // FO-332: the notice names the product NexaGrant, not FonBridge, and is the version the server stores.
    await expect(dialog).toContainText('NexaGrant');
    await expect(dialog).toContainText(`Sürüm: ${EXPERT_PREREG_CONSENT_VERSION}`);
    await expect(dialog).not.toContainText('FonBridge');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel(/KVKK Aydınlatma Metni/)).not.toBeChecked();
  });

  test('FO-332: the English KVKK notice names NexaGrant and carries the stored version', async ({ page }) => {
    await page.goto('/en/experts');
    await page.getByRole('button', { name: 'KVKK Privacy Notice' }).click();
    const dialog = page.getByRole('dialog', { name: 'Expert Pre-registration Privacy Notice' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('NexaGrant');
    await expect(dialog).toContainText(`Version: ${EXPERT_PREREG_CONSENT_VERSION}`);
    await expect(dialog).toContainText('Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.');
    await expect(dialog).not.toContainText('FonBridge');
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
    await expect(page.getByRole('status')).toContainText(`${verifyHours} saat`);
    await noRawMessageKeys(page);
    await expect(page.getByTestId('ep-share-linkedin')).toHaveAttribute('href', /linkedin\.com/);
    await page.screenshot({ path: `${SHOTS}/e2e-02-success.png`, fullPage: true });
    // FO-332: the stored row names the notice version the visitor saw (kvkk-v4, product NexaGrant).
    const stored = await withSystemScope('platform-admin', 'e2e.fo332.read', (tx) =>
      tx.expertPreRegistration.findUnique({ where: { email }, select: { consentTextVersion: true } }),
    );
    expect(stored?.consentTextVersion).toBe(EXPERT_PREREG_CONSENT_VERSION);
    expect(stored?.consentTextVersion).toBe('kvkk-v4');

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
    await expect(row).toContainText('Ege Deneme Üniversitesi');
    await expect(row).toContainText('Doğrulandı');
    if (n) await expect(row).toContainText(n);
    await page.screenshot({ path: `${SHOTS}/e2e-04-admin.png`, fullPage: true });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('ep-admin-csv').click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = await (await download.createReadStream()).toArray();
    expect(Buffer.concat(csv).toString('utf8')).toContain(email);
    expect(Buffer.concat(csv).toString('utf8')).toContain('Ege Deneme Üniversitesi');
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
    await expect(page).toHaveTitle('EU Project Experts Directory — Pre-registration | NexaGrant');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make your EU project experience visible');
    await expectFounderLimit(page, 'en');
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/e2e-05-en-375.png`, fullPage: true });
    await page.goto('/tr/uzman');
    await noHorizontalScroll(page);
    const expired = encodeVerifiedOutcome({ outcome: 'expired', founderNumber: null }, { secret: e2eAuthSecret() });
    await page.goto(`/en/experts/verified?r=${expired}`);
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.locator('body')).toContainText(`valid for ${verifyHours} hours`);
    await noRawMessageKeys(page);
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
