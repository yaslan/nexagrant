import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { publicLeadStuckAfterMinutes } from '../../src/lib/env';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * NG-182 — the read-only "Stuck (no copy)" list on Admin > Lead routing.
 *
 * Seeds two leads that are `routed` but have no LeadContact / Deal copy in their tenant, both older than
 * PUBLIC_LEAD_STUCK_AFTER_MINUTES: one to a live consultancy, one to a soft-deleted one. Both must show
 * in the stuck section in TR and EN, the deleted tenant flagged, and the section has no action button
 * (no re-send). A third routed lead that HAS a copy must not show.
 */

const SHOTS = shotsDir('NG-182-evidence');
const TENANT_ID = 'stuck-e2e-consultancy';
const TENANT_NAME = 'Takılı Lead E2E Kuruluş';
const GONE_TENANT_ID = 'stuck-e2e-gone';
const GONE_TENANT_NAME = 'Silinmiş E2E Kuruluş';
const STUCK_ID = 'stuck-e2e-a-live';
const GONE_ID = 'stuck-e2e-b-gone';
const COPIED_ID = 'stuck-e2e-c-copied';
const EMAIL_SUFFIX = '@stuck-e2e.fabrika.test';
const ADMIN = {
  userId: 'stuck-e2e-admin',
  email: 'stuck-e2e-admin@fabrika.test',
  name: 'Stuck Lead Admin',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
  workspaceIds: [] as string[],
  isPlatformAdmin: true,
};

async function teardown() {
  await cleanupIdentity([ADMIN.userId]);
  await withSystemScope('platform-admin', 'e2e.lead-routes-stuck.cleanup', async (tx) => {
    await tx.publicLead.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
    // Cascades the copy (LeadOrganization / LeadContact).
    await tx.tenant.deleteMany({ where: { id: { in: [TENANT_ID, GONE_TENANT_ID] } } });
  });
}

const stuckSection = (page: Page) => page.getByTestId('lead-routes-stuck');
const rowOf = (page: Page, leadId: string) => stuckSection(page).getByRole('row').filter({ hasText: leadId });

test.describe.configure({ mode: 'serial' });

test.describe('stuck routed leads (Admin > Lead routing)', () => {
  test.beforeAll(async () => {
    await teardown();
    const routedAt = new Date(Date.now() - publicLeadStuckAfterMinutes() * 3 * 60_000);
    const lead = (id: string, tenantId: string, organisation: string) => ({
      id,
      name: 'Stuck E2E Visitor',
      email: `${id}${EMAIL_SUFFIX}`,
      organisation,
      province: 'Rize',
      consentVersion: 'e2e',
      consentAt: routedAt,
      transferConsent: true,
      transferConsentVersion: 'e2e',
      transferConsentAt: routedAt,
      routeStatus: 'routed',
      routedTenantId: tenantId,
      routedAt,
      createdAt: routedAt,
      source: 'e2e',
      locale: 'tr',
    });
    await withSystemScope('platform-admin', 'e2e.lead-routes-stuck.setup', async (tx) => {
      await tx.tenant.create({ data: { id: TENANT_ID, name: TENANT_NAME, slug: TENANT_ID, country: 'TR', orgType: 'CONSULTANCY' } });
      await tx.tenant.create({
        data: { id: GONE_TENANT_ID, name: GONE_TENANT_NAME, slug: GONE_TENANT_ID, country: 'TR', orgType: 'CONSULTANCY', deletedAt: new Date() },
      });
      await tx.publicLead.create({ data: lead(STUCK_ID, TENANT_ID, 'Takılı Belediye') });
      await tx.publicLead.create({ data: lead(GONE_ID, GONE_TENANT_ID, 'Sahipsiz Kooperatif') });
      await tx.publicLead.create({ data: lead(COPIED_ID, TENANT_ID, 'Teslim Edilmiş Dernek') });
      const org = await tx.leadOrganization.create({ data: { tenantId: TENANT_ID, name: 'Teslim Edilmiş Dernek' } });
      await tx.leadContact.create({
        data: { tenantId: TENANT_ID, organizationId: org.id, fullName: 'Stuck E2E Visitor', sourceRef: `public-lead:${COPIED_ID}` },
      });
    });
    await seedIdentity(ADMIN);
  });

  test.afterAll(async () => {
    await teardown();
    await prisma.$disconnect();
  });

  async function open(page: Page, locale: 'tr' | 'en') {
    await signInAs(page, {
      id: ADMIN.userId,
      email: ADMIN.email,
      name: ADMIN.name,
      tenantId: ADMIN.tenantId,
      role: ADMIN.role,
      isPlatformAdmin: true,
    });
    await page.goto(`/${locale}/admin/lead-routes`);
  }

  test('TR: the stuck lead and the one of a deleted tenant are listed, the delivered one is not, no button', async ({ page }) => {
    await open(page, 'tr');
    await expect(page.getByRole('heading', { name: 'Takılı lead’ler (kopyasız)' })).toBeVisible();
    await expect(stuckSection(page)).toContainText(`${publicLeadStuckAfterMinutes()} dakikadan uzun`);
    await expect(stuckSection(page).getByRole('columnheader', { name: 'Yönlendirilen kuruluş' })).toBeVisible();

    await expect(rowOf(page, STUCK_ID)).toContainText(TENANT_NAME);
    await expect(rowOf(page, STUCK_ID)).toContainText('Takılı Belediye');
    await expect(rowOf(page, STUCK_ID)).not.toContainText('Kuruluş silinmiş');
    await expect(rowOf(page, GONE_ID)).toContainText(GONE_TENANT_NAME);
    await expect(rowOf(page, GONE_ID)).toContainText('Kuruluş silinmiş');
    await expect(rowOf(page, COPIED_ID)).toHaveCount(0);
    // Read-only: no re-send (or any) button in the section.
    await expect(stuckSection(page).getByRole('button')).toHaveCount(0);
    await stuckSection(page).scrollIntoViewIfNeeded();
    await stuckSection(page).screenshot({ path: `${SHOTS}/01-tr-stuck-list.png` });
  });

  test('EN: the same list in English', async ({ page }) => {
    await open(page, 'en');
    await expect(page.getByRole('heading', { name: 'Stuck leads (no copy)' })).toBeVisible();
    await expect(stuckSection(page)).toContainText(`more than ${publicLeadStuckAfterMinutes()} minutes`);
    await expect(stuckSection(page).getByRole('columnheader', { name: 'Routed to' })).toBeVisible();

    await expect(rowOf(page, STUCK_ID)).toContainText(TENANT_NAME);
    await expect(rowOf(page, GONE_ID)).toContainText('Consultancy deleted');
    await expect(rowOf(page, COPIED_ID)).toHaveCount(0);
    await expect(stuckSection(page).getByRole('button')).toHaveCount(0);
    await stuckSection(page).scrollIntoViewIfNeeded();
    await stuckSection(page).screenshot({ path: `${SHOTS}/02-en-stuck-list.png` });
  });
});
