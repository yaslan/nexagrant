import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateStandardDoc, signDocument, createNewVersion } from '../../src/modules/m10/server/actions';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

const h = vi.hoisted(() => ({
  generateText: vi.fn(),
  creditLedgerCreate: vi.fn(),
  opportunityFindFirst: vi.fn(),
  followupDocCreate: vi.fn(),
  followupDocFindFirst: vi.fn(),
  followupDocUpdate: vi.fn(),
  followupDocUpdateMany: vi.fn(),
  // A new revision drops the sign-off the previous one collected.
  dualApprovalStepDeleteMany: vi.fn(),
}));

vi.mock('../../src/lib/tenant', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.tenantModuleStub();
});

vi.mock('../../src/lib/modules/access', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.moduleAccessStub();
});

vi.mock('../../src/lib/db', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.dbModuleStub({
    creditLedger: { create: h.creditLedgerCreate },
    opportunity: { findFirst: h.opportunityFindFirst },
    followupDoc: {
      create: h.followupDocCreate,
      findFirst: h.followupDocFindFirst,
      update: h.followupDocUpdate,
      updateMany: h.followupDocUpdateMany,
    },
    dualApprovalStep: { deleteMany: h.dualApprovalStepDeleteMany },
  });
});

// The dual-approval actions read the signer's display name straight from the
// session, so `@/lib/auth` is in this module's import graph even though the
// tenant module is stubbed. Left unmocked, next-auth's `next/server` import
// fails to resolve under vitest and the whole suite refuses to load.
vi.mock('../../src/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'user-1', name: 'Test Kullanıcı', email: 'test@fabrika.test' },
  })),
}));

vi.mock('../../src/lib/llm', () => ({
  generateText: h.generateText,
}));

describe('M10 Follow-up Documents Module', () => {
  beforeEach(() => {
    resetScope();
    vi.clearAllMocks();
    h.generateText.mockResolvedValue(`### MUTUAL NON-DISCLOSURE AGREEMENT (NDA)\n\nMock document content.`);
    h.creditLedgerCreate.mockResolvedValue({ id: 'ledger-1' });
    h.dualApprovalStepDeleteMany.mockResolvedValue({ count: 0 });
    h.opportunityFindFirst.mockResolvedValue({ title: 'Test Opp' });
    h.followupDocCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'doc-101',
      tenantId: data.tenantId,
      opportunityId: data.opportunityId,
      kind: data.kind,
      version: data.version,
      contentUrl: data.contentUrl,
      signedAt: null,
    }));
    h.followupDocFindFirst.mockResolvedValue({
      id: 'doc-101',
      tenantId: 'tenant-1',
      opportunityId: 'opp-10',
      kind: 'NDA',
      version: 1,
      contentUrl: 'https://storage.fabrika.app/docs/tenant-1/opp-10/nda_v1.pdf',
    });
    h.followupDocUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'doc-101',
      signedAt: data.signedAt ?? null,
      version: data.version || 1,
      contentUrl: data.contentUrl || 'https://storage.fabrika.app/docs/tenant-1/opp-10/nda_v2.pdf',
    }));
    h.followupDocUpdateMany.mockResolvedValue({ count: 1 });
  });

  test('generateStandardDoc creates an NDA document draft with structured text', async () => {
    const doc = await generateStandardDoc('opp-10', 'NDA');
    expect(doc.kind).toBe('NDA');
    expect(doc.version).toBe(1);
    expect(doc.contentText).toContain('NON-DISCLOSURE');
  });

  test('generateStandardDoc creates a TÜBİTAK Eşik Üstü Ödül Paketi document', async () => {
    const doc = await generateStandardDoc('opp-10', 'AWARD_PACK');
    expect(doc.kind).toBe('AWARD_PACK');
    expect(doc.contentUrl).toContain('award_pack_v1.pdf');
  });

  test('generateStandardDoc refuses an opportunity outside the session tenant', async () => {
    h.opportunityFindFirst.mockResolvedValue(null);

    await expect(generateStandardDoc('opp-from-other-tenant', 'NDA')).rejects.toThrow(
      /not found in this workspace/
    );
    expect(h.followupDocCreate).not.toHaveBeenCalled();
  });

  test('generateStandardDoc operates on the session tenant, not one named by the caller', async () => {
    await generateStandardDoc('opp-10', 'NDA');

    expect(h.generateText).toHaveBeenCalled();
    expect(h.followupDocCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
  });

  test('signDocument updates document signedAt timestamp', async () => {
    const res = await signDocument('doc-101');
    expect(res.success).toBe(true);
    expect(res.signedAt).toBeInstanceOf(Date);
    // The tenant is part of the WHERE clause, not just the id.
    expect(h.followupDocUpdateMany).toHaveBeenCalledWith({
      where: { id: 'doc-101', tenantId: 'tenant-1' },
      data: { signedAt: res.signedAt },
    });
  });

  test('signDocument reports failure when the id belongs to another tenant', async () => {
    h.followupDocUpdateMany.mockResolvedValue({ count: 0 });

    const res = await signDocument('doc-from-other-tenant');
    expect(res.success).toBe(false);
  });

  test('createNewVersion increments document version', async () => {
    const res = await createNewVersion('doc-101');
    expect(res.success).toBe(true);
    expect(res.updatedDoc?.version).toBe(2);
    expect(h.followupDocFindFirst).toHaveBeenCalledWith({
      where: { id: 'doc-101', tenantId: 'tenant-1' },
    });
  });

  test('createNewVersion leaves another tenant\'s document alone', async () => {
    h.followupDocFindFirst.mockResolvedValue(null);

    const res = await createNewVersion('doc-from-other-tenant');
    expect(res.success).toBe(false);
    expect(h.followupDocUpdate).not.toHaveBeenCalled();
  });

  test('a session with no tenant is refused instead of falling back', async () => {
    setScope(null);

    await expect(generateStandardDoc('opp-10', 'NDA')).rejects.toBeInstanceOf(FakeTenantScopeError);
  });
});
