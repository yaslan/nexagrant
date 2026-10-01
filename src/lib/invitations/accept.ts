/**
 * Accepting a tenant invitation (TASK-MUN2793A57Z9I).
 *
 * POST /api/invitations mails `/<locale>/accept-invite?token=<raw>` and keeps
 * only `sha256(raw)` in `Invitation.tokenHash`. Nothing read that token until
 * this module: the link in every invitation e-mail led to a 404. The rules come
 * from İNCELEME-28 (docs/agent-results/TASK-MUN2AKGX5HOXN-se-fb.md §3 (a)–(d)):
 *
 *   (a) the row is found by the token's hash and checked again with
 *       `secretTokenMatches` (constant time); `expires` is enforced;
 *   (b) single use: `acceptedAt` is set by one conditional UPDATE, so two
 *       concurrent accepts cannot both win;
 *   (c) the signed-in account's e-mail must be the invited address. The raw
 *       token also goes back to the inviter (the API response), so without
 *       this the inviter could accept with any other account;
 *   (d) the token leaves the URL at once — see accept-cookie.ts and the GET
 *       handler — and is never logged: nothing here logs the token, its hash
 *       or the invited address.
 *
 * Two ways in, one core ({@link acceptInvitationIn}):
 *   - an existing account presses "accept" (the server action);
 *   - a new account is created by Google sign-in from the accept screen
 *     ({@link registerInvitedOAuthUser}, the adapter's `createUser`). That
 *     registration joins the inviting tenant and never opens a tenant of its
 *     own — the plain OAuth registration would have.
 *
 * An expired pilot keeps its gate: accepting writes a Membership into the
 * tenant, so a tenant whose free pilot has ended refuses it like any other
 * write (src/lib/billing/pilot.ts).
 */
import type { Prisma, PrismaClient, Role, User } from '@prisma/client';

import { withTenant, type TenantTx } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { getPilotState } from '@/lib/billing/pilot';
import { lockTenantSeats, readSeatUsage } from '@/lib/billing/seat-limit';
import { bindTransactionToTenant, writeRegistrationConsent } from '@/lib/legal/registration-consent';
import { hashSecretToken, secretTokenMatches } from '@/lib/secret-token';
import { withSystemScope } from '@/lib/system-scope';

import { readParkedInvitation, type InvitationLocale } from './accept-cookie';

/** AuditEvent type of an accepted invitation. Target is the invitation id, never the address. */
export const INVITATION_ACCEPTED = 'invitation.accepted';

export interface InvitationView {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: Role;
  expires: Date;
}

/**
 * - `invalid`: no token, an unknown one, or one replaced by a newer invitation
 *   to the same address (a re-invite rotates the token).
 * - `revoked`: the inviting organisation has been deleted.
 * - `expired`, `used`: as named.
 */
export type InvitationState =
  | { status: 'invalid' }
  | { status: 'revoked' }
  | { status: 'expired'; invitation: InvitationView }
  | { status: 'used'; invitation: InvitationView }
  | { status: 'pending'; invitation: InvitationView };

export interface InvitationLookupRow {
  id: string;
  email: string;
  tenantId: string;
  role: Role;
  tokenHash: string;
  expires: Date;
  acceptedAt: Date | null;
  tenant: { name: string; deletedAt: Date | null };
}

/** Pure: what the row found for `token` means right now. */
export function classifyInvitation(
  row: InvitationLookupRow | null,
  token: string,
  now: Date = new Date()
): InvitationState {
  if (!row || !secretTokenMatches(token, row.tokenHash)) return { status: 'invalid' };
  if (row.tenant.deletedAt) return { status: 'revoked' };
  const invitation: InvitationView = {
    id: row.id,
    email: row.email,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    role: row.role,
    expires: row.expires,
  };
  if (row.acceptedAt) return { status: 'used', invitation };
  if (row.expires.getTime() <= now.getTime()) return { status: 'expired', invitation };
  return { status: 'pending', invitation };
}

/**
 * Finds the invitation behind a raw token. The token is the credential and the
 * row names its own tenant, so the read has to leave tenant scope — the same
 * shape as the partner portal and API-key lookups (scripts/tenant-bypass-baseline.json).
 */
export async function lookupInvitation(token: string | null, now: Date = new Date()): Promise<InvitationState> {
  if (!token) return { status: 'invalid' };
  const row = await withSystemScope('tenant-discovery', 'invitation-accept.byTokenHash', (tx) =>
    tx.invitation.findUnique({
      where: { tokenHash: hashSecretToken(token) },
      select: {
        id: true,
        email: true,
        tenantId: true,
        role: true,
        tokenHash: true,
        expires: true,
        acceptedAt: true,
        tenant: { select: { name: true, deletedAt: true } },
      },
    })
  );
  return classifyInvitation(row, token, now);
}

