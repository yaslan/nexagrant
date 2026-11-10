import { prisma } from '@/lib/db';
import { requireId } from './teardown-guard';

/**
 * FO-396. Removes the `pic-registry` alerts one test tenant left behind. `SystemAlert` has no
 * tenantId column, so the tenant sweep cannot reach these rows. Since NG-85 F1 the register alerts
 * carry no tenant id at all (they are tenant-agnostic and fold into one row), so this only clears
 * rows an older run wrote with `meta.tenantId`, which `pnpm alerts:check` would report as orphans.
 * `requireId` keeps an unset id from becoming a filterless delete.
 */
export async function deletePicRegistryAlerts(tenantId: string | null | undefined): Promise<void> {
  const id = requireId(tenantId, 'tenantId');
  await prisma.systemAlert.deleteMany({
    where: { source: 'pic-registry', meta: { path: ['tenantId'], equals: id } },
  });
}
