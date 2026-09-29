import { describe, expect, test, vi } from 'vitest';

/**
 * B-1 (TASK-MUM17YBJVAHRR): what the browser receives from the list actions —
 * the dashboard's refresh and B1's action — carries each code's status and no
 * use count. The database row does have one (7, 3 and a used-up 25 here).
 */
const DAY = 86_400_000;
const rows = [
  { codeHint: 'AAAA', usedCount: 7, maxUses: 25 },
  { codeHint: 'BBBB', usedCount: 3, maxUses: 25 },
  { codeHint: 'CCCC', usedCount: 25, maxUses: 25 },
].map((r, i) => ({
  id: `code-${i}`,
  label: null,
  expiresAt: new Date(Date.now() + 30 * DAY),
  revokedAt: null,
  createdAt: new Date(Date.now() - DAY),
  ...r,
}));
const tx = { agencyInviteCode: { findMany: vi.fn(async () => rows) } };

vi.mock('@/lib/db', () => ({
  prisma: {},
  withTenant: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: 'agency-a', userId: 'u1', role: 'TENANT_MEMBER' }),
  requirePlatformAdmin: async () => ({ userId: 'admin' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

describe('invite-code list actions', () => {
  test.each([
    ['ajans listInviteCodes', async () => (await import('./actions')).listInviteCodes()],
    ['B1 listAgencyInviteCodesAction', async () => (await import('@/lib/agency/actions')).listAgencyInviteCodesAction()],
  ])('%s: status per code, no usedCount in the response', async (_name, call) => {
    const res = await call();
    const wire = JSON.stringify(res);
    expect(wire).not.toMatch(/usedCount|"used|left|exhausted/);
    expect(wire).not.toMatch(/"(7|3)"|:7\b|:3\b/); // neither 7 nor 3 anywhere as a value
    expect(res.map((c) => [c.hint, c.status])).toEqual([
      ['AAAA', 'active'],
      ['BBBB', 'active'],
      ['CCCC', 'active'], // used up: no "exhausted" (TASK-MUM2RMN3YIBGC)
    ]);
    // What the select asked for is the database's business; what leaves is not.
    expect(Object.keys(res[0]!).sort()).toEqual(
      ['createdAt', 'expiresAt', 'hint', 'id', 'label', 'maxUses', 'revokedAt', 'status'].sort()
    );
  });
});
