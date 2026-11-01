'use server';

/**
 * Co-brand action of the agency dashboard (FB KAMU B4, TASK-MULRRNIHVZM1Z).
 * Known refusals come back as result values, like ./actions.ts, so the form can
 * say what was wrong.
 */
import { revalidatePath } from 'next/cache';
import { requireTenantAction } from '@/lib/tenant';
import { failureCode, type PilotExpiredCode } from '@/lib/pilot-expired';
import { isAgencyTenant } from '@/lib/agency/funnel';
import { normalizeCoBrandName, sanitizeLogoPng, COBRAND_MAX_BYTES, type LogoRejection } from '@/lib/agency/cobrand';
import { CoBrandStorageError, saveAgencyCoBrand } from '@/lib/agency/cobrand-store';

export type CoBrandActionError = LogoRejection | 'forbidden' | 'notAgency' | 'storage' | 'failed' | PilotExpiredCode;

/** Only the agency tenant's owners and admins change what its organisations see. */
const EDITOR_ROLES = new Set(['TENANT_OWNER', 'TENANT_ADMIN']);

export async function saveCoBrand(
  formData: FormData
): Promise<{ ok: true; name: string; hasLogo: boolean; updatedAt: string } | { ok: false; error: CoBrandActionError }> {
  try {
    const scope = await requireTenantAction();
    if (!EDITOR_ROLES.has(scope.role)) return { ok: false, error: 'forbidden' };
    if (!(await isAgencyTenant(scope.tenantId))) return { ok: false, error: 'notAgency' };

    const name = normalizeCoBrandName(formData.get('name'));
    let logo: Buffer | 'keep' | 'remove' = formData.get('removeLogo') === '1' ? 'remove' : 'keep';
    const file = formData.get('logo');
    if (file instanceof File && file.size > 0) {
      // Size first, before reading the body into memory.
      if (file.size > COBRAND_MAX_BYTES) return { ok: false, error: 'tooLarge' };
      const checked = sanitizeLogoPng(new Uint8Array(await file.arrayBuffer()));
      if (!checked.ok) return { ok: false, error: checked.error };
      logo = checked.png;
    }

    const entry = await saveAgencyCoBrand(scope.tenantId, { name, logo });
    // Every page under the app shell shows the line; the layout re-reads it.
    revalidatePath('/[locale]', 'layout');
    return { ok: true, name: entry.name, hasLogo: entry.logoKey !== null, updatedAt: entry.updatedAt };
  } catch (e) {
    return { ok: false, error: e instanceof CoBrandStorageError ? 'storage' : failureCode(e, 'failed') };
  }
}
