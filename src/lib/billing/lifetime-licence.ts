/**
 * Lifetime licences — the record behind the "first 20 companies" badge.
 *
 * Two jobs live here, deliberately in one file:
 *
 *  1. `recordLifetimeLicence` — writes the sale down. Until TASK-MTR962OV5YGVX
 *     the Stripe webhook only acted on `checkout.session.completed` when the
 *     session carried a subscription, so a one-time `lifetime-ultra` payment
 *     was collected and then forgotten by this database.
 *  2. `lifetimeScarcity` — turns the number of those rows into what the pricing
 *     page is allowed to say. The counters used to be prose in the message
 *     catalogue ("5 licence owners", "next licence #6") with nothing counting;
 *     CLAUDE.md rule 7 wants a record behind every figure shown to a user.
 *
 * The pure half takes a number and returns a state, so all three edges (nobody
 * yet, N owners, sold out) are unit-testable without a database.
 */
import type Stripe from 'stripe';
import { prisma, withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { logger } from '@/lib/logger';
import { LIFETIME_LICENCE_CAP } from './catalog';

/** The one catalogue line that is a lifetime licence. */
export const LIFETIME_SKU = 'lifetime-ultra';

/**
 * What the pricing page may claim about the limited run.
 *
 * `unknown` is a first-class state on purpose: when the count cannot be read we
 * show no number at all rather than falling back to zero, because "nobody has
 * bought one yet" is itself a claim and a wrong one is the bug being fixed.
 */
export type LifetimeScarcity =
  | { kind: 'unknown'; cap: number }
  | { kind: 'none'; owners: 0; next: 1; cap: number }
  | { kind: 'available'; owners: number; next: number; cap: number }
  | { kind: 'sold-out'; owners: number; cap: number };

/**
 * Derives the badge state from the number of licences actually recorded.
 *
 * @param owners Rows in `LifetimeLicence`, or null when the count is unavailable.
 * @param cap    Size of the limited run; catalogue data (`LIFETIME_LICENCE_CAP`).
 */
export function lifetimeScarcity(
  owners: number | null | undefined,
  cap: number = LIFETIME_LICENCE_CAP
): LifetimeScarcity {
  const safeCap = Number.isInteger(cap) && cap > 0 ? cap : 0;
  if (safeCap === 0) {
    // A cap of zero or nonsense is a configuration error, not "sold out".
    return { kind: 'unknown', cap: LIFETIME_LICENCE_CAP };
  }
  if (typeof owners !== 'number' || !Number.isFinite(owners) || owners < 0) {
    return { kind: 'unknown', cap: safeCap };
  }
  const counted = Math.floor(owners);
  if (counted === 0) return { kind: 'none', owners: 0, next: 1, cap: safeCap };
  // `>=` rather than `===`: if a 21st licence was ever sold the offer is still
  // over, and the badge must not promise a next one.
  if (counted >= safeCap) return { kind: 'sold-out', owners: counted, cap: safeCap };
  return { kind: 'available', owners: counted, next: counted + 1, cap: safeCap };
}

/**
 * Cross-tenant count for the public pricing page.
 *
 * `LifetimeLicence` is tenant-scoped and RLS-protected, and the pricing page is
 * not inside any tenant — so this goes through `public.lifetime_licence_count()`
 * (prisma/rls.sql), a SECURITY DEFINER function that returns one integer and no
 * row. Returns null, never 0, when the number cannot be read: see
 * {@link lifetimeScarcity} for why the difference matters.
 */
export async function countLifetimeLicences(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ n: number | bigint | null }>>`
      SELECT public.lifetime_licence_count() AS n
    `;
    const raw = rows[0]?.n;
    const value = typeof raw === 'bigint' ? Number(raw) : raw;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch (error) {
    logger.error('Could not count lifetime licences; the pricing badge will claim no number', error);
    return null;
  }
}

/** The skus a checkout session was created for, from the metadata checkout writes. */
export function checkoutSkus(session: Pick<Stripe.Checkout.Session, 'metadata'>): string[] {
  const raw = session.metadata?.skus;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((sku) => sku.trim())
    .filter((sku) => sku.length > 0);
}

/**
 * Is this completed session the one-time lifetime purchase?
 *
 * A subscription session never is, whatever its metadata says — that path is
 * `syncStripeSubscription`'s and running both would bill the tenant twice in
 * our own records.
 */
export function isLifetimeCheckout(session: Stripe.Checkout.Session): boolean {
  if (session.subscription) return false;
  return checkoutSkus(session).includes(LIFETIME_SKU);
}