/** Pure: the two addresses name the same mailbox (case and outer spaces aside). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Pure: `d***@example.com`. What the accept screen shows of the invited address
 * to someone signed in with a different one — enough to recognise their own
 * address, not enough to learn a stranger's.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** Has the tenant's free pilot ended? Accepting is a write, so it is then refused. */
export async function isInvitingTenantReadOnly(tenantId: string): Promise<boolean> {
  return (await getPilotState(tenantId)).kind === 'expired';
}

export async function isMemberOf(tenantId: string, userId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) =>
    (await tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { id: true } })) !== null
  );
}

/** The person's role in the tenant, or null when they are not a member. */
export async function membershipRoleOf(tenantId: string, userId: string): Promise<Role | null> {
  return withTenant(tenantId, async (tx) =>
    (await tx.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { role: true } }))?.role ?? null
  );
}

export interface AcceptInvitationCore {
  invitationId: string;
  tokenHash: string;
  tenantId: string;
  role: Role;
  userId: string;
  now: Date;
  /** Write the registration consent rows (a new account only; see registerInvitedOAuthUser). */
  consentLocale?: InvitationLocale;
}

/**
 * The accept itself, inside a transaction already bound to the invitation's
 * tenant. `accepted`: the link was spent here and a membership now exists.
 * `already_member`: the person was a member already (a second click, a double
 * submit that lost the race). `lost`: somebody else spent the link first, or
 * it expired in between.
 *
 * The UPDATE's WHERE carries `acceptedAt IS NULL` and the expiry: of two
 * concurrent transactions the second waits on the row lock, re-reads the row
 * and matches nothing.
 */
export async function acceptInvitationIn(
  tx: Prisma.TransactionClient,
  core: AcceptInvitationCore
): Promise<'accepted' | 'already_member' | 'lost' | 'seat_limit'> {
  const { invitationId, tokenHash, tenantId, userId, now } = core;
  // A missing key would drop out of the UPDATE below and spend every pending
  // invitation of the tenant (TASK-MUN2KUHP1BP18).
  if (!isPresentId(invitationId) || !isPresentId(tokenHash) || !isPresentId(tenantId)) return 'lost';

  // Seat re-check (TASK-MUPUH481FBGUP, QA Y-2). The invitation held a seat while
  // pending, but a tenant pushed past its limit (the Y-2 race, a plan that
  // shrank) must not take on one more MEMBER. Under the tenant's seat lock the
  // member count must still be below the limit. Pending invitations are not
  // added: accepting turns this one into a member without changing the total,
  // and counting the others would make two over-subscribed invitations refuse
  // each other for good. Nothing is written when refused, so the link stays
  // usable once a seat frees.
  // Both callers have bound `tx` to the tenant (withTenant / bindTransactionToTenant),
  // which is what the brand stands for.
  const scoped = tx as TenantTx;
  await lockTenantSeats(scoped, tenantId);
  const pending = await tx.invitation.findFirst({
    where: { id: invitationId, tenantId, tokenHash, acceptedAt: null, expires: { gt: now } },
    select: { email: true },
  });
  if (pending) {
    const alreadyMember = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    });
    if (!alreadyMember) {
      const usage = await readSeatUsage(scoped, tenantId, pending.email);
      if (usage.members >= usage.limit) return 'seat_limit';
    }
  }
  const claimed = await tx.invitation.updateMany({
    where: { id: invitationId, tenantId, tokenHash, acceptedAt: null, expires: { gt: now } },
    data: { acceptedAt: now },
  });
  const member = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true },
  });
  if (claimed.count !== 1) return member ? 'already_member' : 'lost';
  if (member) return 'already_member';

  // workspaceIds = [] is "every workspace of the tenant" (schema.prisma Membership).
  await tx.membership.create({ data: { tenantId, userId, role: core.role, workspaceIds: [] } });
  await tx.auditEvent.create({
    data: { tenantId, actorId: userId, type: INVITATION_ACCEPTED, target: invitationId },
  });
  if (core.consentLocale) {
    await writeRegistrationConsent(tx, { tenantId, userId, locale: core.consentLocale, agency: false });
  }
  return 'accepted';
}

export type AcceptRefusal =
  | 'invalid'
  | 'revoked'
  | 'expired'
  | 'used'
  | 'email_mismatch'
  | 'pilot_expired'
  | 'seat_limit_reached';

export type AcceptOutcome =
  | { ok: true; tenantId: string; alreadyMember: boolean; role: Role | null }
  | { ok: false; reason: AcceptRefusal };

