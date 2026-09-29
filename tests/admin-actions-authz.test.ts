import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MUMJ2ERCFP964 — admin server actions had no identity check.
 *
 * `handleConfigureSso` wrote whatever `tenantId` the browser sent, so any caller
 * could point any tenant's e-mail domain at an IdP of their choosing; the blog
 * and CORDIS actions ran for anyone who knew the action id. The admin layout
 * 404s a non-platform-admin, but a server action is its own HTTP entry point.
 *
 * Every action is driven by three callers — anonymous, the admin of ANOTHER
 * tenant (TENANT_OWNER, not platform staff) and a platform admin — and a refusal
 * must reach nothing behind the gate: no DB write, no import, no embedding.
 */

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  tenantFind: vi.fn(),
  tenantUpdate: vi.fn(),
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
  formatRagPrompt: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/billing/pilot', () => ({
  assertTenantWritable: vi.fn().mockResolvedValue(undefined),
  PilotExpiredError: class PilotExpiredError extends Error {},
}));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn() }));
vi.mock('@/lib/db', () => {
  const model = { count: m.count };
  return {
    prisma: {
      tenant: { findUniqueOrThrow: m.tenantFind, update: m.tenantUpdate },
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
vi.mock('@/lib/rag', () => ({ retrieveChunks: m.retrieveChunks, formatRagPrompt: m.formatRagPrompt }));

const sso = await import('@/app/[locale]/admin/billing/actions');
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

const SSO_CONFIG = {
  tenantId: 'tenant-A',
  domain: 'Victim.Example',
  idpEntityId: 'https://idp.attacker.test/entity',
  ssoAcsUrl: 'https://fonbridge.test/api/auth/saml/acs',
  providerType: 'SAML_2_0',
  enabled: true,
};

const POST = { title: 't', excerpt: 'e', content: 'c', category: 'x', readTime: '1', authorName: '', authorRole: '', image: '' };

/** Each action, called with plausible arguments, and the spies it must not reach when refused. */
const ACTIONS: { name: string; call: () => Promise<unknown>; effects: () => ReturnType<typeof vi.fn>[] }[] = [
  { name: 'handleConfigureSso', call: () => sso.handleConfigureSso(SSO_CONFIG), effects: () => [m.tenantFind, m.tenantUpdate] },
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
  m.tenantFind.mockResolvedValue({ settings: { scoringWeights: { g0: 1 } } });
  m.tenantUpdate.mockResolvedValue({});
  m.count.mockResolvedValue(0);
  m.importRunFind.mockResolvedValue(null);
  for (const fn of Object.values(m.blog)) fn.mockReturnValue({ slug: 's' });
  m.blog.deleteBlogPost.mockReturnValue(true);
  m.runCordisImport.mockResolvedValue({ success: true, skipped: false, runId: 'r', rowCounts: {}, durationMs: 1 });
  m.generatePartnerProfiles.mockResolvedValue({ updatedProfiles: 0, updatedCoParticipations: 0, durationMs: 0 });
  m.syncCordisBigData.mockResolvedValue({ ok: true });
  m.aggregateCordisMetrics.mockResolvedValue({ ok: true });
  m.fetchLiveCordisDelta.mockResolvedValue({ ok: true });
  m.getCordisLiveStreamLogs.mockResolvedValue([]);
  m.retrieveChunks.mockResolvedValue([]);
  m.formatRagPrompt.mockReturnValue('prompt');
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

describe('handleConfigureSso tenant scope', () => {
  test('writes the session tenant, never the tenantId the browser sent', async () => {
    m.auth.mockResolvedValue(PLATFORM_ADMIN);

    const res = await sso.handleConfigureSso({ ...SSO_CONFIG, tenantId: 'tenant-B' });

    expect(res.success).toBe(true);
    expect(m.tenantUpdate).toHaveBeenCalledTimes(1);
    expect(m.tenantUpdate.mock.calls[0]![0].where).toEqual({ id: 'tenant-A' });
    expect(m.tenantFind.mock.calls[0]![0].where).toEqual({ id: 'tenant-A' });
  });

  test('refuses a platform admin whose session carries no tenant', async () => {
    m.auth.mockResolvedValue({ ...PLATFORM_ADMIN, tenantId: undefined });
    await expect(sso.handleConfigureSso(SSO_CONFIG)).rejects.toMatchObject({ code: 'TENANT_SCOPE_REQUIRED' });
    expect(m.tenantUpdate).not.toHaveBeenCalled();
  });
});
