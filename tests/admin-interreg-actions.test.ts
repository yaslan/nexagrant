import { describe, test, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  syncKeepEuData: vi.fn(),
  aggregateKeepEuMetrics: vi.fn(),
  retrieveChunks: vi.fn(),
  formatRagPrompt: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/keep-eu-sync', () => ({
  syncKeepEuData: m.syncKeepEuData,
  aggregateKeepEuMetrics: m.aggregateKeepEuMetrics,
}));
vi.mock('@/lib/rag', () => ({
  retrieveChunks: m.retrieveChunks,
  formatRagPrompt: m.formatRagPrompt,
}));

const interreg = await import('@/app/[locale]/admin/interreg/actions');

const PLATFORM_ADMIN = {
  user: { id: 'user-admin', email: 'admin@example.test' },
  tenantId: 'tenant-A',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: true,
};

const OTHER_TENANT_ADMIN = {
  user: { id: 'user-b-owner', email: 'owner@tenant-b.test' },
  tenantId: 'tenant-B',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

const ACTIONS = [
  {
    name: 'handleRunKeepEuSyncAction',
    call: () => interreg.handleRunKeepEuSyncAction('305'),
    effects: () => [m.syncKeepEuData],
  },
  {
    name: 'handleGetKeepEuMetricsAction',
    call: () => interreg.handleGetKeepEuMetricsAction(),
    effects: () => [m.aggregateKeepEuMetrics],
  },
  {
    name: 'handleTestInterregRagQuery',
    call: () => interreg.handleTestInterregRagQuery('tourism', 3),
    effects: () => [m.retrieveChunks],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.syncKeepEuData.mockResolvedValue({ success: true, syncedProjectsCount: 1 });
  m.aggregateKeepEuMetrics.mockResolvedValue({ totalProjectsCount: 1 });
  m.retrieveChunks.mockResolvedValue([]);
  m.formatRagPrompt.mockReturnValue('formatted prompt');
});

describe.each(ACTIONS)('$name', ({ call, effects }) => {
  test('refuses an anonymous caller and reaches nothing', async () => {
    m.auth.mockResolvedValue(null);
    await expect(call()).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    for (const fn of effects()) expect(fn).not.toHaveBeenCalled();
  });

  test('refuses the admin of another tenant and reaches nothing', async () => {
    m.auth.mockResolvedValue(OTHER_TENANT_ADMIN);
    await expect(call()).rejects.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    for (const fn of effects()) expect(fn).not.toHaveBeenCalled();
  });

  test('runs for a platform admin', async () => {
    m.auth.mockResolvedValue(PLATFORM_ADMIN);
    await expect(call()).resolves.toBeDefined();
    expect(effects()[0]).toHaveBeenCalled();
  });
});
