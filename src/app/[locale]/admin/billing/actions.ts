'use server';

import { configureEnterpriseSso, EnterpriseSsoConfig } from '@/lib/sso';

export async function handleConfigureSso(config: EnterpriseSsoConfig) {
  return await configureEnterpriseSso(config);
}
