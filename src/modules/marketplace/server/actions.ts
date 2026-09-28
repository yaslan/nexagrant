'use server';

import { prisma, withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { placeMarketplaceOrderOn, type MarketplaceOrderResult } from './orders';

/**
 * Marketplace listings, orders and API keys.
 *
 * `tenantId` was an argument here too. On `generateApiKey` that was the worst
 * case in the codebase: a server action is a public POST endpoint, so anyone
 * could mint a live API key *for another tenant* and then use it against the
 * partner API. `revokeApiKey` deleted by key id alone, so any tenant's key
 * could be destroyed. Both are session-scoped now.
 */

export async function createMarketplaceListing({
  kind,
  title,
  description,
  price,
}: {
  kind: string;
  title: string;
  description: string;
  price?: string;
}) {
  const { tenantId } = await requireTenantAction();

  const listing = await withTenant(tenantId, (tx) =>
    tx.marketplaceListing.create({
      data: {
        tenantId,
        kind,
        title,
        description,
        price: price || 'Görüşülecek',
        status: 'active',
      },
    })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/marketplace', 'page');
  } catch {}

  return listing;
}

/**
 * Orders a listing for the signed-in tenant. There is no price argument: the
 * amount is read from the listing and the commission computed on the server
 * (src/modules/marketplace/server/orders.ts). A refusal comes back as
 * `{ success: false, code }`, not a throw, so the modal can say why.
 */
export async function orderMarketplaceService({
  listingId,
}: {
  listingId: string;
}): Promise<MarketplaceOrderResult> {
  // The buyer is whoever is signed in, never a tenant id sent by the browser.
  const { tenantId: buyerTenantId } = await requireTenantAction();

  const result = await placeMarketplaceOrderOn(prisma, buyerTenantId, listingId);

  if (result.success) {
    try {
      revalidatePath('/[locale]/(app)/[workspace]/marketplace', 'page');
    } catch {}
  }

  return result;
}

export async function generateApiKey({ name }: { name: string }) {
  const { tenantId } = await requireTenantAction();

  const rawKey = `fp_live_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.slice(0, 12);

  // No offline fallback: a key the caller believes exists but that was never
  // stored authenticates nothing, and printing one is worse than an error.
  const apiKeyRecord = await withTenant(tenantId, (tx) =>
    tx.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        prefix,
      },
    })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/marketplace', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/settings/api-keys', 'page');
  } catch {}

  return { apiKeyRecord, rawKey };
}

export async function revokeApiKey(keyId: string) {
  const { tenantId } = await requireTenantAction();

  // `deleteMany` so the tenant is part of the WHERE clause; `delete` takes only
  // a unique selector and would revoke another tenant's key.
  const deleted = await withTenant(tenantId, (tx) =>
    tx.apiKey.deleteMany({ where: { id: keyId, tenantId } })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/marketplace', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/settings/api-keys', 'page');
  } catch {}

  return { success: deleted.count > 0 };
}