/** An existing, signed-in account accepts the invitation behind `token`. */
export async function acceptInvitation(input: {
  token: string | null;
  userId: string;
  userEmail: string | null | undefined;
  now?: Date;
}): Promise<AcceptOutcome> {
  const now = input.now ?? new Date();
  const state = await lookupInvitation(input.token, now);
  if (state.status === 'invalid' || state.status === 'revoked') return { ok: false, reason: state.status };
  const { invitation } = state;
  if (!sameEmail(invitation.email, input.userEmail)) return { ok: false, reason: 'email_mismatch' };
  if (state.status === 'used' || state.status === 'expired') {
    // Idempotent for the person it was meant for: a second click lands them in the workspace.
    if (await isMemberOf(invitation.tenantId, input.userId)) {
      return {
        ok: true,
        tenantId: invitation.tenantId,
        alreadyMember: true,
        role: await membershipRoleOf(invitation.tenantId, input.userId),
      };
    }
    return { ok: false, reason: state.status };
  }
  if (await isInvitingTenantReadOnly(invitation.tenantId)) return { ok: false, reason: 'pilot_expired' };

  const result = await withTenant(invitation.tenantId, (tx) =>
    acceptInvitationIn(tx, {
      invitationId: invitation.id,
      tokenHash: hashSecretToken(input.token as string),
      tenantId: invitation.tenantId,
      role: invitation.role,
      userId: input.userId,
      now,
    })
  );
  if (result === 'lost') return { ok: false, reason: 'used' };
  if (result === 'seat_limit') return { ok: false, reason: 'seat_limit_reached' };
  return {
    ok: true,
    tenantId: invitation.tenantId,
    alreadyMember: result === 'already_member',
    // The role the membership really has (an earlier membership keeps its own), which decides the landing screen.
    role: await membershipRoleOf(invitation.tenantId, input.userId),
  };
}

/**
 * What the `signIn` callback needs to know about a parked invitation
 * (src/lib/oauth-registration.ts, `decideOAuthSignIn`).
 */
export type InvitationSignInView =
  | { status: 'none' }
  | { status: 'unusable'; locale: InvitationLocale }
  | { status: 'pending'; locale: InvitationLocale; email: string; readOnly: boolean };

export async function readInvitationForSignIn(): Promise<InvitationSignInView> {
  const parked = await readParkedInvitation();
  if (!parked) return { status: 'none' };
  const state = await lookupInvitation(parked.token);
  if (state.status !== 'pending') return { status: 'unusable', locale: parked.locale };
  return {
    status: 'pending',
    locale: parked.locale,
    email: state.invitation.email,
    readOnly: await isInvitingTenantReadOnly(state.invitation.tenantId),
  };
}

/** Thrown when the invitation stopped being acceptable between the signIn callback and `createUser`. */
export class InvitationNotAcceptableError extends Error {
  constructor(readonly reason: AcceptRefusal | 'lost') {
    super(`invitation registration refused: ${reason}`);
    this.name = 'InvitationNotAcceptableError';
  }
}

/**
 * The adapter's `createUser` for a Google registration started from the accept
 * screen. User, membership in the INVITING tenant, the spent link, the audit
 * row and the consent rows are one transaction; no tenant of the person's own
 * is created. The `signIn` callback let this through only with a verified,
 * matching address and a current acknowledgement, so the consent rows are
 * always written; everything is checked again here against the database.
 */
export async function registerInvitedOAuthUser(
  client: PrismaClient,
  input: {
    user: { email: string; name?: string | null; image?: string | null; emailVerified?: Date | null };
    token: string;
    locale: InvitationLocale;
    now?: Date;
  }
): Promise<User> {
  const now = input.now ?? new Date();
  const state = await lookupInvitation(input.token, now);
  if (state.status !== 'pending') throw new InvitationNotAcceptableError(state.status);
  const { invitation } = state;
  if (!sameEmail(invitation.email, input.user.email)) throw new InvitationNotAcceptableError('email_mismatch');
  if (await isInvitingTenantReadOnly(invitation.tenantId)) throw new InvitationNotAcceptableError('pilot_expired');

  return client.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.user.email,
        name: input.user.name ?? null,
        image: input.user.image ?? null,
        emailVerified: input.user.emailVerified ?? null,
      },
    });
    await bindTransactionToTenant(tx, invitation.tenantId);
    const result = await acceptInvitationIn(tx, {
      invitationId: invitation.id,
      tokenHash: hashSecretToken(input.token),
      tenantId: invitation.tenantId,
      role: invitation.role,
      userId: user.id,
      now,
      consentLocale: input.locale,
    });
    // A brand-new user cannot already be a member; anything but `accepted`
    // means the link was spent in between. Throwing rolls the user back too.
    if (result === 'seat_limit') throw new InvitationNotAcceptableError('seat_limit_reached');
    if (result !== 'accepted') throw new InvitationNotAcceptableError('lost');
    return user;
  });
}
