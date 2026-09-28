'use server';

/**
 * Minimal server actions for agency invite codes (TASK-MULRQJQYM0NAM, FB KAMU B1).
 * The management screen is B2; these are the calls it will make.
 *
 * Creating and revoking codes is inviting people, so it takes `manage_users`
 * (TENANT_OWNER / TENANT_ADMIN). Listing is open to any member of the agency.
 * Turning a tenant into an agency is a platform-admin act.
 */
import { prisma, withTenant } from '@/lib/db';
import { asRole, can } from '@/lib/rbac';
import { requirePlatformAdmin, requireTenantAction } from '@/lib/tenant';
import {
  createInviteCodeIn,
  listInviteCodesIn,
  revokeInviteCodeIn,
  type CreatedInviteCode,
  type InviteCodeSummary,
} from './codes';

export class AgencyPermissionError extends Error {
  constructor() {
    super('Managing invite codes needs the manage_users permission');
    this.name = 'AgencyPermissionError';
  }
}

export async function createAgencyInviteCodeAction(input: {
  maxUses: number;
  expiresAt: string | Date;
  label?: string | null;
}): Promise<CreatedInviteCode> {
  const scope = await requireTenantAction();
  if (!can(asRole(scope.role), 'manage_users')) throw new AgencyPermissionError();
  return withTenant(scope.tenantId, (tx) =>
    createInviteCodeIn(tx, {
      tenantId: scope.tenantId,
      createdBy: scope.userId,
      maxUses: input.maxUses,
      expiresAt: new Date(input.expiresAt),
      label: input.label ?? null,
    })
  );
}

export async function revokeAgencyInviteCodeAction(id: string): Promise<{ revoked: boolean }> {
  const scope = await requireTenantAction();
  if (!can(asRole(scope.role), 'manage_users')) throw new AgencyPermissionError();
  const revoked = await withTenant(scope.tenantId, (tx) =>
    revokeInviteCodeIn(tx, { tenantId: scope.tenantId, id, revokedBy: scope.userId })
  );
  return { revoked };
}

export async function listAgencyInviteCodesAction(): Promise<InviteCodeSummary[]> {
  const scope = await requireTenantAction();
  return withTenant(scope.tenantId, (tx) => listInviteCodesIn(tx, scope.tenantId));
}

/** Platform admin only. Tenant is a system-wide table (not under RLS). */
export async function setTenantKindAction(
  tenantId: string,
  kind: 'ORGANIZATION' | 'AGENCY'
): Promise<{ id: string; kind: string }> {
  const { userId } = await requirePlatformAdmin();
  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { kind }, select: { id: true, kind: true } });
  await withTenant(tenantId, (tx) =>
    tx.auditEvent.create({ data: { tenantId, actorId: userId, type: 'tenant.kind.changed', data: { kind } } })
  );
  return tenant;
}
