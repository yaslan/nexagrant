/**
 * The seat limit — how many people a tenant's plan lets it have.
 *
 * `Entitlements.seats` has been computed since Faz 1 and shown on the billing
 * page, but nothing refused an invitation past it, so a 2-seat plan could
 * invite without end. FB KAMU B11 (TASK-MULRSG6T55LO0) sells seats to
 * municipalities by contract (2 / 6 / 15), which makes the number a term of the
 * contract; it is enforced here, at the one place a tenant grows: issuing an
 * invitation.
 *
 * A seat is taken by a member and by a pending (unexpired, not yet accepted)
 * invitation. Counting
 * the invitations is what stops a tenant at 1/2 from sending five links at once
 * and having them all accepted. Re-inviting an address that already holds a
 * pending invitation refreshes that one and takes no new seat.
 */

import crypto from 'node:crypto';

import { getEntitlements } from '@/lib/billing';
import type { TenantTx } from '@/lib/db';

export interface SeatUsage {
  /** Seats the plan (plus add-ons and `seatsExtra`) grants. */
  limit: number;
  members: number;
  pendingInvitations: number;
}

/** Pure: may one more seat be taken? */
export function hasFreeSeat(usage: SeatUsage): boolean {
  return usage.members + usage.pendingInvitations < usage.limit;
}

export class SeatLimitReachedError extends Error {
  readonly code = 'SEAT_LIMIT_REACHED';
  constructor(readonly usage: SeatUsage) {
    super(
      `Seat limit reached: ${usage.members} member(s) + ${usage.pendingInvitations} pending ` +
        `invitation(s) of ${usage.limit} seat(s).`
    );
    this.name = 'SeatLimitReachedError';
  }
}

/**
 * Serialises every seat decision of one tenant for the rest of the transaction
 * (TASK-MUPUH481FBGUP, QA Y-2). Count-then-write is a race: N concurrent
 * invitations each counted "1 free seat" before any of them wrote its row, and
 * a 6-seat tenant ended with 8, then 10. Whoever takes a seat — issuing an
 * invitation, accepting one — takes this lock first and counts after it; under
 * READ COMMITTED the count that follows sees what the previous holder
 * committed. It is a transaction-level advisory lock, so it is released with the
 * transaction and no code path can forget to unlock. Its key is its own, apart
 * from the mail lock (invitation-mail-policy.ts): seat lock first, mail lock
 * second, everywhere, so the two never wait on each other in a cycle.
 */
export async function lockTenantSeats(tx: TenantTx, tenantId: string): Promise<void> {
  const key = crypto.createHash('sha256').update(`tenant-seats:${tenantId}`).digest().readBigInt64BE(0);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}

/**
 * Reads the tenant's seat usage inside the caller's tenant transaction, so the
 * count and the invitation write that follows see the same rows. It takes no
 * lock itself: a caller that goes on to take a seat uses {@link assertSeatAvailable}
 * or calls {@link lockTenantSeats} first.
 *
 * `email` is the address about to be invited: its own pending invitation, if
 * any, is not counted, because issuing it again replaces it.
 */
export async function readSeatUsage(tx: TenantTx, tenantId: string, email: string): Promise<SeatUsage> {
  // Sequential, not Promise.all: all three run on the one connection that holds
  // this transaction, and pg does not run queries on a client concurrently.
  const entitlements = await getEntitlements(tenantId, tx);
  const members = await tx.membership.count({ where: { tenantId } });
  const pendingInvitations = await tx.invitation.count({
    // An accepted invitation's seat is the member it became (TASK-MUN2793A57Z9I).
    where: { tenantId, expires: { gt: new Date() }, acceptedAt: null, NOT: { email } },
  });
  return { limit: entitlements.seats, members, pendingInvitations };
}

/** Throws {@link SeatLimitReachedError} when no seat is free. */
export async function assertSeatAvailable(tx: TenantTx, tenantId: string, email: string): Promise<SeatUsage> {
  // Always, whether or not a mail will go out: the count must not run unguarded.
  await lockTenantSeats(tx, tenantId);
  const usage = await readSeatUsage(tx, tenantId, email);
  if (!hasFreeSeat(usage)) throw new SeatLimitReachedError(usage);
  return usage;
}