export interface LifetimeLicenceResult {
  /**
   * `recorded`     — a new licence row exists
   * `duplicate`    — this event or session was already recorded; nothing written
   * `not-lifetime` — not a one-time lifetime session; nothing to do
   * `unpaid`       — the session completed without the money arriving yet
   */
  status: 'recorded' | 'duplicate' | 'not-lifetime' | 'unpaid';
  tenantId?: string;
  seq?: number;
  licenceId?: string;
}

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Records a completed one-time lifetime purchase. Idempotent.
 *
 * Two rows can never describe the same purchase: `providerEventId` is unique, so
 * a redelivered webhook is a no-op, and `providerSessionId` is unique too, so
 * the same checkout arriving under a *different* event id is also a no-op. The
 * pre-check below makes the common case cheap; the unique indexes are what
 * actually guarantee it, which is why the P2002 branch exists rather than a
 * comment saying races are unlikely.
 */
export async function recordLifetimeLicence(
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<LifetimeLicenceResult> {
  if (!isLifetimeCheckout(session)) return { status: 'not-lifetime' };

  // `paid` for a card, `no_payment_required` for a fully discounted line. An
  // async method still settling is not a sale yet; Stripe sends
  // `checkout.session.async_payment_succeeded` when it becomes one.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    logger.warn('Lifetime checkout completed without payment; not recording a licence', {
      sessionId: session.id,
      paymentStatus: session.payment_status ?? 'unknown',
    });
    return { status: 'unpaid' };
  }

  const tenantId = session.metadata?.tenantId || session.client_reference_id || '';
  if (!tenantId) {
    // Throwing means a 500 and a Stripe retry, which is louder than a lost sale.
    throw new Error(`Lifetime checkout ${session.id} carries no tenant; refusing to guess one`);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new Error(`Lifetime checkout ${session.id} names an unknown tenant: ${tenantId}`);
  }

  const already = await findRecorded(eventId, session.id);
  if (already) {
    logger.info('Lifetime licence already recorded; skipping', { eventId, seq: already.seq });
    return { status: 'duplicate', tenantId: already.tenantId, seq: already.seq, licenceId: already.id };
  }

  // The licence number is a platform-wide scarce resource capped at
  // LIFETIME_LICENCE_CAP, so the highest `seq` is a question about the whole
  // estate. Under `fabrika_app` this reads null, every buyer is handed seq 1,
  // and the cap stops counting.
  const highest = await withSystemScope('platform-aggregate', 'lifetime-licence.highestSeq', (tx) =>
    tx.lifetimeLicence.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true } })
  );
  const seq = (highest?.seq ?? 0) + 1;

  try {
    // The tenant is in hand, so the write is scoped to it. Unscoped under
    // `fabrika_app` the INSERT is refused by tenant_isolation's WITH CHECK and a
    // paid licence is never recorded (TASK-MULQKFER4MF0Y).
    const licence = await withTenant(tenantId, (tx) =>
      tx.lifetimeLicence.create({
        data: {
          tenantId,
          seq,
          sku: LIFETIME_SKU,
          // What was charged, not the list price: the campaign that was running is
          // part of the record.
          amountMinor: session.amount_total ?? 0,
          currency: (session.currency ?? 'usd').toUpperCase(),
          provider: 'stripe',
          providerEventId: eventId,
          providerSessionId: session.id ?? null,
          purchasedAt: session.created ? new Date(session.created * 1000) : new Date(),
        },
      })
    );

    if (seq > LIFETIME_LICENCE_CAP) {
      // Recorded anyway — an unrecorded sale is the failure we are fixing. The
      // badge reads this as sold out, so the page stops promising a next one.
      logger.warn('Lifetime licence sold beyond the advertised cap', { seq, cap: LIFETIME_LICENCE_CAP });
    }

    return { status: 'recorded', tenantId, seq: licence.seq, licenceId: licence.id };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Two deliveries raced, or two sales picked the same seq. Either way the
    // purchase is (or is about to be) on record exactly once.
    const existing = await findRecorded(eventId, session.id);
    if (existing) {
      return { status: 'duplicate', tenantId: existing.tenantId, seq: existing.seq, licenceId: existing.id };
    }
    throw error;
  }
}

async function findRecorded(eventId: string, sessionId: string | undefined) {
  const or: Array<{ providerEventId: string } | { providerSessionId: string }> = [
    { providerEventId: eventId },
  ];
  if (sessionId) or.push({ providerSessionId: sessionId });
  // The idempotency lookup by providerEventId, which runs BEFORE the tenant is
  // known — the same discovery shape as src/lib/api-auth.ts. Empty under
  // `fabrika_app` means every Stripe webhook retry is treated as a new sale.
  return withSystemScope('tenant-discovery', 'lifetime-licence.findRecorded', (tx) =>
    tx.lifetimeLicence.findFirst({ where: { OR: or } })
  );
}
