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
import { isPresentId } from '@/lib/required-id';
import { INVITE_CODE_DEFAULT_USE_LIMIT } from './invite-policy';
import {
  generateInviteCode,
  hashInviteCode,
  inviteCodeHint,
  normalizeInviteCode,
} from './invite-code';
/** A code outliving a year of events is a code nobody is watching. */
export const MAX_VALIDITY_DAYS = 366;

const DAY_MS = 86_400_000;
/** 23:59:59 — the last second of a UTC day, from its midnight. */
const END_OF_DAY_MS = DAY_MS - 1_000;

/**
 * The panel picks a day (yyyy-mm-dd); the code stays valid through that day's
 * last second, UTC. Anything else is an invalid date, which validation refuses.
 */
export function expiryFromDay(day: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T23:59:59.000Z`) : new Date(NaN);
}

/**
 * The latest day the panel may offer (K-7, İNCELEME-12): the last day whose end
 * (expiryFromDay) is still within MAX_VALIDITY_DAYS of `now`. Derived from the
 * same constant validation uses, so the date field and the server cannot drift
 * apart. Because the code runs to the end of the chosen day, this is usually
 * today + 365 and today + 366 only in the final second of a UTC day.
 */
export function lastExpiryDay(now: number): string {
  return new Date(now + MAX_VALIDITY_DAYS * DAY_MS - END_OF_DAY_MS).toISOString().slice(0, 10);
}

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
 *
 * FO-392 adds 'exhausted' for a code that reached its useLimit. That is the one
 * place a number's consequence shows again; the registration form already says
 * the same to anyone who types the code, so the panel adds nothing to what the
 * agency can find out (see the report, K-577141).
 */
export type InviteCodeStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

/** One code as it leaves the server: the dashboard's props and every list action. No count. */
export interface InviteCodeSummary {
  id: string;
  hint: string;
  label: string | null;
  status: InviteCodeStatus;
  /** Uses the code may reach; `null` = unlimited (a code from before FO-392). Never the used count. */
  useLimit: number | null;
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
  /** `null` = unlimited. */
  useLimit?: number | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * Status for the panel. Revoked and expired win over exhausted, as in
 * note_agency_invite_rejection(). 'exhausted' is the only status that reads
 * `usedCount`, and only against the code's own limit: the number itself still
 * never leaves the server (inviteCodeRow). A code without a limit (NULL, from
 * before FO-392) is never exhausted.
 */
export function inviteCodeStatus(c: InviteCodeRecord, now: number): InviteCodeStatus {
  if (c.revokedAt) return 'revoked';
  if (c.expiresAt.getTime() <= now) return 'expired';
  if (c.useLimit != null && (c.usedCount ?? 0) >= c.useLimit) return 'exhausted';
  return 'active';
}

/** The only way a code leaves the server: `usedCount` does not come along. */
export function inviteCodeRow(c: InviteCodeRecord, now: number): InviteCodeSummary {
  return {
    id: c.id,
    hint: c.hint,
    label: c.label,
    status: inviteCodeStatus(c, now),
    useLimit: c.useLimit ?? null,
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
  if (!Number.isFinite(t) || t <= now.getTime() || t > now.getTime() + MAX_VALIDITY_DAYS * DAY_MS) {
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
      useLimit: INVITE_CODE_DEFAULT_USE_LIMIT,
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
      data: { expiresAt: row.expiresAt.toISOString(), useLimit: INVITE_CODE_DEFAULT_USE_LIMIT },
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
  // `id` comes from the client. Prisma drops an `undefined` key from `where`, which would
  // revoke every code of the agency; a missing id reports `false` like an unknown one
  // (TASK-MUN2KUHP1BP18).
  if (!isPresentId(input.id) || !isPresentId(input.tenantId)) return false;
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
      useLimit: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  // usedCount is read only to decide 'exhausted'; inviteCodeRow drops it (TASK-MUM2RMN3YIBGC).
  return rows.map(({ codeHint, ...r }) => inviteCodeRow({ ...r, hint: codeHint }, now));
}

/**
 * Uses the code once and returns the agency's tenant id, or `null` for every
 * kind of unusable code — malformed, unknown, expired, revoked, used up, or
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
