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
/** A code outliving a year of events is a code nobody is watching. */
export const MAX_VALIDITY_DAYS = 366;

export class AgencyInviteError extends Error {
  constructor(
    readonly code: 'NOT_AN_AGENCY' | 'INVALID_EXPIRY',
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
  expiresAt: Date;
}

/**
 * B-1 (TASK-MUM0M211WDIW5-crw-fb, leed-fb 29.09): what the agency is told of a
 * code is its status, never a use count. A count — even "<5" beside the others —
 * joined with the funnel's rounded total (every organisation of the cohort used
 * one code: R ≤ Σ used) read a code's 1..4 uses back; with a single code it was
 * the exact registration total. src/lib/agency/funnel.attack.test.ts joins
 * this panel with the funnel.
 */
export type InviteCodeStatus = 'active' | 'revoked' | 'expired';

/** One code as it leaves the server: the dashboard's props and every list action. No count. */
export interface InviteCodeSummary {
  id: string;
  hint: string;
  label: string | null;
  status: InviteCodeStatus;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

/** A code row as the database holds it. Stays on the server. */
export interface InviteCodeRecord {
  id: string;
  hint: string;
  label: string | null;
  /** Never read for the panel (TASK-MUM2RMN3YIBGC); allowed here so a full row can be passed. */
  usedCount?: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * No "exhausted", and no use limit behind it (leed-fb 29.09). The panel first
 * dropped the status (TASK-MUM2RMN3YIBGC): it gave the code's exact use count
 * (= its limit), which joined with the funnel's rounded bounds put the one code
 * still active at 1..4 uses (TASK-MUM1OTRM75QS2-crw-fb.md B-1). The agency could
 * still try its own code on the registration form and read the same count
 * from a refusal (TASK-MUM3TMP8HU76G-crw-fb.md Ö-1), so the limit itself went
 * (TASK-MUM4WVYLSH9IT): a code is usable until it expires or is revoked, which
 * the agency already knows. `usedCount` is not read here at all.
 */
export function inviteCodeStatus(c: InviteCodeRecord, now: number): InviteCodeStatus {
  if (c.revokedAt) return 'revoked';
  if (c.expiresAt.getTime() <= now) return 'expired';
  return 'active';
}

/** The only way a code leaves the server: `usedCount` does not come along. */
export function inviteCodeRow(c: InviteCodeRecord, now: number): InviteCodeSummary {
  return {
    id: c.id,
    hint: c.hint,
    label: c.label,
    status: inviteCodeStatus(c, now),
    expiresAt: c.expiresAt.toISOString(),
    revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Validates the inputs a create call brings, before anything is written. */
export function validateInviteCodeInput(
  input: { expiresAt: Date },
  now: Date = new Date()
): void {
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
  input: { tenantId: string; createdBy: string; expiresAt: Date; label?: string | null }
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
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    },
    select: { id: true, codeHint: true, expiresAt: true },
  });
  await tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.createdBy,
      type: 'agency.invite.created',
      target: row.id,
      data: { expiresAt: row.expiresAt.toISOString() },
    },
  });
  return { id: row.id, code, hint: row.codeHint, expiresAt: row.expiresAt };
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

export async function listInviteCodesIn(
  tx: TenantTx,
  tenantId: string,
  now: number = Date.now()
): Promise<InviteCodeSummary[]> {
  const rows = await tx.agencyInviteCode.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    // Never the hash: it is the code's verifier, and a list has no use for it.
    select: {
      id: true,
      codeHint: true,
      label: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  // No usedCount: nothing the panel shows depends on it (TASK-MUM2RMN3YIBGC).
  return rows.map(({ codeHint, ...r }) => inviteCodeRow({ ...r, hint: codeHint }, now));
}

/**
 * Uses the code once and returns the agency's tenant id, or `null` for every
 * kind of unusable code — malformed, unknown, expired, revoked, or
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
