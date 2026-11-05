import { requireTenantPageRole } from '@/lib/page-role';
import MembersSettingsClient from './members-client';

/**
 * Settings → Members (tr `/ayarlar/uyeler`). The screen was a client component
 * with no server half, so any member who typed the URL got the invitation form
 * (NG-64); only `POST /api/invitations` and the /api/team routes refused. The
 * door is now here, on the same permission the menu entry and those routes
 * stand behind: `manage_users` (TENANT_OWNER, TENANT_ADMIN).
 */
export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale } = await params;
  await requireTenantPageRole(locale, 'manage_users');
  return <MembersSettingsClient />;
}
