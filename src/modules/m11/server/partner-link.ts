'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { issueSecretToken } from '@/lib/secret-token';

/**
 * Issues a new consortium partner portal link for the session tenant's Part A
 * (TASK-MULQLL2T8ZJX4).
 *
 * The portal token used to be stored in plain text, and the application screen
 * read it back to show the link. Only its SHA-256 is stored now, so the link can
 * be shown exactly once — in the response to this call. Issuing a new one
 * replaces the stored hash, which also revokes the previous link: that is the
 * way to cut off a partner, or to recover from a link that went to the wrong
 * person.
 *
 * Returns the raw token (not a URL: the origin is the browser's). `null` when
 * the part is not this tenant's Part A.
 */
export async function issuePartnerPortalLink(partId: string): Promise<{ token: string } | null> {
  const { tenantId } = await requireTenantAction();
  if (!isPresentId(partId)) return null;

  const { raw, hash } = issueSecretToken();
  const result = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.applicationPart.updateMany({
      where: { id: partId, tenantId, part: 'PART_A' },
      data: { magicTokenHash: hash },
    })
  );

  return result.count > 0 ? { token: raw } : null;
}
