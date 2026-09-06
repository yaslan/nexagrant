import { describe, test, expect, vi } from 'vitest';
import { createMarketplaceListing, orderMarketplaceService, generateApiKey } from '../../src/modules/marketplace/server/actions';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    marketplaceListing: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'list-123',
        tenantId: data.tenantId,
        kind: data.kind,
        title: data.title,
        description: data.description,
        price: data.price,
        status: 'active',
      })),
    },
    apiKey: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'key-123',
        tenantId: data.tenantId,
        name: data.name,
        prefix: data.prefix,
        keyHash: data.keyHash,
      })),
    },
  },
}));

describe('Marketplace & Partner Intelligence API Module', () => {
  test('createMarketplaceListing adds new listing', async () => {
    const listing = await createMarketplaceListing({
      tenantId: 'tenant-1',
      kind: 'consultancy',
      title: 'EU Proposal Coaching',
      description: 'Expert proposal review',
      price: '€1,500',
    });

    expect(listing).toBeDefined();
    expect(listing.title).toBe('EU Proposal Coaching');
  });

  test('orderMarketplaceService deducts 10% platform fee', async () => {
    const res = await orderMarketplaceService({
      listingId: 'list-123',
      buyerTenantId: 'buyer-tenant-1',
      priceAmountEUR: 2000,
    });

    expect(res.success).toBe(true);
    expect(res.order.platformFeeEUR).toBe(200); // 10% of 2000
    expect(res.order.consultantPayoutEUR).toBe(1800); // 90% of 2000
  });

  test('generateApiKey generates API key with prefix', async () => {
    const res = await generateApiKey({
      tenantId: 'tenant-1',
      name: 'ERP Integration Key',
    });

    expect(res.rawKey).toContain('fp_live_');
    expect(res.apiKeyRecord.name).toBe('ERP Integration Key');
  });
});
