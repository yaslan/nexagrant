import { prisma } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { recordAlert } from '@/lib/observability/system-alert';
import { checkPicRegistry, type PicRegistryDeps, type PicRegistryResult } from '@/lib/pic-registry';

export type PicRegistryRefresh = PicRegistryResult & {
  /** False when the PIC changed while the register was being asked: nothing was stored, the caller must not rescore. */
  stored: boolean;
};

/**
 * FO-396. Asks the register about the tenant's PIC and stores the answer on the tenant row.
 *
 * Runs OUTSIDE any DB transaction (it waits on the network, up to the registry timeout). The
 * caller decides what to do with the status; the G0 scorer reads only the stored value and never
 * calls the register itself. A `null` pic clears the stored answer (only while the tenant still has
 * no PIC) and returns `null`. A failed
 * lookup is stored as UNKNOWN, and a changed response shape also raises a SystemAlert (the data is
 * fine, our reading of it is not). `checkPicRegistry` never throws, but the database writes here
 * can (a missing tenant, a lost connection), so callers wrap this in try/catch and keep their own
 * save intact.
 *
 * The write is conditional on the PIC that was asked about (`where: { id, pic }`, FO-396 Ö-A): if
 * the tenant changed its PIC while the lookup waited, the answer is dropped (`stored: false`) and
 * the newer PIC's own lookup decides.
 */
export async function refreshTenantPicRegistry(
  tenantId: string,
  pic: string | null,
  deps: PicRegistryDeps = {}
): Promise<PicRegistryRefresh | null> {
  // An id that is missing would drop out of the `where` below and match every tenant (see required-id.ts).
  const tenantKey = requireActionId(tenantId, 'tenantId');
  if (pic === null) {
    // NG-85 F6: clear only while the tenant still has no PIC. A PIC saved in the meantime keeps the
    // answer its own lookup stored (same rule as the write below and tenant-pic-removal.ts).
    await prisma.tenant.updateMany({
      where: { id: tenantKey, pic: null },
      data: { picRegistryStatus: null, picRegistryCheckedAt: null },
    });
    return null;
  }
  const askedPic = requireActionId(pic, 'pic');

  const result = await checkPicRegistry(askedPic, deps);
  const { count } = await prisma.tenant.updateMany({
    where: { id: tenantKey, pic: askedPic },
    data: { picRegistryStatus: result.status, picRegistryCheckedAt: new Date() },
  });
  if (count === 0) return { ...result, stored: false };

  if (result.reason === 'schema_changed') {
    // No organisation name and no tenant id in the message or meta (NG-85 F1): SystemAlert has no
    // tenantId column and no RLS, so a tenant id must not go into it (system-alert.ts). Only the reason.
    await recordAlert({
      level: 'warn',
      source: 'pic-registry',
      message: 'EU participant register answered in a shape we do not recognise; PIC treated as UNKNOWN',
      meta: { reason: result.reason },
    });
  }
  return { ...result, stored: true };
}
