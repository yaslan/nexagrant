'use server';

/**
 * TASK-MULV3JXS1AW5X — the organisation's province, edited after registration.
 *
 * Tenant is a system-wide table (no RLS), so the only thing that picks the row
 * is the session: the id is `requireTenantAction().tenantId`, never a
 * parameter. Changing it needs `manage_users` (owner / admin), the same bar as
 * the other organisation-level settings. Refusals come back as values, as in
 * src/app/[locale]/(app)/ajans/actions.ts.
 */
import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { toTenantProvince, provinceAppliesTo } from '@/lib/province';
import { asRole, can } from '@/lib/rbac';
import { requireTenantAction } from '@/lib/tenant';
import { failureCode, type PilotExpiredCode } from '@/lib/pilot-expired';

export type ProvinceActionError = 'forbidden' | 'notApplicable' | 'invalid' | 'failed' | PilotExpiredCode;

export async function updateTenantProvince(
  raw: string
): Promise<{ ok: true; province: string | null } | { ok: false; error: ProvinceActionError }> {
  try {
    const scope = await requireTenantAction();
    if (!can(asRole(scope.role), 'manage_users')) return { ok: false, error: 'forbidden' };

    return await withTenant(scope.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: scope.tenantId },
        select: { country: true, province: true },
      });
      if (!tenant) return { ok: false as const, error: 'failed' as const };
      if (!provinceAppliesTo(tenant.country)) return { ok: false as const, error: 'notApplicable' as const };
      // '' clears it; any other value must be one of TR_PROVINCES.
      const province = raw === '' ? null : toTenantProvince(raw, tenant.country);
      if (raw !== '' && !province) return { ok: false as const, error: 'invalid' as const };

      if (tenant.province !== province) {
        await tx.tenant.update({ where: { id: scope.tenantId }, data: { province } });
        await tx.auditEvent.create({
          data: {
            tenantId: scope.tenantId,
            actorId: scope.userId,
            type: 'tenant.province.updated',
            data: { from: tenant.province, to: province },
          },
        });
      }
      revalidatePath('/[locale]/(app)/[workspace]/settings/profile', 'layout');
      return { ok: true as const, province };
    });
  } catch (error) {
    return { ok: false, error: failureCode(error, 'failed') };
  }
}
