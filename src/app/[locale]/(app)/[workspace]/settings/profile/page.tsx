import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import TenantProfileForm from './profile-form';

/**
 * TASK-MUPVLWSIPC5WU — the form used to start from hard-coded text on every
 * load, so a saved profile looked lost after a reload (Y-4). The stored row is
 * read here, on the server, inside the session's own tenant (RLS via
 * withTenant); the tenant id comes only from the session.
 */
export default async function TenantProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const scope = await requireTenantPage(locale);
  const initial = await withTenant(scope.tenantId, (tx) =>
    tx.tenantProfile.findUnique({
      where: { tenantId: scope.tenantId },
      select: { capabilities: true, keywords: true, trlRange: true },
    })
  );

  return <TenantProfileForm initial={initial} />;
}
