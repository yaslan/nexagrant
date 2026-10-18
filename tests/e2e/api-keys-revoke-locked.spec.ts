import { randomBytes, createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * FO-81 — with M1 closed, the API keys page still lets the tenant withdraw its
 * keys: the gate stays, and under it the active keys with "revoke" and "revoke
 * all". A member sees the list without the buttons. Revoking writes an
 * AuditEvent, and the revoked key is refused by /api/v1 afterwards.
 *
 * The tenant sits on `pro` (which sells M1), so the only switch in each test is
 * the `ModuleState` row: a refusal here is `MODULE_OFF`, never the plan.
 */
const TENANT = 'fo81-e2e-tenant';
const WS = 'fo81-e2e';
const WORKSPACE = { id: 'fo81-e2e-workspace', slug: WS, name: 'FO-81 e2e' };
const OWNER = { id: 'fo81-e2e-owner', email: 'fo81-owner@fabrika.test' };
const MEMBER = { id: 'fo81-e2e-member', email: 'fo81-member@fabrika.test' };
const SHOTS = shotsDir('TASK-MVDQ4CRNC2WL');

const TR_PAGE = `/tr/${WS}/ayarlar/api-anahtarlari`;
const EN_PAGE = `/en/${WS}/settings/api-keys`;

const panel = (page: Page) => page.locator('section[aria-labelledby="revoke-api-keys-title"]');
const gate = (page: Page) => page.locator('section[role="alert"]');
const confirmDialog = (page: Page) => page.getByRole('alertdialog');

async function setM1(status: 'ON' | 'OFF', tenantId = TENANT) {
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId: 'M1' } },
    create: { tenantId, moduleId: 'M1', status, changedBy: 'fo81 e2e' },
    update: { status },
  });
}

/** A key row written straight to the table; only the verifier and the prefix matter. */
async function seedKey(name: string, tenantId = TENANT) {
  const rawKey = `fp_live_${randomBytes(24).toString('hex')}`;
  const row = await prisma.apiKey.create({
    data: {
      tenantId,
      name,
      keyHash: createHash('sha256').update(rawKey).digest('hex'),
      prefix: rawKey.slice(0, 12),
    },
    select: { id: true },
  });
  return { ...row, rawKey };
}

