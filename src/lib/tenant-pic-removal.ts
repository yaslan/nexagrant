/**
 * FO-383 (K-576942): the way back when a tenant holds a PIC that is not its own.
 *
 * Nothing proves portal ownership, and one PIC sits on one live tenant, so the real owner is
 * refused until staff take the claim off the other account. The authorisation edge is the action
 * (`requirePlatformAdmin`) in src/app/[locale]/admin/tenants/actions.ts.
 *
 * Clears `Tenant.pic`, then rescores the tenant's stored G0 scores (FO-384). The rescore runs after
 * the write has committed and never rejects, so a failure there cannot undo the removal.
 */
import { withTenant } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { rescoreTenantG0AfterPicChange } from '@/lib/scoring/g0-rescore-tenant';

/** The tenant no longer holds the PIC the operator saw: it changed, or it is already gone. */
export class TenantPicChangedError extends Error {
  readonly code = 'PIC_CHANGED';
  constructor() {
    super('The tenant no longer holds this PIC.');
    this.name = 'TenantPicChangedError';
  }
}

/**
 * Clears the PIC the operator was looking at, never whatever the tenant has saved since: the
 * compare and the write are one statement. `withTenant` because the audit row is the target
 * tenant's; `Tenant` itself has no RLS.
 */
export async function removeTenantPic(tenantId: string, expectedPic: string, actorId: string, note: string): Promise<void> {
  // `undefined` would drop out of the where and turn this into "clear whatever is there".
  const seenPic = requireActionId(expectedPic, 'expectedPic');
  const auditEventId = await withTenant(tenantId, async (tx) => {
    const { count } = await tx.tenant.updateMany({
      where: { id: tenantId, pic: seenPic },
      // FO-396 (B3): the stored register answer belonged to the removed PIC; clear it in the same statement.
      data: { pic: null, picRegistryStatus: null, picRegistryCheckedAt: null },
    });
    if (count === 0) throw new TenantPicChangedError();
    const audit = await tx.auditEvent.create({
      data: { tenantId, actorId, type: 'tenant.pic.removed', data: { from: seenPic, note } },
    });
    return String(audit.id);
  });
  // FO-384: after the commit, so the rescore reads the cleared PIC.
  await rescoreTenantG0AfterPicChange(tenantId, { trigger: 'admin_removed', auditEventId });
}
