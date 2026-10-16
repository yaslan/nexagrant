import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MVBCE3QTT3X67 (FO-6) — the list the app shell's `ModuleProvider` is fed.
 *
 * The sidebar, the opportunity module tabs and the cross-links show a module only
 * when `listAccessibleModules` returns it. That list must be exactly the set of
 * modules `checkModuleAccess` would let in, one by one: an entry point the gate then
 * refuses is a dead link, and a gate-open module with no entry point is the orphan
 * page this card exists to remove. Both read through the same `decideModuleAccess`.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  getEntitlements: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: h.auth }));

vi.mock('@/lib/db', () => ({
  prisma: {},
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb({ moduleState: { findUnique: h.findUnique, findMany: h.findMany } } as never),
}));

vi.mock('@/lib/billing', () => ({ getEntitlements: h.getEntitlements }));

import { checkModuleAccess, listAccessibleModules } from '@/lib/modules/access';
import { getAllManifests } from '@/lib/modules/registry';
import type { ModuleId } from '@/lib/modules/types';

const ALL = getAllManifests().map((m) => m.id);

/** The `pro` grant in PLAN_GRANTS. */
const PRO = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8'];

function arrange(opts: {
  rows: Partial<Record<ModuleId, string>>;
  allowedModules: string[];
  role?: string;
  isPlatformAdmin?: boolean;
}) {
  h.auth.mockResolvedValue({
    user: { id: 'user-1' },
    tenantId: 'tenant-1',
    role: opts.role ?? 'MEMBER',
    workspaceIds: ['ws-1'],
    isPlatformAdmin: opts.isPlatformAdmin ?? false,
  });
  h.findMany.mockResolvedValue(Object.entries(opts.rows).map(([moduleId, status]) => ({ moduleId, status })));
  h.findUnique.mockImplementation(({ where }: { where: { tenantId_moduleId: { moduleId: ModuleId } } }) => {
    const status = opts.rows[where.tenantId_moduleId.moduleId];
    return Promise.resolve(status ? { status } : null);
  });
  h.getEntitlements.mockResolvedValue({ allowedModules: opts.allowedModules });
}

async function oneByOne(): Promise<ModuleId[]> {
  const open: ModuleId[] = [];
  for (const id of ALL) if ((await checkModuleAccess(id)).allowed) open.push(id);
  return open;
}

describe('listAccessibleModules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps an ON module the plan does not sell out of the list (pro, M9–M11 ON)', async () => {
    arrange({
      rows: { M1: 'ON', M2: 'ON', M5: 'ON', M7: 'OFF', M8: 'ON', M9: 'ON', M10: 'ON', M11: 'ON' },
      allowedModules: PRO,
    });

    const list = await listAccessibleModules();

    expect(list).toEqual(['M1', 'M2', 'M5', 'M8']);
    expect(list).toEqual(await oneByOne());
  });

  it('keeps an OFF module the plan does sell out of the list (ultra, M7 OFF)', async () => {
    arrange({
      rows: { M2: 'ON', M7: 'OFF', M9: 'ON', M10: 'ON', M11: 'ON' },
      allowedModules: ALL,
    });

    const list = await listAccessibleModules();

    expect(list).toEqual(['M2', 'M9', 'M10', 'M11']);
    expect(list).not.toContain('M7');
    expect(list).toEqual(await oneByOne());
  });

  it('treats a missing ModuleState row as OFF', async () => {
    arrange({ rows: {}, allowedModules: ALL });
    expect(await listAccessibleModules()).toEqual([]);
  });

  it('applies the status audience the same way as the gate (PILOT, DEV)', async () => {
    const rows = { M2: 'PILOT', M6: 'DEV', M8: 'ON' } as const;

    arrange({ rows, allowedModules: ALL, role: 'MEMBER' });
    const member = await listAccessibleModules();
    expect(member).toEqual(await oneByOne());

    arrange({ rows, allowedModules: ALL, role: 'MEMBER', isPlatformAdmin: true });
    const staff = await listAccessibleModules();
    expect(staff).toEqual(await oneByOne());
    expect(staff).toEqual(expect.arrayContaining(['M2', 'M6', 'M8']));
  });

  it('returns nothing for a session without a tenant', async () => {
    h.auth.mockResolvedValue(null);
    expect(await listAccessibleModules()).toEqual([]);
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
