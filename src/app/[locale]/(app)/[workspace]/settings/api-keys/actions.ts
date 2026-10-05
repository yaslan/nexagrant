'use server';

import type { ApiKey } from '@prisma/client';
import { withTenant } from '@/lib/db';
import { asRole, can } from '@/lib/rbac';
import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
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
 *
 * A key reads the whole tenant through the partner API, so minting and revoking
 * one needs `manage_users` (owner / admin), the bar the other organisation-level
 * settings use (settings/profile/actions.ts). TASK-MULU88PPI3HY3, review K-12.
 * Refusals come back as values; a missing session still throws.
 */

// Not exported: a 'use server' module may export async functions only.
const API_KEY_NAME_MAX = 100;

export type ApiKeyActionError = 'forbidden' | 'invalidName';

/**
 * What the browser gets back. The return value of a server action is
 * serialised into the response, so the full row sent `keyHash` (the key's
 * verifier) and `tenantId` to the client (TASK-MUMT3KVHJTYX0).
 */
export type ApiKeyView = Pick<ApiKey, 'id' | 'name' | 'prefix' | 'lastUsedAt' | 'createdAt'>;

export async function generateApiKey({
  name,
}: {
  name: string;
}): Promise<{ apiKeyRecord: ApiKeyView; rawKey: string } | { error: ApiKeyActionError }> {
  const { tenantId, role } = await requireTenantAction();
  if (!can(asRole(role), 'manage_users')) return { error: 'forbidden' };

  // The action is a public POST endpoint: `name` is whatever the caller sent.
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0 || trimmed.length > API_KEY_NAME_MAX) {
    return { error: 'invalidName' };
  }

  const rawKey = `fp_live_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.slice(0, 12);

  // No offline fallback: a key the caller believes exists but that was never
  // stored authenticates nothing, and printing one is worse than an error.
  const apiKeyRecord = await withTenant(tenantId, (tx) =>
    tx.apiKey.create({
      data: {
        tenantId,
        name: trimmed,
        keyHash,
        prefix,
      },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/settings/api-keys', 'page');
  } catch {}

  return { apiKeyRecord, rawKey };
}

export async function revokeApiKey(
  keyId: string
): Promise<{ success: boolean } | { success: false; error: 'forbidden' }> {
  const { tenantId, role } = await requireTenantAction();
  if (!can(asRole(role), 'manage_users')) return { success: false, error: 'forbidden' };
  // Client-supplied: an `undefined` id would drop out of the `where` below and
  // revoke every key of the tenant (TASK-MUMSUA77J1C6Q).
  if (!isPresentId(keyId)) return { success: false };

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
