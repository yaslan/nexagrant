import crypto from 'node:crypto';
import { withTenant } from '@/lib/db';
import { creditBalanceIn, lockTenantCredits, releaseAiReservation, reserveAiAction, resolveCredits } from '@/lib/llm';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * NG-136 (K-582507 = A) — the credit of an M18 AI action, the M17 way (src/modules/m17/server/evaluate.ts).
 *
 * The action's price (`M18:<purpose>`, 1 or 2) is reserved under the tenant credit lock BEFORE the model
 * call, as one `usage:M18` CreditLedger row. The model call itself goes through llm.ts as the free
 * `M18:<purpose>-attempt` with `creditsReserved`, so it is logged in AiUsageLog (credits 0) and moves no
 * credit. When the action delivers nothing — no usable answer, an empty pre-report, a report that could
 * not be saved, a provider error — the reservation is given back as one `refund:M18` row with the same
 * refId. On success the reservation IS the charge: nothing is debited a second time.
 *
 * No second price formula and no second adapter: the figures come from `resolveCredits`, the ledger rows
 * from llm.ts's own `reserveAiAction` / `releaseAiReservation`.
 */

export const M18_MODULE = 'M18';

/** The free catalogue key the model call of a reserved M18 action is booked to. */
export function attemptPurpose(purpose: string): string {
  return `${purpose}-attempt`;
}

/** Same message llm.ts throws, so the action layer maps both to NO_CREDITS. */
export class InsufficientAiCreditsError extends Error {
  constructor() {
    super('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
    this.name = 'InsufficientAiCreditsError';
  }
}

export type M18Reservation = { refId: string; credits: number };

export type M18CreditDeps = {
  /** Read-only balance check before work that comes ahead of the reservation (the site read). */
  precheck?: (tenantId: string, purpose: string) => Promise<void>;
  reserve?: (tenantId: string, purpose: string) => Promise<M18Reservation>;
  release?: (tenantId: string, refId: string) => Promise<void>;
};

/**
 * NG-202 (B2) — throws {@link InsufficientAiCreditsError} when the balance is already below the action's
 * price, writing nothing. For an action that does outside work BEFORE it reserves (enrichment reads up to
 * five pages of a third-party site first): a tenant that cannot pay is refused before that work starts.
 * Advisory only — no lock, no ledger row; {@link reserveM18Action} stays the binding check, so a balance
 * spent between the two is still refused there.
 */
export async function assertM18Balance(tenantId: string, purpose: string): Promise<void> {
  const { credits } = resolveCredits(M18_MODULE, purpose);
  const balance = await withTenant(tenantId, (tx) => creditBalanceIn(tx, tenantId));
  if (balance < credits) throw new InsufficientAiCreditsError();
}

/**
 * Debits the action's price under the tenant lock. Throws {@link InsufficientAiCreditsError}, writing
 * nothing, when the balance does not cover it — before any provider is reached.
 */
export async function reserveM18Action(tenantId: string, purpose: string): Promise<M18Reservation> {
  const { credits } = resolveCredits(M18_MODULE, purpose);
  // A 0 price would make reserveAiAction write nothing and llm.ts's own empty-balance rule would be
  // skipped by `creditsReserved`; both M18 prices are > 0 (catalog.test.ts), so this is a broken invariant.
  if (credits <= 0) throw new Error(`M18:${purpose} must be priced above 0 to be reserved`);
  const refId = `${M18_MODULE}:${purpose}:${crypto.randomUUID()}`;
  const reserved = await withTenant(tenantId, async (tx) => {
    await lockTenantCredits(tx, tenantId);
    return reserveAiAction(tx, { tenantId, module: M18_MODULE, purpose, refId });
  });
  if (!reserved) throw new InsufficientAiCreditsError();
  return { refId, credits };
}

/** One `refund:M18` row for `refId`. Idempotent (releaseAiReservation). */
export async function releaseM18Action(tenantId: string, refId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await lockTenantCredits(tx, tenantId);
    await releaseAiReservation(tx, { tenantId, module: M18_MODULE, refId });
  });
}

const REFUND_ATTEMPTS = 3;
const REFUND_RETRY_BASE_MS = 200;

/**
 * Gives the reservation back, retrying a failed write. Never throws: the caller reports its own outcome
 * (BAD_ANSWER, the empty answer, the save error), not a bookkeeping fault. A refund that still fails
 * leaves the debit standing and opens an `llm-refund` SystemAlert — the queue llm.ts already uses for
 * the same fault — with no tenant id and no content (SystemAlert is outside RLS).
 */
export async function refundM18Action(
  tenantId: string,
  purpose: string,
  refId: string,
  release: (tenantId: string, refId: string) => Promise<void> = releaseM18Action,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= REFUND_ATTEMPTS; attempt++) {
    try {
      await release(tenantId, refId);
      return;
    } catch (e) {
      lastError = e;
      if (attempt < REFUND_ATTEMPTS) await new Promise((res) => setTimeout(res, REFUND_RETRY_BASE_MS * attempt));
    }
  }
  console.error('[m18-ai] refund failed after retries; reservation debit left standing', { module: M18_MODULE, purpose, refId }, lastError);
  try {
    await recordAlert({
      level: 'error',
      source: 'llm-refund',
      message: 'AI credit reservation could not be refunded; the debit stands until reconciled',
      meta: { module: M18_MODULE, purpose, reservation: refId },
      dedupeKey: `llm-refund:${refId}`,
    });
  } catch {
    // Best-effort: an alert that cannot be written must not replace the caller's outcome.
  }
}

/**
 * Runs `deliver` with the action's price reserved. `deliver` returns `{ keep: true, value }` when the
 * tenant got what it paid for; anything else (`keep: false`, or a throw) refunds the reservation.
 */
export async function withM18Reservation<T>(
  tenantId: string,
  purpose: string,
  deliver: (reservation: M18Reservation) => Promise<{ keep: boolean; value: T }>,
  deps: M18CreditDeps = {},
): Promise<T> {
  const reservation = await (deps.reserve ?? reserveM18Action)(tenantId, purpose);
  const release = deps.release ?? releaseM18Action;
  let outcome: { keep: boolean; value: T };
  try {
    outcome = await deliver(reservation);
  } catch (e) {
    await refundM18Action(tenantId, purpose, reservation.refId, release);
    throw e;
  }
  if (!outcome.keep) await refundM18Action(tenantId, purpose, reservation.refId, release);
  return outcome.value;
}
