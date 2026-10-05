import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateApiKey,
  revokeApiKey,
} from '../../src/app/[locale]/(app)/[workspace]/settings/api-keys/actions';
import {
  DEFAULT_SCOPE,
  resetScope,
  setScope,
  FakeTenantScopeError,
} from '../helpers/tenant-scope-mock';

const h = vi.hoisted(() => ({
  apiKeyCreate: vi.fn(),
  apiKeyDeleteMany: vi.fn(),
}));

vi.mock('../../src/lib/tenant', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.tenantModuleStub();
});

vi.mock('../../src/lib/db', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.dbModuleStub({
    apiKey: { create: h.apiKeyCreate, deleteMany: h.apiKeyDeleteMany },
  });
});

// Moved from tests/modules/marketplace.test.ts when the marketplace was removed
// (ADR-0005). The partner API keys stay, and so do these guards.
describe('Partner API keys', () => {
  beforeEach(() => {
    resetScope();
    vi.clearAllMocks();
    h.apiKeyCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'key-123',
      tenantId: data.tenantId,
      name: data.name,
      prefix: data.prefix,
      keyHash: data.keyHash,
    }));
    h.apiKeyDeleteMany.mockResolvedValue({ count: 1 });
  });

  test('generateApiKey generates API key with prefix', async () => {
    const res = await generateApiKey({ name: 'ERP Integration Key' });

    if ('error' in res) throw new Error(`unexpected refusal: ${res.error}`);
    expect(res.rawKey).toContain('fp_live_');
    expect(res.apiKeyRecord.name).toBe('ERP Integration Key');
  });

  test('generateApiKey mints the key for the session tenant only', async () => {
    await generateApiKey({ name: 'ERP Integration Key' });

    expect(h.apiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
  });

  test('generateApiKey refuses a session with no tenant rather than minting a key', async () => {
    setScope(null);

    await expect(generateApiKey({ name: 'ERP Integration Key' })).rejects.toBeInstanceOf(
      FakeTenantScopeError
    );
    expect(h.apiKeyCreate).not.toHaveBeenCalled();
  });

  test('revokeApiKey deletes by (id, tenantId), not by id alone', async () => {
    const res = await revokeApiKey('key-123');

    expect(res.success).toBe(true);
    expect(h.apiKeyDeleteMany).toHaveBeenCalledWith({
      where: { id: 'key-123', tenantId: 'tenant-1' },
    });
  });

  test('revokeApiKey reports failure for a key outside the tenant', async () => {
    h.apiKeyDeleteMany.mockResolvedValue({ count: 0 });

    const res = await revokeApiKey('key-from-other-tenant');
    expect(res.success).toBe(false);
  });

  // TASK-MULU88PPI3HY3 (review K-12): a key reads the whole tenant through the
  // partner API, so only roles with `manage_users` may mint or revoke one.
  describe('role check', () => {
    const asRole = (role: string) => setScope({ ...DEFAULT_SCOPE, role });

    test.each(['TENANT_OWNER', 'TENANT_ADMIN'])('%s may mint a key', async (role) => {
      asRole(role);

      const res = await generateApiKey({ name: 'ERP Integration Key' });

      expect(res).not.toHaveProperty('error');
      expect(h.apiKeyCreate).toHaveBeenCalledTimes(1);
    });

    test.each(['PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'])(
      '%s is refused and no key is stored',
      async (role) => {
        asRole(role);

        const res = await generateApiKey({ name: 'ERP Integration Key' });

        expect(res).toEqual({ error: 'forbidden' });
        expect(h.apiKeyCreate).not.toHaveBeenCalled();
      }
    );

    test('a role claim outside the enum grants nothing', async () => {
      asRole('SUPER_OWNER');

      expect(await generateApiKey({ name: 'ERP Integration Key' })).toEqual({ error: 'forbidden' });
      expect(await revokeApiKey('key-123')).toEqual({ success: false, error: 'forbidden' });
      expect(h.apiKeyCreate).not.toHaveBeenCalled();
      expect(h.apiKeyDeleteMany).not.toHaveBeenCalled();
    });

    test.each(['PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'])(
      '%s may not revoke a key',
      async (role) => {
        asRole(role);

        const res = await revokeApiKey('key-123');

        expect(res).toEqual({ success: false, error: 'forbidden' });
        expect(h.apiKeyDeleteMany).not.toHaveBeenCalled();
      }
    );

    test('TENANT_ADMIN may revoke a key', async () => {
      asRole('TENANT_ADMIN');

      expect(await revokeApiKey('key-123')).toEqual({ success: true });
      expect(h.apiKeyDeleteMany).toHaveBeenCalledTimes(1);
    });

    test('a member without a session tenant still gets the scope error, not a value', async () => {
      setScope(null);

      await expect(revokeApiKey('key-123')).rejects.toBeInstanceOf(FakeTenantScopeError);
    });
  });

  describe('name validation', () => {
    test.each([
      ['empty', ''],
      ['whitespace only', '   \t '],
      ['101 characters', 'a'.repeat(101)],
      // Server actions are public POST endpoints; the declared type is not a guarantee.
      ['not a string', 42 as unknown as string],
      ['missing', undefined as unknown as string],
    ])('refuses a name that is %s', async (_label, name) => {
      const res = await generateApiKey({ name });

      expect(res).toEqual({ error: 'invalidName' });
      expect(h.apiKeyCreate).not.toHaveBeenCalled();
    });

    test('accepts exactly 100 characters', async () => {
      const res = await generateApiKey({ name: 'a'.repeat(100) });

      expect(res).not.toHaveProperty('error');
    });

    test('stores the trimmed name', async () => {
      await generateApiKey({ name: '  SAP ERP  ' });

      expect(h.apiKeyCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'SAP ERP' }) })
      );
    });
  });
});