test.describe('API keys with M1 closed — withdrawal stays open (FO-81)', () => {
  test.beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'FO-81 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.subscription.upsert({
      where: { tenantId: TENANT },
      create: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' },
      update: { planId: 'pro', status: 'ACTIVE', planVersionId: null },
    });
    await seedIdentity(
      { userId: OWNER.id, email: OWNER.email, role: 'TENANT_OWNER', tenantId: TENANT },
      WORKSPACE,
    );
    await seedIdentity(
      { userId: MEMBER.id, email: MEMBER.email, role: 'MEMBER', tenantId: TENANT, workspaceIds: [WORKSPACE.id] },
    );
  });

  test.beforeEach(async () => {
    await prisma.apiKey.deleteMany({ where: { tenantId: TENANT } });
  });

  test.afterAll(async () => {
    await cleanupIdentity([OWNER.id, MEMBER.id]);
  });

  test('owner creates a key, M1 closes, the key is revoked from under the lock, and /api/v1 refuses it', async ({ page }) => {
    await setM1('ON');
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });

    // M1 open: create the key through the real form, and keep the raw value the
    // page shows once, to replay it against the partner API later.
    await page.goto(TR_PAGE);
    await page.locator('input[placeholder="Örn: SAP ERP Pipeline Senkronu"]').fill('E2E iptal anahtarı');
    await page.getByRole('button', { name: 'API Key Oluştur (fp_live_...)' }).click();
    const rawKeyText = page.locator('span.select-all');
    await expect(rawKeyText).toContainText('fp_live_');
    const rawKey = (await rawKeyText.innerText()).trim();

    const created = await prisma.apiKey.findFirstOrThrow({
      where: { tenantId: TENANT, name: 'E2E iptal anahtarı' },
    });

    // M1 closed: the lock stays, and the panel lists the real key — not the demo rows.
    await setM1('OFF');
    await page.goto(TR_PAGE);
    await expect(gate(page)).toContainText(trMessages.ModuleGate.title);
    await expect(panel(page)).toContainText('E2E iptal anahtarı');
    await expect(page.locator('body')).not.toContainText('ERP Entegrasyonu & B2B Pipeline');
    await expect(page.getByRole('button', { name: 'API Key Oluştur (fp_live_...)' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/m1-off-revoke-tr.png`, fullPage: true });

    // Revoke one: the confirmation is a real alertdialog, and cancel leaves the key.
    await panel(page).getByRole('button', { name: '"E2E iptal anahtarı" anahtarını iptal et' }).click();
    await expect(confirmDialog(page)).toBeVisible();
    await confirmDialog(page).getByRole('button', { name: 'Vazgeç' }).click();
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(panel(page)).toContainText('E2E iptal anahtarı');

    await panel(page).getByRole('button', { name: '"E2E iptal anahtarı" anahtarını iptal et' }).click();
    await page.screenshot({ path: `${SHOTS}/m1-off-confirm-tr.png`, fullPage: true });
    await confirmDialog(page).getByRole('button', { name: 'İptal et', exact: true }).click();

    await expect(page.locator('body')).not.toContainText('E2E iptal anahtarı');
    expect(await prisma.apiKey.findUnique({ where: { id: created.id } })).toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: TENANT, type: 'apiKey.revoked', target: created.id },
    });
    expect(audit?.actorId).toBe(OWNER.id);

    // M1 open again: the revoked key is refused, not merely hidden.
    await setM1('ON');
    const res = await page.request.get('/api/v1/partners?limit=1', {
      headers: { 'x-api-key': rawKey },
    });
    expect(res.status()).toBe(401);
  });

  test('owner revokes all keys at once, in English, and every revoke is audited', async ({ page }) => {
    const a = await seedKey('E2E bulk A');
    const b = await seedKey('E2E bulk B');
    await setM1('OFF');
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });

    await page.goto(EN_PAGE);
    await expect(gate(page)).toContainText(enMessages.ModuleGate.title);
    await expect(panel(page)).toContainText(enMessages.ApiKeysSettings.revoke.title);
    await expect(panel(page)).toContainText('E2E bulk A');
    await expect(panel(page)).toContainText('E2E bulk B');
    await page.screenshot({ path: `${SHOTS}/m1-off-revoke-en.png`, fullPage: true });

    await panel(page).getByRole('button', { name: enMessages.ApiKeysSettings.revoke.revokeAll }).click();
    await expect(confirmDialog(page)).toContainText(enMessages.ApiKeysSettings.revoke.confirmAllTitle);
    await confirmDialog(page).getByRole('button', { name: enMessages.ApiKeysSettings.revoke.confirm, exact: true }).click();

    // Last key gone: the panel leaves the page, so assert on the body, not the panel.
    await expect(page.locator('body')).not.toContainText('E2E bulk A');
    await expect(page.locator('body')).not.toContainText('E2E bulk B');
    expect(await prisma.apiKey.count({ where: { tenantId: TENANT } })).toBe(0);

    const audits = await prisma.auditEvent.findMany({
      where: { tenantId: TENANT, type: 'apiKey.revoked', target: { in: [a.id, b.id] } },
    });
    expect(audits).toHaveLength(2);
  });

  test('a member sees the active keys but no revoke control', async ({ page }) => {
    await seedKey('E2E member view');
    await setM1('OFF');
    await signInAs(page, { id: MEMBER.id, email: MEMBER.email, tenantId: TENANT, role: 'MEMBER' });

    await page.goto(TR_PAGE);
    await expect(gate(page)).toContainText(trMessages.ModuleGate.title);
    await expect(panel(page)).toContainText('E2E member view');
    await expect(panel(page)).toContainText(trMessages.ApiKeysSettings.revoke.error.forbidden);
    await expect(panel(page).getByRole('button')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/m1-off-member-tr.png`, fullPage: true });
  });
});

