import { test, expect } from '@playwright/test';
import { withSystemScope } from '@/lib/system-scope';
import { notifyExpiringEvidence } from '@/lib/notifications/evidence-expiring';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';
import { shotsDir } from './fixtures/shots';
import { requireId } from '../helpers/teardown-guard';

/**
 * TASK-MUVR7HQQZVA2Z — an EVIDENCE_EXPIRING notification written by the real
 * producer (not a hand-made row) shows in the bell with its TR and EN text.
 * The producer's rules are pinned in tests/evidence-expiring.live.test.ts.
 *
 * Own rows only: the tenant created here is deleted in afterAll.
 */

const RUN = Date.now().toString(36);
const SHOTS = shotsDir('TASK-MUVR7HQQZVA2Z-evidence-expiring');
const U = {
  tenantId: `e2e-evexp-${RUN}`,
  userId: `e2e-evexp-user-${RUN}`,
  email: `evexp-${RUN}@e2e-evexp.test`,
  ws: { id: `e2e-evexp-ws-${RUN}`, slug: `evexp-${RUN}`, name: 'EvExp' },
};
// Noon UTC, 10 days out: the same calendar date in every time zone the page may render in.
const VALID_UNTIL = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 10, 12));
const DATE = VALID_UNTIL.toISOString().slice(0, 10);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await withSystemScope('platform-admin', 'e2e.evexp.seed', async (tx) => {
    await tx.tenant.create({
      data: { id: U.tenantId, name: `EvExp ${RUN}`, slug: U.tenantId, country: 'TR', orgType: 'SME' },
    });
  });
  await seedIdentity({ userId: U.userId, email: U.email, role: 'TENANT_OWNER', tenantId: U.tenantId }, U.ws);
  await withSystemScope('platform-admin', 'e2e.evexp.evidence', (tx) =>
    tx.evidence.create({
      data: {
        tenantId: U.tenantId, kind: 'certificate', title: `KOBİ beyannamesi ${RUN}`, body: '',
        status: 'VALID', validUntil: VALID_UNTIL, createdBy: U.userId,
      },
    })
  );
  const r = await notifyExpiringEvidence({ tenantIds: [U.tenantId] });
  expect(r.notificationsWritten).toBe(1);
});

test.afterAll(async () => {
  await cleanupIdentity([U.userId]);
  await withSystemScope('platform-admin', 'e2e.evexp.cleanup', async (tx) => {
    const tenantId = requireId(U.tenantId, 'tenantId');
    await tx.notification.deleteMany({ where: { tenantId } });
    await tx.evidence.deleteMany({ where: { tenantId } });
    await tx.workspace.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
});

const token = { id: U.userId, email: U.email, tenantId: U.tenantId, role: 'TENANT_OWNER' };

test('EN bell: unread dot and "Document expiring soon · Valid until <date>"', async ({ page }) => {
  await signInAs(page, token);
  await page.goto(`/en/${U.ws.slug}/dashboard`);
  const bell = page.getByRole('button', { name: 'Notifications' });
  await expect(bell.locator('span')).toHaveCount(1);
  await bell.click();
  await expect(page.getByText('Document expiring soon')).toBeVisible();
  await expect(page.getByText(`Valid until ${DATE}`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/en-bell-evidence-expiring.png` });
});

test('TR bell: "Belge yakında sona erecek · Geçerli tarih: <tarih>"', async ({ page }) => {
  await signInAs(page, token);
  await page.goto(`/tr/${U.ws.slug}/panel`);
  await page.getByRole('button', { name: 'Bildirimler' }).click();
  await expect(page.getByText('Belge yakında sona erecek')).toBeVisible();
  await expect(page.getByText(`Geçerli tarih: ${DATE}`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tr-bell-evidence-expiring.png` });
});
