import { BETA_SUPPORT_EMAIL } from '@/lib/beta/constants';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { PIC_REGISTRY_STATUSES, type PicRegistryStatus } from '@/lib/pic-registry';
import TenantProfileForm from './profile-form';

/** The stored column is a plain string; anything we do not know reads as "not checked". */
function toPicRegistryStatus(value: string | null): PicRegistryStatus | null {
  return PIC_REGISTRY_STATUSES.find((status) => status === value) ?? null;
}

/**
 * TASK-MUPVLWSIPC5WU — the form used to start from hard-coded text on every
 * load, so a saved profile looked lost after a reload (Y-4). The stored row is
 * read here, on the server, inside the session's own tenant (RLS via
 * withTenant); the tenant id comes only from the session.
 */
export default async function TenantProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const scope = await requireTenantPage(locale);
  const { initial, pic, picMatch, picRegistryStatus } = await withTenant(scope.tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: scope.tenantId },
      select: { pic: true, picRegistryStatus: true },
    });
    const storedPic = tenant?.pic ?? null;
    return {
      initial: await tx.tenantProfile.findUnique({
        where: { tenantId: scope.tenantId },
        select: { capabilities: true, keywords: true, trlRange: true },
      }),
      pic: storedPic,
      // FO-396: what the EU register said about this PIC (stored by the save; never asked from here).
      picRegistryStatus: storedPic ? toPicRegistryStatus(tenant?.picRegistryStatus ?? null) : null,
      picMatch: storedPic
        ? await tx.cordisOrganization.findUnique({
            where: { organisationId: storedPic },
            select: { name: true, city: true, country: true },
          })
        : null,
    };
  });

  return (
    <TenantProfileForm
      initial={initial}
      initialPic={pic}
      initialPicMatch={picMatch}
      initialPicRegistryStatus={picRegistryStatus}
      supportEmail={BETA_SUPPORT_EMAIL}
    />
  );
}
