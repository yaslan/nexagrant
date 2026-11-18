import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MUMJ2ERCFP964 — admin server actions had no identity check.
 *
 * The blog and CORDIS actions ran for anyone who knew the action id. The admin
 * layout 404s a non-platform-admin, but a server action is its own HTTP entry
 * point. (The SSO action this file also covered was removed with SSO itself,
 * TASK-MUML0QZAZ5M80.)
 *
 * Every action is driven by three callers — anonymous, the admin of ANOTHER
 * tenant (TENANT_OWNER, not platform staff) and a platform admin — and a refusal
 * must reach nothing behind the gate: no DB write, no import, no embedding.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  count: vi.fn(),
  importRunFind: vi.fn(),
  blog: {
    createBlogPost: vi.fn(),
    updateBlogPost: vi.fn(),
    deleteBlogPost: vi.fn(),
    toggleFeaturedBlogPost: vi.fn(),
  },
  runCordisImport: vi.fn(),
  generatePartnerProfiles: vi.fn(),
  syncCordisBigData: vi.fn(),
  aggregateCordisMetrics: vi.fn(),
  fetchLiveCordisDelta: vi.fn(),
  getCordisLiveStreamLogs: vi.fn(),
  retrieveChunks: vi.fn(),
  formatRagContext: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/billing/pilot', () => ({
  assertTenantWritable: vi.fn().mockResolvedValue(undefined),
  PilotExpiredError: class PilotExpiredError extends Error {},
}));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn(), resolveAlerts: vi.fn(async () => ({ resolved: 0 })) }));
vi.mock('@/lib/db', () => {
  const model = { count: m.count };
  return {
    prisma: {
      cordisImportRun: { findFirst: m.importRunFind },
      cordisProject: model,
      cordisOrganization: model,
      cordisParticipation: model,
      cordisPartnerProfile: model,
    },
  };
});
vi.mock('@/lib/blog', () => m.blog);
vi.mock('@/lib/k2-cordis/importer', () => ({ runCordisImport: m.runCordisImport }));
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({ generatePartnerProfiles: m.generatePartnerProfiles }));
vi.mock('@/lib/cordis-sync', () => ({
  syncCordisBigData: m.syncCordisBigData,
  aggregateCordisMetrics: m.aggregateCordisMetrics,
}));
vi.mock('@/lib/cordis-delta', () => ({
  fetchLiveCordisDelta: m.fetchLiveCordisDelta,
  getCordisLiveStreamLogs: m.getCordisLiveStreamLogs,
}));
vi.mock('@/lib/rag', () => ({ retrieveChunks: m.retrieveChunks, formatRagContext: m.formatRagContext }));

const blog = await import('@/app/[locale]/admin/blog/actions');
const cordis = await import('@/app/[locale]/admin/cordis/actions');

const PLATFORM_ADMIN = {
  user: { id: 'user-admin', email: 'admin@example.test' },
  tenantId: 'tenant-A',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: true,
};

/** Owner of tenant B: an admin, but of another tenant, and not platform staff. */
const OTHER_TENANT_ADMIN = {
  user: { id: 'user-b-owner', email: 'owner@tenant-b.test' },
  tenantId: 'tenant-B',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

const POST = { title: 't', excerpt: 'e', content: 'c', category: 'x', readMinutes: 1, authorName: '', authorRole: '', image: '' };

/** Each action, called with plausible arguments, and the spies it must not reach when refused. */
const ACTIONS: { name: string; call: () => Promise<unknown>; effects: () => ReturnType<typeof vi.fn>[] }[] = [
  { name: 'createBlogPostAction', call: () => blog.createBlogPostAction(POST), effects: () => [m.blog.createBlogPost] },
  { name: 'updateBlogPostAction', call: () => blog.updateBlogPostAction('s', { title: 'x' }), effects: () => [m.blog.updateBlogPost] },
  { name: 'deleteBlogPostAction', call: () => blog.deleteBlogPostAction('s'), effects: () => [m.blog.deleteBlogPost] },
  { name: 'toggleFeaturedBlogPostAction', call: () => blog.toggleFeaturedBlogPostAction('s'), effects: () => [m.blog.toggleFeaturedBlogPost] },
  { name: 'handleRunCordisImportAction', call: () => cordis.handleRunCordisImportAction('HORIZON', 1), effects: () => [m.runCordisImport, m.generatePartnerProfiles] },
  { name: 'handleGetK2Status', call: () => cordis.handleGetK2Status(), effects: () => [m.importRunFind, m.count] },
  { name: 'handleRunCordisSync', call: () => cordis.handleRunCordisSync(), effects: () => [m.syncCordisBigData] },
  { name: 'handleGetCordisMetrics', call: () => cordis.handleGetCordisMetrics(), effects: () => [m.aggregateCordisMetrics] },
  { name: 'handleRunCordisLiveDelta', call: () => cordis.handleRunCordisLiveDelta(7), effects: () => [m.fetchLiveCordisDelta] },
  { name: 'handleGetCordisDeltaLogs', call: () => cordis.handleGetCordisDeltaLogs(), effects: () => [m.getCordisLiveStreamLogs] },
  { name: 'handleTestRagQuery', call: () => cordis.handleTestRagQuery('q', 1), effects: () => [m.retrieveChunks] },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.count.mockResolvedValue(0);
  m.importRunFind.mockResolvedValue(null);
  // The shapes src/lib/blog.ts answers with since AKTAR-MURBCJ0A-1.
  for (const fn of Object.values(m.blog)) fn.mockResolvedValue({ ok: true, post: { slug: 's' } });
  m.blog.deleteBlogPost.mockResolvedValue({ ok: true });
  m.runCordisImport.mockResolvedValue({ success: true, skipped: false, runId: 'r', rowCounts: {}, durationMs: 1 });
  m.generatePartnerProfiles.mockResolvedValue({ updatedProfiles: 0, updatedCoParticipations: 0, durationMs: 0 });
  m.syncCordisBigData.mockResolvedValue({ ok: true });
  m.aggregateCordisMetrics.mockResolvedValue({ ok: true });
  m.fetchLiveCordisDelta.mockResolvedValue({ ok: true });
  m.getCordisLiveStreamLogs.mockResolvedValue([]);
  m.retrieveChunks.mockResolvedValue([]);
  m.formatRagContext.mockReturnValue('prompt');
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

