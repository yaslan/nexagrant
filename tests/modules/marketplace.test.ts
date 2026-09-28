import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  createMarketplaceListing,
  orderMarketplaceService,
  generateApiKey,
  revokeApiKey,
} from '../../src/modules/marketplace/server/actions';
import { parseListingPrice } from '../../src/modules/marketplace/server/orders';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

const h = vi.hoisted(() => ({
  listingCreate: vi.fn(),
  listingFindUnique: vi.fn(),
  orderCreate: vi.fn(),
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
    marketplaceListing: { create: h.listingCreate, findUnique: h.listingFindUnique },
    marketplaceOrder: { create: h.orderCreate },
    apiKey: { create: h.apiKeyCreate, deleteMany: h.apiKeyDeleteMany },
  });
});

// The listing lookup crosses tenants (it names the SELLER's tenant). Its RLS
// behaviour is measured in tests/marketplace-order.live.test.ts; here it only
// has to hand the callback the same fake client.
vi.mock('../../src/lib/system-scope', () => ({
  withSystemScopeOn: vi.fn(
    async <T,>(_client: unknown, _purpose: string, _context: string, cb: (t: never) => Promise<T>) =>
      cb({ marketplaceListing: { findUnique: h.listingFindUnique } } as never)
  ),
}));

/** An active listing owned by another tenant, as the discovery read selects it. */
function sellerListing(over: Partial<{ id: string; tenantId: string; status: string; price: string | null }> = {}) {
  return { id: 'list-123', tenantId: 'tenant-seller', status: 'active', price: '€2,000', ...over };
}

describe('Marketplace & Partner Intelligence API Module', () => {
  beforeEach(() => {
    resetScope();
    vi.clearAllMocks();
    h.listingCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'list-123',
      tenantId: data.tenantId,
      kind: data.kind,
      title: data.title,
      description: data.description,
      price: data.price,
      status: 'active',
    }));
    h.apiKeyCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'key-123',
      tenantId: data.tenantId,
      name: data.name,
      prefix: data.prefix,
      keyHash: data.keyHash,
    }));
    h.apiKeyDeleteMany.mockResolvedValue({ count: 1 });
    h.listingFindUnique.mockResolvedValue(sellerListing());
    h.orderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'order-1',
      createdAt: new Date(0),
      ...data,
    }));
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

  test('orderMarketplaceService prices from the listing and writes the order for the buyer', async () => {
    const res = await orderMarketplaceService({ listingId: 'list-123' });

    expect(res.success).toBe(true);
    expect(h.orderCreate).toHaveBeenCalledTimes(1);
    expect(h.orderCreate).toHaveBeenCalledWith({
      data: {
        // The buyer is the session tenant; the browser cannot name someone else.
        tenantId: 'tenant-1',
        listingId: 'list-123',
        sellerTenantId: 'tenant-seller',
        totalAmountMinor: 200000, // €2,000.00
        platformFeeMinor: 20000, // 10%
        payoutAmountMinor: 180000,
        currency: 'EUR',
        status: 'CONFIRMED',
      },
    });
  });

  test('orderMarketplaceService ignores a price sent by the client', async () => {
    // A tampered POST: the old action trusted this field.
    const res = await orderMarketplaceService({
      listingId: 'list-123',
      priceAmountEUR: 1,
    } as Parameters<typeof orderMarketplaceService>[0]);

    expect(res.success).toBe(true);
    expect(h.orderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ totalAmountMinor: 200000, platformFeeMinor: 20000 }),
    });
  });

  test('orderMarketplaceService refuses a listing that does not exist and writes nothing', async () => {
    h.listingFindUnique.mockResolvedValue(null);

    const res = await orderMarketplaceService({ listingId: 'no-such-listing' });

    expect(res).toEqual({ success: false, code: 'LISTING_NOT_FOUND' });
    expect(h.orderCreate).not.toHaveBeenCalled();
  });

  test("orderMarketplaceService refuses another tenant's unlisted listing as not found", async () => {
    h.listingFindUnique.mockResolvedValue(sellerListing({ status: 'unlisted' }));

    const res = await orderMarketplaceService({ listingId: 'list-123' });

    // Same code as a missing id, so the answer does not confirm it exists.
    expect(res).toEqual({ success: false, code: 'LISTING_NOT_FOUND' });
    expect(h.orderCreate).not.toHaveBeenCalled();
  });

  test('orderMarketplaceService refuses the buyer\'s own listing', async () => {
    h.listingFindUnique.mockResolvedValue(sellerListing({ tenantId: 'tenant-1' }));

    const res = await orderMarketplaceService({ listingId: 'list-123' });

    expect(res).toEqual({ success: false, code: 'OWN_LISTING' });
    expect(h.orderCreate).not.toHaveBeenCalled();
  });

  test('orderMarketplaceService refuses a listing with no fixed price', async () => {
    h.listingFindUnique.mockResolvedValue(sellerListing({ price: 'Görüşülecek' }));

    const res = await orderMarketplaceService({ listingId: 'list-123' });

    expect(res).toEqual({ success: false, code: 'PRICE_NOT_FIXED' });
    expect(h.orderCreate).not.toHaveBeenCalled();
  });

  test('orderMarketplaceService refuses a session with no tenant before any read', async () => {
    setScope(null);

    await expect(orderMarketplaceService({ listingId: 'list-123' })).rejects.toBeInstanceOf(
      FakeTenantScopeError
    );
    expect(h.listingFindUnique).not.toHaveBeenCalled();
    expect(h.orderCreate).not.toHaveBeenCalled();
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

describe('parseListingPrice', () => {
  test.each([
    ['€1,500', 150000, 'EUR'],
    ['1500', 150000, 'EUR'],
    ['2500 EUR', 250000, 'EUR'],
    ['EUR 12,500.50', 1250050, 'EUR'],
    ['$99.9', 9990, 'USD'],
    ['₺1,250', 125000, 'TRY'],
    ['750 TL', 75000, 'TRY'],
  ])('%s → %i %s', (text, amountMinor, currency) => {
    expect(parseListingPrice(text)).toEqual({ amountMinor, currency });
  });

  test.each([
    'Görüşülecek',
    'Negotiable',
    '',
    null,
    // Two thousand five hundred or two and a half — refused rather than guessed.
    '€2.500',
    '2,50',
    '0',
    '-100',
    '100 XYZ',
    '€1,500 / hour',
  ])('%s → null', (text) => {
    expect(parseListingPrice(text)).toBeNull();
  });
});