/**
 * FO-89 — the revoke action is the one place a key is withdrawn, so it must not be
 * able to withdraw another tenant's key. The owner of TENANT, on the real page, revokes
 * one of their own keys; the request that click sends is captured, and the same action
 * is then replayed with another tenant's key id in its body, one at a time and as the
 * bulk loop does it. Tenant B's keys must survive, still authenticate on /api/v1, and
 * leave no AuditEvent for tenant A.
 */
const OTHER = 'fo89-e2e-other-tenant';

test.describe('API keys — one tenant cannot withdraw another tenant\'s keys (FO-89)', () => {
  test.beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'FO-81 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.subscription.upsert({
      where: { tenantId: TENANT },
      create: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' },
      update: { planId: 'pro', status: 'ACTIVE', planVersionId: null },
    });
    await prisma.tenant.upsert({
      where: { id: OTHER },
      create: { id: OTHER, name: 'FO-89 e2e other tenant', slug: OTHER, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.subscription.upsert({
      where: { tenantId: OTHER },
      create: { tenantId: OTHER, planId: 'pro', status: 'ACTIVE' },
      update: { planId: 'pro', status: 'ACTIVE', planVersionId: null },
    });
    await seedIdentity(
      { userId: OWNER.id, email: OWNER.email, role: 'TENANT_OWNER', tenantId: TENANT },
      WORKSPACE,
    );
  });

  test.beforeEach(async () => {
    await prisma.apiKey.deleteMany({ where: { tenantId: { in: [TENANT, OTHER] } } });
  });

  test.afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { tenantId: { in: [TENANT, OTHER] } } });
    await cleanupIdentity([OWNER.id]);
  });

  test('the owner of A revokes B\'s keys one by one and in bulk: B keeps them, B\'s keys still work, no audit for A', async ({ page }) => {
    await setM1('OFF');
    await setM1('ON', OTHER);
    const own = await seedKey('FO-89 own key');
    const b1 = await seedKey('FO-89 other key 1', OTHER);
    const b2 = await seedKey('FO-89 other key 2', OTHER);
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });

    await page.goto(TR_PAGE);
    await expect(panel(page)).toContainText('FO-89 own key');
    // Lock screen lists A's keys only: B's rows never reach the page.
    await expect(panel(page)).not.toContainText('FO-89 other key');
    await expect(page.locator('body')).not.toContainText(b1.id);

    // A real click on A's own key: this is the request the page sends, kept as the probe.
    const sent = page.waitForRequest(
      (req) => req.method() === 'POST' && req.headers()['next-action'] !== undefined && (req.postData() ?? '').includes(own.id),
    );
    await panel(page).getByRole('button', { name: '"FO-89 own key" anahtarını iptal et' }).click();
    await confirmDialog(page).getByRole('button', { name: 'İptal et', exact: true }).click();
    const req = await sent;
    const body = req.postData() ?? '';
    const headers = {
      'next-action': req.headers()['next-action'] ?? '',
      'content-type': req.headers()['content-type'] ?? 'text/plain;charset=UTF-8',
    };

    // The same action, same session, B's id in place of A's: one key at a time...
    const single = await page.request.post(req.url(), { headers, data: body.replace(own.id, b1.id) });
    expect(single.status()).toBe(200);
    // ...then as the bulk loop sends it, every id in turn.
    for (const id of [b1.id, b2.id]) {
      const res = await page.request.post(req.url(), { headers, data: body.replace(own.id, id) });
      expect(res.status()).toBe(200);
    }

    expect(await prisma.apiKey.count({ where: { id: { in: [b1.id, b2.id] } } })).toBe(2);
    expect(
      await prisma.auditEvent.count({ where: { tenantId: TENANT, type: 'apiKey.revoked', target: { in: [b1.id, b2.id] } } }),
    ).toBe(0);
    // Control: the probe did reach the real revoke, so A's own key is audited.
    expect(
      await prisma.auditEvent.count({ where: { tenantId: TENANT, type: 'apiKey.revoked', target: own.id } }),
    ).toBe(1);

    // B's keys still authenticate with M1 open for B.
    const api = await page.request.get('/api/v1/partners?limit=1', { headers: { 'x-api-key': b1.rawKey } });
    expect(api.status()).toBe(200);
  });
});
