'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

/**
 * Partner API keys. These lived beside the marketplace actions until the
 * marketplace was removed (ADR-0005); the keys stay.
 *
 * `tenantId` was an argument here once. On `generateApiKey` that was the worst
 * case in the codebase: a server action is a public POST endpoint, so anyone
 * could mint a live API key *for another tenant* and then use it against the
 * partner API. `revokeApiKey` deleted by key id alone, so any tenant's key
 * could be destroyed. Both are session-scoped now.
 */

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
    revalidatePath('/[locale]/(app)/[workspace]/settings/api-keys', 'page');
  } catch {}

  return { success: deleted.count > 0 };
}
