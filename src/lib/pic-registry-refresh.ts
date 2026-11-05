import { prisma } from '@/lib/db';
import { recordAlert } from '@/lib/observability/system-alert';
import { checkPicRegistry, type PicRegistryDeps, type PicRegistryResult } from '@/lib/pic-registry';

/**
 * FO-396. Asks the register about the tenant's PIC and stores the answer on the tenant row.
 *
 * Runs OUTSIDE any DB transaction (it waits on the network, up to the registry timeout). The
 * caller decides what to do with the status; the G0 scorer reads only the stored value and never
 * calls the register itself. A `null` pic clears the stored answer. Never throws: a failed lookup
 * is stored as UNKNOWN, and a changed response shape also raises a SystemAlert (the data is fine,
 * our reading of it is not).
 */
export async function refreshTenantPicRegistry(
  tenantId: string,
  pic: string | null,
  deps: PicRegistryDeps = {}
): Promise<PicRegistryResult | null> {
  if (pic === null) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { picRegistryStatus: null, picRegistryCheckedAt: null } });
    return null;
  }

  const result = await checkPicRegistry(pic, deps);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { picRegistryStatus: result.status, picRegistryCheckedAt: new Date() },
  });

  if (result.reason === 'schema_changed') {
    // No organisation name in the message or meta: only the tenant id and the reason.
    await recordAlert({
      level: 'warn',
      source: 'pic-registry',
      message: 'EU participant register answered in a shape we do not recognise; PIC treated as UNKNOWN',
      meta: { tenantId, reason: result.reason },
    });
  }
  return result;
}
