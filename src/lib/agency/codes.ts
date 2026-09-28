/**
 * Agency invite codes — the database half (TASK-MULRQJQYM0NAM, FB KAMU B1).
 *
 * Management (create / revoke / list) runs inside the agency's own tenant scope
 * (`TenantTx`): `AgencyInviteCode` is under `tenant_isolation`, so an agency
 * sees and changes its own codes and nothing else.
 *
 * Redemption is different: the registrant has no tenant yet. It goes through
 * the SECURITY DEFINER function `redeem_agency_invite`, which uses a code once,
 * atomically, and answers only "which agency" or NULL
 * (prisma/migrations/add-agency-invite-code.sql). Nothing in this module — or
 * anywhere — reads a linked organisation's rows on the agency's behalf.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import {
  generateInviteCode,
  hashInviteCode,
  inviteCodeHint,
  normalizeInviteCode,
} from './invite-code';

export const MAX_USES_LIMIT = 10_000;
/** A code outliving a year of events is a code nobody is watching. */
export const MAX_VALIDITY_DAYS = 366;

export class AgencyInviteError extends Error {
  constructor(
    readonly code: 'NOT_AN_AGENCY' | 'INVALID_MAX_USES' | 'INVALID_EXPIRY',
    message: string
  ) {
    super(message);
    this.name = 'AgencyInviteError';
  }
}

export interface CreatedInviteCode {
  id: string;
  /** The code in clear. Returned exactly once; the database keeps only its hash. */
  code: string;
  hint: string;
  maxUses: number;
  expiresAt: Date;
}

export interface InviteCodeSummary {
  id: string;
  hint: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Validates the inputs a create call brings, before anything is written. */
export function validateInviteCodeInput(
  input: { maxUses: number; expiresAt: Date },
  now: Date = new Date()
): void {
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > MAX_USES_LIMIT) {
    throw new AgencyInviteError('INVALID_MAX_USES', `maxUses must be an integer between 1 and ${MAX_USES_LIMIT}`);
  }
  const t = input.expiresAt instanceof Date ? input.expiresAt.getTime() : NaN;
  if (!Number.isFinite(t) || t <= now.getTime() || t > now.getTime() + MAX_VALIDITY_DAYS * 86_400_000) {
    throw new AgencyInviteError('INVALID_EXPIRY', `expiresAt must be in the future and at most ${MAX_VALIDITY_DAYS} days away`);
  }
}

async function assertAgency(tx: TenantTx, tenantId: string): Promise<void> {
  // Tenant is not under RLS (system-wide table); the id comes from the session.
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { kind: true, deletedAt: true } });
  if (!tenant || tenant.kind !== 'AGENCY' || tenant.deletedAt) {
    throw new AgencyInviteError('NOT_AN_AGENCY', 'Only an agency tenant can manage invite codes');
  }
}

export async function createInviteCodeIn(
  tx: TenantTx,
  input: { tenantId: string; createdBy: string; maxUses: number; expiresAt: Date; label?: string | null }
): Promise<CreatedInviteCode> {
  validateInviteCodeInput(input);
  await assertAgency(tx, input.tenantId);

  const code = generateInviteCode();
  const normalized = normalizeInviteCode(code)!;
  const row = await tx.agencyInviteCode.create({
    data: {
      tenantId: input.tenantId,
      codeHash: hashInviteCode(normalized),
      codeHint: inviteCodeHint(normalized),
      label: input.label?.trim() || null,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    },
    select: { id: true, codeHint: true, maxUses: true, expiresAt: true },
  });
  await tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.createdBy,
      type: 'agency.invite.created',
      target: row.id,
      data: { maxUses: row.maxUses, expiresAt: row.expiresAt.toISOString() },
    },
  });
  return { id: row.id, code, hint: row.codeHint, maxUses: row.maxUses, expiresAt: row.expiresAt };
}

/**
 * Idempotent: revoking a revoked code changes nothing and reports `false`.
 * A code of another agency is invisible under RLS and reports `false` too.
 */
export async function revokeInviteCodeIn(
  tx: TenantTx,
  input: { tenantId: string; id: string; revokedBy: string }
): Promise<boolean> {
  await assertAgency(tx, input.tenantId);
  const { count } = await tx.agencyInviteCode.updateMany({
    where: { id: input.id, tenantId: input.tenantId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: input.revokedBy },
  });
  if (count > 0) {
    await tx.auditEvent.create({
      data: { tenantId: input.tenantId, actorId: input.revokedBy, type: 'agency.invite.revoked', target: input.id },
    });
  }
  return count > 0;
}

export async function listInviteCodesIn(tx: TenantTx, tenantId: string): Promise<InviteCodeSummary[]> {
  const rows = await tx.agencyInviteCode.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    // Never the hash: it is the code's verifier, and a list has no use for it.
    select: {
      id: true,
      codeHint: true,
      label: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows.map(({ codeHint, ...r }) => ({ ...r, hint: codeHint }));
}

/**
 * Uses the code once and returns the agency's tenant id, or `null` for every
 * kind of unusable code — malformed, unknown, expired, spent, revoked, or
 * belonging to an agency that no longer is one. The caller cannot tell these
 * apart, and neither can whoever typed the code.
 *
 * Call it inside the registration transaction: if anything after it fails,
 * the use is rolled back with the account.
 */
export async function redeemInviteCode(
  tx: Prisma.TransactionClient,
  rawCode: unknown
): Promise<string | null> {
  const normalized = normalizeInviteCode(rawCode);
  if (!normalized) return null;
  const rows = await tx.$queryRaw<{ agency: string | null }[]>`
    SELECT public.redeem_agency_invite(${hashInviteCode(normalized)}) AS agency`;
  return rows[0]?.agency ?? null;
}

/**
 * Counts one refused attempt (reason only — never the code, its hash, or who
 * tried). Must run OUTSIDE the transaction that was refused, or it rolls back
 * with it. Best effort: a failure here must not change what the registrant sees.
 */
export async function noteInviteRejection(client: PrismaClient, rawCode: unknown): Promise<void> {
  const normalized = normalizeInviteCode(rawCode);
  // A malformed code is recorded as 'unknown' — the function receives NULL.
  const hash = normalized ? hashInviteCode(normalized) : null;
  await client.$executeRaw`SELECT public.note_agency_invite_rejection(${hash})`;
}

/** Thrown inside the registration transaction to roll it back. */
export class InviteCodeRejectedError extends Error {
  constructor() {
    super('invite code rejected');
    this.name = 'InviteCodeRejectedError';
  }
}
