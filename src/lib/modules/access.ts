import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ModuleId, ModuleStatus } from '@/lib/modules/types';
import { Role } from '@prisma/client';

export interface ModuleAccessResult {
  allowed: boolean;
  status: ModuleStatus;
  reason?: string;
}

export async function checkModuleAccess(moduleId: ModuleId): Promise<ModuleAccessResult> {
  const session = await auth();
  if (!session?.user) {
    return { allowed: false, status: 'OFF', reason: 'Not authenticated' };
  }

  const tenantId = session.tenantId;
  const role = session.role as Role;

  if (!tenantId) {
    return { allowed: false, status: 'OFF', reason: 'No active tenant' };
  }

  const state = await prisma.moduleState.findUnique({
    where: {
      tenantId_moduleId: {
        tenantId,
        moduleId,
      }
    }
  });

  const status = state?.status || 'OFF';

  if (status === 'OFF') {
    return { allowed: false, status, reason: 'Module is turned off' };
  }

  if (status === 'ON') {
    return { allowed: true, status };
  }

  // PILOT mode is only accessible to PIPELINE_MANAGER, TENANT_ADMIN, TENANT_OWNER
  if (status === 'PILOT') {
    const isManagerOrAbove = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER'].includes(role);
    if (isManagerOrAbove) {
      return { allowed: true, status };
    }
    return { allowed: false, status, reason: 'Module is in pilot phase and restricted to managers.' };
  }

  // DEV mode might only be accessible to TENANT_OWNER or platform_admin (skipping platform_admin for now)
  if (status === 'DEV') {
    if (role === 'TENANT_OWNER') {
      return { allowed: true, status };
    }
    return { allowed: false, status, reason: 'Module is in development and restricted to owners.' };
  }

  return { allowed: false, status, reason: 'Unknown status' };
}

/**
 * Asserts module access. Throws an error if not allowed, useful for Server Actions.
 */
export async function assertModuleAccess(moduleId: ModuleId) {
  const access = await checkModuleAccess(moduleId);
  if (!access.allowed) {
    throw new Error(`Module Access Denied: ${access.reason}`);
  }
}
