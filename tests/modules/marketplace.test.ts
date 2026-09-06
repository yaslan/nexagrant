import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createMarketplaceListing,
  orderMarketplaceService,
  generateApiKey,
  revokeApiKey,
} from '../../src/modules/marketplace/server/actions';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

const h = vi.hoisted(() => ({
  listingCreate: vi.fn(),
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
    marketplaceListing: { create: h.listingCreate },
    apiKey: { create: h.apiKeyCreate, deleteMany: h.apiKeyDeleteMany },
  });
});

describe('Marketplace & Partner Intelligence API Module', () => {
  beforeEach(() => {
    resetScope();
    vi.clearAllMocks();
    h.listingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'list-123',
      tenantId: data.tenantId,
      kind: data.kind,
      title: data.title,
      description: data.description,
      price: data.price,
      status: 'active',
    }));
    h.apiKeyCreate.mockImplementation(async ({ data }: any) => ({
      id: 'key-123',
      tenantId: data.tenantId,
      name: data.name,
      prefix: data.prefix,
      keyHash: data.keyHash,
    }));
    h.apiKeyDeleteMany.mockResolvedValue({ count: 1 });
  });

  test('createMarketplaceListing adds new listing', async () => {
    const listing = await createMarketplaceListing({
      kind: 'consultancy',
      title: 'EU Proposal Coaching',
      description: 'Expert proposal review',
      price: '€1,500',
    });

    expect(listing).toBeDefined();
    expect(listing.title).toBe('EU Proposal Coaching');
    expect(listing.tenantId).toBe('tenant-1');
  });

  test('orderMarketplaceService deducts 10% platform fee', async () => {
    const res = await orderMarketplaceService({
      listingId: 'list-123',
      priceAmountEUR: 2000,
    });

    expect(res.success).toBe(true);
    expect(res.order.platformFeeEUR).toBe(200); // 10% of 2000
    expect(res.order.consultantPayoutEUR).toBe(1800); // 90% of 2000
    // The buyer is the session tenant; the browser cannot name someone else.
    expect(res.order.buyerTenantId).toBe('tenant-1');
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
