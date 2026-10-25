import { describe, test, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  isEnabled: vi.fn(),
  setFlag: vi.fn(),
  runIngestion: vi.fn(),
  refreshFlags: vi.fn(),
  enqueueJob: vi.fn(),
  topicFindFirst: vi.fn(),
  cordisFindUnique: vi.fn(),
  tx: {
    unmatchedOrganization: { findUnique: vi.fn(), update: vi.fn() },
    partnerSearchAnnouncement: { findMany: vi.fn(), updateMany: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: m.enqueueJob }));
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: (_reason: string, _context: string, cb: (tx: typeof m.tx) => unknown) => cb(m.tx),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    topic: { findFirst: m.topicFindFirst },
    cordisOrganization: { findUnique: m.cordisFindUnique },
  },
}));
vi.mock('@/modules/m1/server/partner-search/flag', () => ({
  isPartnerSearchIngestionEnabled: m.isEnabled,
  setPartnerSearchIngestionFlag: m.setFlag,
}));
vi.mock('@/modules/m1/server/partner-search/ingestor', () => ({
  runPartnerSearchIngestion: m.runIngestion,
  refreshOrganisationFlags: m.refreshFlags,
}));

const ps = await import('@/app/[locale]/admin/partner-search/actions');

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

const UNMATCHED = {
  id: 'um-1',
  matchKey: 'name:DE:acme research gmbh',
  name: 'ACME Research GmbH',
  country: 'DE',
  pic: null,
  resolvedPic: null,
};

const ACTIONS = [
  { name: 'runPartnerSearchNow', call: () => ps.runPartnerSearchNow(), effects: () => [m.enqueueJob] },
  {
    name: 'refetchPartnerSearchTopic',
    call: () => ps.refetchPartnerSearchTopic('HORIZON-CL4-2027-01-MAT-PROD-22'),
    effects: () => [m.runIngestion],
  },
  { name: 'setPartnerSearchFlag', call: () => ps.setPartnerSearchFlag({ enabled: true }), effects: () => [m.setFlag] },
  {
    name: 'resolveUnmatchedOrganization',
    call: () => ps.resolveUnmatchedOrganization({ id: 'um-1', pic: '999999999' }),
    effects: () => [m.tx.unmatchedOrganization.update, m.tx.auditEvent.create],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.isEnabled.mockResolvedValue(true);
  m.setFlag.mockResolvedValue(undefined);
  m.enqueueJob.mockResolvedValue({ added: true });
  m.topicFindFirst.mockResolvedValue({ identifier: 'HORIZON-CL4-2027-01-MAT-PROD-22' });
  m.runIngestion.mockResolvedValue({
    kind: 'done',
    runId: 'run-1',
    status: 'SUCCESS',
    summary: { created: 2, updated: 1, withdrawn: 0 },
  });
  m.cordisFindUnique.mockResolvedValue({ organisationId: '999999999', name: 'ACME RESEARCH GMBH' });
  m.tx.unmatchedOrganization.findUnique.mockResolvedValue(UNMATCHED);
  m.tx.partnerSearchAnnouncement.findMany.mockResolvedValue([
    { id: 'a-1', organizationName: 'ACME Research GmbH', country: 'DE' },
    { id: 'a-2', organizationName: 'Other Org', country: 'DE' },
  ]);
  m.refreshFlags.mockResolvedValue(undefined);
});

describe.each(ACTIONS)('$name authorization', ({ call, effects }) => {
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
});

