import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-136 review — the four M18-F5 AI actions write (credits, the record, a DRAFT, an approval), so
 * each one takes the module WRITE gate (FO-41): a read-only plan grant is refused before the
 * session, the database or the model is touched. And the M9 deal context port validates the
 * client-sent dealId with Zod before any gate or query.
 */

const h = vi.hoisted(() => ({
  assertModuleWrite: vi.fn(),
  assertModuleAccess: vi.fn(),
  requireTenantAction: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/modules/access', () => ({ assertModuleWrite: h.assertModuleWrite, assertModuleAccess: h.assertModuleAccess }));
vi.mock('@/lib/tenant', () => ({ requireTenantAction: h.requireTenantAction, assertTenantActionRole: vi.fn() }));
vi.mock('@/lib/db', () => ({ withTenant: h.withTenant }));
vi.mock('@/lib/ai/prompts/locale', () => ({ promptLocale: async () => 'tr' }));

import {
  applyEnrichmentAction,
  approveEligibilityReportAction,
  generateEligibilityReportAction,
  proposeEnrichmentAction,
} from '@/app/[locale]/(app)/[workspace]/musteri-hatti/ai-actions';
import { dealBriefContextText } from '@/lib/ports/deal-brief-context';

class ReadOnlyRefusal extends Error {
  readonly reason = 'READ_ONLY_PLAN';
}

describe('M18-F5 AI actions — module write gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.assertModuleWrite.mockRejectedValue(new ReadOnlyRefusal('Module M18 is not available (ON/READ_ONLY_PLAN).'));
    h.assertModuleAccess.mockResolvedValue({ allowed: true, status: 'ON' });
  });

  it.each([
    ['proposeEnrichmentAction', () => proposeEnrichmentAction({ organizationId: 'org-1' })],
    ['applyEnrichmentAction', () => applyEnrichmentAction({ organizationId: 'org-1', district: 'Çankaya' })],
    ['generateEligibilityReportAction', () => generateEligibilityReportAction({ organizationId: 'org-1', callId: 'call-1' })],
    ['approveEligibilityReportAction', () => approveEligibilityReportAction({ reportId: 'r1' })],
  ])('%s is refused on a read-only plan before the session or the database', async (_name, run) => {
    const res = await run();
    expect(res).toEqual({ ok: false, code: 'FAILED' });
    expect(h.assertModuleWrite).toHaveBeenCalledWith('M18');
    expect(h.requireTenantAction).not.toHaveBeenCalled();
    expect(h.withTenant).not.toHaveBeenCalled();
  });
});

describe('deal brief context port — dealId validation', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([null, 42, '', '   ', 'x'.repeat(65), { id: 'd' }])('refuses %j with a ZodError before any gate or query', async (raw) => {
    await expect(dealBriefContextText({ tenantId: 't1', role: 'OWNER' }, raw)).rejects.toMatchObject({ name: 'ZodError' });
    expect(h.assertModuleAccess).not.toHaveBeenCalled();
    expect(h.withTenant).not.toHaveBeenCalled();
  });
});
