import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * TASK-MUO122UPRPJQH (İNCELEME-77 D-2) — the Evidence Pack page hands the
 * session's role to its loader. Mutant K13 (`loadEvidenceItems(tenantId,
 * 'TENANT_OWNER')`) survived every suite: page-loader-tenant-scope calls the
 * loader directly, so a page that dropped the role would have listed
 * CONFIDENTIAL documents to a MEMBER and everything to a guest partner.
 * Mutant K8 (the level compared case-insensitively) survived too: no test had
 * a lower-case spelling of an open level.
 */

const state = vi.hoisted(() => ({
  scope: { tenantId: 'tenant-p', userId: 'u-p', role: 'MEMBER' },
  loads: [] as unknown[][],
}));

vi.mock('@/lib/tenant', () => ({ requireTenantPage: async () => state.scope }));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
vi.mock('@/app/[locale]/(app)/[workspace]/evidence/data', () => ({
  loadEvidenceItems: async (...args: unknown[]) => {
    state.loads.push(args);
    return [];
  },
}));
vi.mock('@/app/[locale]/(app)/[workspace]/evidence/evidence-client', () => ({ default: () => null }));

const { default: EvidencePage } = await import('@/app/[locale]/(app)/[workspace]/evidence/page');
const { canReadEvidence, evidenceReadWhere } = await import('@/lib/evidence-access');

beforeEach(() => {
  state.loads = [];
});

describe('the Evidence Pack page reads with the session’s role', () => {
  test.each(['MEMBER', 'GUEST_PARTNER', 'TENANT_OWNER'])('%s: the loader gets that role', async (role) => {
    state.scope = { tenantId: 'tenant-p', userId: 'u-p', role };
    await EvidencePage({ params: Promise.resolve({ locale: 'tr', workspace: 'w' }) });
    expect(state.loads).toEqual([['tenant-p', role]]);
  });
});

describe('open levels are matched exactly', () => {
  test.each(['internal', 'Internal', 'public', 'consortium', ' INTERNAL'])('%s counts as confidential below edit_proposal', (level) => {
    expect(canReadEvidence('MEMBER', level)).toBe(false);
    expect(canReadEvidence('TENANT_OWNER', level)).toBe(true);
  });

  test('positive control: the upper-case open levels are readable by a MEMBER, and the list filter names only those', () => {
    for (const level of ['PUBLIC', 'CONSORTIUM', 'INTERNAL']) expect(canReadEvidence('MEMBER', level), level).toBe(true);
    expect(evidenceReadWhere('MEMBER')).toEqual({ confidentiality: { in: ['PUBLIC', 'CONSORTIUM', 'INTERNAL'] } });
  });
});
