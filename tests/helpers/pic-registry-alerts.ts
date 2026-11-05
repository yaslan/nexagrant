import { prisma } from '@/lib/db';
import { requireId } from './teardown-guard';

/**
 * FO-396. Removes the `pic-registry` alerts one test tenant left behind. `SystemAlert` has no
 * tenantId column (the id sits in `meta`), so the tenant sweep cannot reach these rows, and
 * `pnpm alerts:check` then reports them as orphans. `requireId` keeps an unset id from becoming a
 * filterless delete.
 */
export async function deletePicRegistryAlerts(tenantId: string | null | undefined): Promise<void> {
  const id = requireId(tenantId, 'tenantId');
  await prisma.systemAlert.deleteMany({
    where: { source: 'pic-registry', meta: { path: ['tenantId'], equals: id } },
  });
}
