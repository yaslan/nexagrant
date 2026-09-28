import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateApiKey,
  revokeApiKey,
} from '../../src/app/[locale]/(app)/[workspace]/settings/api-keys/actions';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

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
});
