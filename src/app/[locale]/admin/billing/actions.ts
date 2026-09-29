'use server';

import { configureEnterpriseSso, EnterpriseSsoConfig } from '@/lib/sso';
import { requirePlatformAdmin, requireTenantAction } from '@/lib/tenant';

/**
 * Save the SSO configuration of the signed-in admin's own tenant.
 *
 * This used to pass the browser's `config` straight through, `tenantId`
 * included, with no session check (TASK-MUMJ2ERCFP964): any caller who knew the
 * action id could point any tenant's e-mail domain at an IdP of their choosing.
 * The admin layout 404s a non-platform-admin, but a server action is its own
 * HTTP entry point, so the role is checked here as well — and the tenant comes
 * from the session. The `tenantId` in `config` is ignored.
 */
export async function handleConfigureSso(config: EnterpriseSsoConfig) {
  await requirePlatformAdmin();
  const { tenantId } = await requireTenantAction();
  return await configureEnterpriseSso({ ...config, tenantId });
}