describe('as platform admin', () => {
  beforeEach(() => m.auth.mockResolvedValue(PLATFORM_ADMIN));

  test('run now queues the partner-search job and audits it', async () => {
    await expect(ps.runPartnerSearchNow()).resolves.toEqual({ ok: true, added: true });
    expect(m.enqueueJob).toHaveBeenCalledWith('partner-search', {});
    expect(m.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'user-admin', type: 'partner_search.run.requested' }),
    });
  });

  test('run now with the flag off queues nothing', async () => {
    m.isEnabled.mockResolvedValue(false);
    await expect(ps.runPartnerSearchNow()).resolves.toEqual({ ok: false, error: 'flag_off' });
    expect(m.enqueueJob).not.toHaveBeenCalled();
  });

  test('topic re-fetch calls the ingestor for that one topic', async () => {
    const res = await ps.refetchPartnerSearchTopic(' HORIZON-CL4-2027-01-MAT-PROD-22 ');
    expect(res).toEqual({ ok: true, runId: 'run-1', status: 'SUCCESS', created: 2, updated: 1, withdrawn: 0 });
    expect(m.runIngestion).toHaveBeenCalledWith({
      trigger: 'MANUAL',
      topicIdentifiers: ['HORIZON-CL4-2027-01-MAT-PROD-22'],
    });
  });

  test('topic re-fetch rejects a malformed identifier before any lookup', async () => {
    await expect(ps.refetchPartnerSearchTopic("x'; drop")).resolves.toEqual({ ok: false, error: 'validation_failed' });
    expect(m.topicFindFirst).not.toHaveBeenCalled();
  });

  test('topic re-fetch of a closed or unknown topic does not run', async () => {
    m.topicFindFirst.mockResolvedValue(null);
    await expect(ps.refetchPartnerSearchTopic('LIFE-2020-OLD')).resolves.toEqual({ ok: false, error: 'topic_not_found' });
    expect(m.runIngestion).not.toHaveBeenCalled();
  });

  test('topic re-fetch reports a flag-off skip', async () => {
    m.runIngestion.mockResolvedValue({ kind: 'skipped', reason: 'flag-off' });
    await expect(ps.refetchPartnerSearchTopic('LIFE-2026-SAP-ENV')).resolves.toEqual({ ok: false, error: 'flag_off' });
  });

  test('flag write passes the acting admin to the guarded writer', async () => {
    await expect(ps.setPartnerSearchFlag({ enabled: true })).resolves.toEqual({ ok: true, enabled: true });
    expect(m.setFlag).toHaveBeenCalledWith(expect.anything(), true, 'user-admin');
  });

  test('flag write rejects a non-boolean', async () => {
    await expect(ps.setPartnerSearchFlag({ enabled: 'yes' })).resolves.toEqual({ ok: false, error: 'validation_failed' });
    expect(m.setFlag).not.toHaveBeenCalled();
  });

  test('flag write on a non-owner connection maps 42501 to a literal code', async () => {
    m.setFlag.mockRejectedValue(Object.assign(new Error('permission denied for function set_platform_setting'), { code: '42501' }));
    await expect(ps.setPartnerSearchFlag({ enabled: true })).resolves.toEqual({
      ok: false,
      error: 'owner_connection_required',
    });
  });

  test('manual link sets resolvedPic, links matching announcements only and audits', async () => {
    await expect(ps.resolveUnmatchedOrganization({ id: 'um-1', pic: '999 999 999' })).resolves.toEqual({
      ok: true,
      pic: '999999999',
      linkedAnnouncements: 1,
    });
    expect(m.tx.unmatchedOrganization.update).toHaveBeenCalledWith({
      where: { id: 'um-1' },
      data: { resolvedPic: '999999999' },
    });
    expect(m.tx.partnerSearchAnnouncement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a-1'] }, organizationPic: null },
      data: { organizationPic: '999999999' },
    });
    expect(m.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-admin',
        type: 'partner_search.unmatched.resolved',
        target: 'um-1',
        data: expect.objectContaining({ resolvedPic: '999999999', linkedAnnouncements: 1 }),
      }),
    });
    expect(m.refreshFlags).toHaveBeenCalledWith(new Set(['999999999']));
  });

  test('manual link rejects a non-numeric PIC', async () => {
    await expect(ps.resolveUnmatchedOrganization({ id: 'um-1', pic: 'abc' })).resolves.toEqual({
      ok: false,
      error: 'invalid_pic',
    });
    expect(m.cordisFindUnique).not.toHaveBeenCalled();
  });

  test('manual link to a PIC CORDIS does not know writes nothing', async () => {
    m.cordisFindUnique.mockResolvedValue(null);
    await expect(ps.resolveUnmatchedOrganization({ id: 'um-1', pic: '123456789' })).resolves.toEqual({
      ok: false,
      error: 'organization_not_found',
    });
    expect(m.tx.unmatchedOrganization.update).not.toHaveBeenCalled();
    expect(m.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  test('manual link of an already resolved row is refused', async () => {
    m.tx.unmatchedOrganization.findUnique.mockResolvedValue({ ...UNMATCHED, resolvedPic: '111111111' });
    await expect(ps.resolveUnmatchedOrganization({ id: 'um-1', pic: '999999999' })).resolves.toEqual({
      ok: false,
      error: 'already_resolved',
    });
    expect(m.tx.unmatchedOrganization.update).not.toHaveBeenCalled();
    expect(m.refreshFlags).not.toHaveBeenCalled();
  });
});
