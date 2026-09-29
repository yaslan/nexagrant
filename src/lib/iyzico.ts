import crypto from 'crypto';
import { prisma, withTenant } from './db';
import { env } from './env';
import { toDecimalString, toMinorUnits } from './money';
import { resolvePlanId } from './billing/catalog';
import { IYZICO_SOLD_TIER, priceLockOnActivation } from './billing/price-lock';
import { publishedVersionIdFor } from './billing/plan-repository';
import { createInvoiceForPayment } from './billing/invoice-writer';
import { recordAlert } from './observability/system-alert';

/**
 * iyzico billing (BILLING.md §4 — phase 2, TRY).
 *
 * Mirrors the Stripe flow in `src/lib/billing/subscription-sync.ts`: a hosted
 * checkout is opened server-side, the provider notifies us, we re-read the
 * payment from the provider (never trusting the notification body for money or
 * status), and then sync `Subscription` / `CreditLedger` / `ModuleState` and
 * write the audit + invoice rows.
 *
 * Two rules carry the security of this file:
 *   1. The tenant is taken from the conversationId *we* generated at checkout
 *      time, never from a field the caller can set.
 *   2. Amounts are integers in kuruş (`src/lib/money.ts`); the decimal strings
 *      iyzico speaks are converted at the boundary and nowhere else.
 */

const IYZICO_SANDBOX_BASE_URL = 'https://sandbox-api.iyzipay.com';

export const IYZICO_CURRENCY = 'TRY';

/** Path of the hosted checkout-form initialize endpoint. */
const CHECKOUT_INIT_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
/** Path of the checkout-form result lookup endpoint. */
const CHECKOUT_DETAIL_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail';

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

/**
 * Returns the iyzico credentials, or `null` when the integration is not
 * configured. There is deliberately no demo/mock fallback: a placeholder key
 * would make `verifyIyzicoSignature` accept notifications signed with a
 * publicly known secret.
 */
export function getIyzicoConfig(): IyzicoConfig | null {
  const apiKey = env.IYZICO_API_KEY?.trim();
  const secretKey = env.IYZICO_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) return null;
  return {
    apiKey,
    secretKey,
    baseUrl: (env.IYZICO_BASE_URL ?? IYZICO_SANDBOX_BASE_URL).replace(/\/+$/, ''),
  };
}

// ───────────────────────── Price list ─────────────────────────

export type BillingInterval = 'month' | 'year';

/**
 * TRY list prices in **kuruş** (minor units, rule 9).
 *
 * ⚠️ STALE — these amounts do not follow the USD catalogue, and they are the
 * open card `TRY-FX-1` (docs/BILLING.md §4), not a rate anyone has signed off.
 *
 * They were derived from the retired EUR ladder at a hand-typed rate of roughly
 * 31.4 TRY/EUR, undated and recorded nowhere. TASK-MTR6QIE05ZKNH re-keyed them
 * onto the surviving plan ids so nothing points at a plan that no longer
 * exists, and deliberately did **not** re-derive the amounts: inventing a
 * USD/TRY rate is a pricing decision, not a refactor.
 *
 * What the amounts imply against the catalogue's monthly USD list price:
 *
 *   basic  ₺1,850  / $45   =  41.1 TRY per USD
 *   pro    ₺7,850  / $87   =  90.2 TRY per USD
 *   ultra  ₺18,900 / $147  = 128.6 TRY per USD
 *
 * One table, one currency pair, three rates 3.1× apart — so at least two of
 * them are wrong whatever the real rate turns out to be, and a Turkish buyer on
 * `ultra` would be charged roughly three times a card buyer on the same plan.
 * iyzico is phase 2 and no live subscription uses it (`Subscription.provider`
 * is `stripe` on every row as of 2026-09-07), so this is a risk, not an active
 * overcharge — but it must be repriced before the provider is switched on.
 *
 * `enterprise` had its own row (₺45,000/mo); it now maps to `ultra`, which
 * `business` also maps to, and the lower of the two is kept — a migration must
 * not raise anybody's price.
 */
export const TRY_PLAN_PRICES: Record<
  string,
  { name: string; monthlyMinor: number; yearlyMinor: number }
> = {
  basic: { name: 'Basic Planı', monthlyMinor: 185_000, yearlyMinor: 1_776_000 },
  pro: { name: 'Pro Planı', monthlyMinor: 785_000, yearlyMinor: 7_536_000 },
  ultra: { name: 'Ultra Planı', monthlyMinor: 1_890_000, yearlyMinor: 18_144_000 },
};

/**
 * TRY price for a plan. A retired EUR plan id (`team`, `business`…) resolves to
 * its replacement rather than returning null, so an in-flight link built before
 * the ladder was retired still prices.
 */
export function tryPriceMinor(planId: string, interval: BillingInterval): number | null {
  const row = TRY_PLAN_PRICES[resolvePlanId(planId)];
  if (!row) return null;
  return interval === 'year' ? row.yearlyMinor : row.monthlyMinor;
}

// ───────────────────────── conversationId ─────────────────────────

const CONVERSATION_PREFIX = 'fabrika';

/**
 * The conversationId is the only channel that carries our tenant through
 * iyzico and back. iyzico echoes it verbatim on the notification and on the
 * payment detail, so a notification whose conversationId does not parse is by
 * definition not attributable to a tenant and is refused.
 */
export function buildConversationId(
  tenantId: string,
  planId: string,
  interval: BillingInterval
): string {
  const nonce = crypto.randomBytes(8).toString('hex');
  return [CONVERSATION_PREFIX, tenantId, planId, interval, nonce].join(':');
}

export interface ParsedConversation {
  tenantId: string;
  planId: string;
  interval: BillingInterval;
  nonce: string;
}

export function parseConversationId(value: string | undefined | null): ParsedConversation | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length !== 5) return null;
  const [prefix, tenantId, planId, interval, nonce] = parts;
  if (prefix !== CONVERSATION_PREFIX) return null;
  if (!tenantId || !planId || !nonce) return null;
  if (interval !== 'month' && interval !== 'year') return null;
  return { tenantId, planId, interval, nonce };
}

// ───────────────────────── Request signing (IYZWSv2) ─────────────────────────

/**
 * iyzico's v2 authorization header:
 *   signature = HMAC-SHA256(secretKey, randomKey + uriPath + jsonBody) → hex
 *   header    = "IYZWSv2 " + base64("apiKey:…&randomKey:…&signature:…")
 */
export function buildAuthorizationHeader(
  config: IyzicoConfig,
  uriPath: string,
  body: string,
  randomKey: string
): string {
  const signature = crypto
    .createHmac('sha256', config.secretKey)
    .update(randomKey + uriPath + body)
    .digest('hex');

  const params = [
    `apiKey:${config.apiKey}`,
    `randomKey:${randomKey}`,
    `signature:${signature}`,
  ].join('&');

  return `IYZWSv2 ${Buffer.from(params, 'utf8').toString('base64')}`;
}

function newRandomKey(): string {
  return `${Date.now()}${crypto.randomBytes(6).toString('hex')}`;
}

async function iyzicoPost<T>(
  config: IyzicoConfig,
  uriPath: string,
  payload: Record<string, unknown>
): Promise<T> {
  const body = JSON.stringify(payload);
  const randomKey = newRandomKey();

  const response = await fetch(`${config.baseUrl}${uriPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: buildAuthorizationHeader(config, uriPath, body, randomKey),
      'x-iyzi-rnd': randomKey,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    // The provider's body may echo buyer data; only the status is logged.
    throw new Error(`iyzico ${uriPath} responded ${response.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`iyzico ${uriPath} returned a non-JSON body`);
  }
}

// ───────────────────────── Checkout initialisation ─────────────────────────

export interface IyzicoBuyer {
  id: string;
  name: string;
  surname: string;
  email: string;
  identityNumber?: string;
  registrationAddress?: string;
  city?: string;
  country?: string;
  ip?: string;
}

export interface IyzicoCheckoutParams {
  tenantId: string;
  planId: string;
  interval: BillingInterval;
  buyer: IyzicoBuyer;
  /** Absolute URL iyzico returns the browser to after 3-D Secure. */
  callbackUrl: string;
}

export interface IyzicoCheckoutResult {
  status: 'success' | 'failure';
  token?: string;
  /** Script tag iyzico wants embedded in the page to render the form. */
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  conversationId: string;
  priceMinor: number;
  currency: string;
  errorCode?: string;
  errorMessage?: string;
}

interface IyzicoInitResponse {
  status?: string;
  token?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  conversationId?: string;
}

/**
 * Opens an iyzico hosted checkout form (3-D Secure) for a plan subscription.
 * The price is read from {@link TRY_PLAN_PRICES}, never from the caller.
 *
 * The buyer's identity number (TCKN for natural persons, VKN for enterprises)
 * is required and must come from `TenantBillingIdentity`. Calls without an
 * identity number will throw; the caller must ensure the tenant has filled in
 * the fiscal identity form before initiating checkout.
 */
export async function createIyzicoCheckout(
  params: IyzicoCheckoutParams
): Promise<IyzicoCheckoutResult> {
  const { tenantId, interval, buyer, callbackUrl } = params;

  if (!tenantId) throw new Error('createIyzicoCheckout requires a tenantId');

  if (!buyer.identityNumber) {
    throw new Error(
      'createIyzicoCheckout requires buyer.identityNumber from TenantBillingIdentity'
    );
  }

  const config = getIyzicoConfig();
  if (!config) throw new Error('iyzico is not configured (IYZICO_API_KEY / IYZICO_SECRET_KEY)');

  // A retired EUR plan id is normalised here, before it is written into the
  // conversationId — that id is what the webhook later looks the plan up by,
  // and `Plan` no longer has a `team` row to find.
  const planId = resolvePlanId(params.planId);
  const price = TRY_PLAN_PRICES[planId];
  const priceMinor = tryPriceMinor(planId, interval);
  if (!price || priceMinor === null) {
    throw new Error(`No TRY price for plan ${planId}`);
  }

  const conversationId = buildConversationId(tenantId, planId, interval);
  const priceDecimal = toDecimalString(priceMinor, IYZICO_CURRENCY);
  const itemName = `${price.name} (${interval === 'year' ? 'yıllık' : 'aylık'})`;

  const payload = {
    locale: 'tr',
    conversationId,
    price: priceDecimal,
    paidPrice: priceDecimal,
    currency: IYZICO_CURRENCY,
    basketId: `${planId}-${interval}`,
    paymentGroup: 'SUBSCRIPTION',
    callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: buyer.id,
      name: buyer.name,
      surname: buyer.surname,
      email: buyer.email,
      identityNumber: buyer.identityNumber,
      registrationAddress: buyer.registrationAddress ?? 'Not provided',
      city: buyer.city ?? 'Istanbul',
      country: buyer.country ?? 'Turkey',
      ip: buyer.ip ?? '0.0.0.0',
    },
    basketItems: [
      {
        id: `${planId}-${interval}`,
        name: itemName,
        category1: 'SaaS',
        itemType: 'VIRTUAL',
        price: priceDecimal,
      },
    ],
  };

  const response = await iyzicoPost<IyzicoInitResponse>(config, CHECKOUT_INIT_PATH, payload);

  if (response.status !== 'success' || !response.token) {
    return {
      status: 'failure',
      conversationId,
      priceMinor,
      currency: IYZICO_CURRENCY,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage ?? 'iyzico did not return a checkout token',
    };
  }

  return {
    status: 'success',
    token: response.token,
    checkoutFormContent: response.checkoutFormContent,
    paymentPageUrl: response.paymentPageUrl,
    conversationId,
    priceMinor,
    currency: IYZICO_CURRENCY,
  };
}

// ───────────────────────── Result verification ─────────────────────────

export interface IyzicoPaymentDetail {
  /** iyzico API call status ("success" when the lookup itself worked). */
  status?: string;
  /** Payment outcome: "SUCCESS" | "FAILURE" | "INIT_THREEDS" … */
  paymentStatus?: string;
  paymentId?: string | number;
  conversationId?: string;
  token?: string;
  price?: string | number;
  paidPrice?: string | number;
  currency?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Reads the authoritative result of a checkout form from iyzico. The
 * notification body is only a hint that something happened; money and status
 * are always taken from this call.
 */
export async function retrieveIyzicoCheckoutResult(
  token: string,
  conversationId?: string
): Promise<IyzicoPaymentDetail> {
  const config = getIyzicoConfig();
  if (!config) throw new Error('iyzico is not configured (IYZICO_API_KEY / IYZICO_SECRET_KEY)');

  return iyzicoPost<IyzicoPaymentDetail>(config, CHECKOUT_DETAIL_PATH, {
    locale: 'tr',
    token,
    ...(conversationId ? { conversationId } : {}),
  });
}

// ───────────────────────── Notification signature ─────────────────────────

export interface IyzicoNotification {
  iyziEventType?: string;
  iyziEventTime?: number | string;
  iyziReferenceCode?: string;
  token?: string;
  paymentId?: string | number;
  paymentConversationId?: string;
  status?: string;
  merchantId?: string | number;
}

/**
 * Canonical string iyzico signs for a V3 notification:
 *   secretKey + iyziEventType + paymentId + paymentConversationId + status
 *
 * NOTE: this concatenation is the documented V3 order and is deliberately kept
 * in one function. It has not yet been replayed against a real sandbox
 * delivery (no sandbox credentials in this environment — see the result
 * report), so if iyzico's live header disagrees, this single line is the fix;
 * nothing else in the file depends on the field order.
 */
export function notificationSignaturePayload(
  notification: IyzicoNotification,
  secretKey: string
): string {
  return [
    secretKey,
    notification.iyziEventType ?? '',
    notification.paymentId ?? '',
    notification.paymentConversationId ?? '',
    notification.status ?? '',
  ].join('');
}

export function signNotification(notification: IyzicoNotification, secretKey: string): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(notificationSignaturePayload(notification, secretKey))
    .digest('hex');
}

/**
 * Constant-time comparison of the `x-iyz-signature-v3` header. Returns false —
 * never throws — for a missing or malformed header, so the caller has exactly
 * one rejection path.
 */
export function verifyIyzicoSignature(
  notification: IyzicoNotification,
  headerSignature: string | null | undefined,
  secretKey: string
): boolean {
  if (!headerSignature) return false;
  const expected = signNotification(notification, secretKey);
  const received = headerSignature.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

// ───────────────────────── Webhook → entitlement sync ─────────────────────────

export type IyzicoWebhookOutcome =
  | 'synced'
  | 'duplicate'
  | 'payment_not_successful'
  | 'not_attributable'
  | 'unknown_tenant'
  | 'unknown_plan';

export interface IyzicoWebhookResult {
  success: boolean;
  outcome: IyzicoWebhookOutcome;
  tenantId?: string;
  planId?: string;
  status?: string;
  amountMinor?: number;
  currency?: string;
  creditsGranted?: number;
  disabledModules?: string[];
  message: string;
}

/** Stable id for one provider event; the idempotency key. */
export function notificationEventId(notification: IyzicoNotification): string | null {
  if (notification.iyziReferenceCode) return notification.iyziReferenceCode;
  const type = notification.iyziEventType;
  const ref = notification.paymentId ?? notification.token;
  if (!type || !ref) return null;
  return `${type}:${ref}`;
}

/**
 * Postgres advisory-lock key for an event id. Two concurrent deliveries of the
 * same event serialise on this lock, so the "already processed?" read and the
 * writes that follow it cannot interleave. Without it the check-then-write
 * guard has a race that double-grants credits.
 */
function advisoryLockKey(eventId: string): bigint {
  return crypto.createHash('sha256').update(eventId).digest().readBigInt64BE(0);
}

const SUBSCRIPTION_PERIOD_DAYS: Record<BillingInterval, number> = {
  month: 30,
  year: 365,
};

export interface HandleIyzicoWebhookOptions {
  /** Injection point for tests; defaults to the real provider lookup. */
  retrievePayment?: (token: string, conversationId?: string) => Promise<IyzicoPaymentDetail>;
}

/**
 * A verified, authentic notification that this function still could not act
 * on: the conversationId does not name a tenant we minted, the tenant or plan
 * it names no longer exists, or the provider's own record points somewhere
 * else. CLAUDE.md rule 6 — an upstream contract or attribution problem raises
 * an alert and lets the job fall through, it never breaks the job. The caller
 * (`route.ts`) already returns 200 for every one of these outcomes so iyzico
 * does not retry a delivery that will never succeed; without this, that 200
 * was also silence — a payment came in and nothing operator-visible recorded
 * that it went nowhere.
 *
 * Never throws (the sole contract `recordAlert` gives), so a failure to write
 * the alert cannot turn an already-graceful decline into a webhook error.
 */
async function alertTenantUnresolved(
  reason: string,
  message: string,
  eventId?: string,
  tenantId?: string
): Promise<void> {
  await recordAlert({
    level: 'warn',
    source: 'iyzico_webhook_unattributed',
    message: `iyzico notification could not be synced: ${message}`,
    meta: { reason, eventId, tenantId },
    // Identity is the failure kind plus which tenant it points at (or none) —
    // not the eventId, which is different on every delivery and would defeat
    // dedup for what is usually the same misconfiguration repeating.
    dedupeKey: `${reason}:${tenantId ?? 'none'}`,
  });
}

/**
 * Processes one verified iyzico notification. The caller MUST have checked the
 * signature first — this function assumes authenticity and only enforces
 * attribution, idempotency and consistency.
 */
export async function handleIyzicoWebhook(
  notification: IyzicoNotification,
  options: HandleIyzicoWebhookOptions = {}
): Promise<IyzicoWebhookResult> {
  const eventId = notificationEventId(notification);
  if (!eventId) {
    await alertTenantUnresolved('missing_reference', 'Notification carries neither a reference code nor a payment id');
    return {
      success: false,
      outcome: 'not_attributable',
      message: 'Notification carries neither a reference code nor a payment id',
    };
  }

  const conversation = parseConversationId(notification.paymentConversationId);
  if (!conversation) {
    // The tenant is never read from the notification body; a conversationId we
    // did not mint is an unattributable payment notification, and activating a
    // subscription on a guess would activate it on somebody else's account.
    await alertTenantUnresolved('unparseable_conversation_id', 'conversationId does not identify a tenant', eventId);
    return {
      success: false,
      outcome: 'not_attributable',
      message: 'conversationId does not identify a tenant',
    };
  }

  const { tenantId, planId, interval } = conversation;

  if (!notification.token) {
    await alertTenantUnresolved('missing_token', 'Notification carries no checkout token', eventId, tenantId);
    return {
      success: false,
      outcome: 'not_attributable',
      message: 'Notification carries no checkout token',
    };
  }

  // Authoritative money + status come from the provider, not from the body.
  const retrieve = options.retrievePayment ?? retrieveIyzicoCheckoutResult;
  const detail = await retrieve(notification.token, notification.paymentConversationId);

  if (detail.conversationId && detail.conversationId !== notification.paymentConversationId) {
    await alertTenantUnresolved(
      'conversation_mismatch',
      'Provider payment belongs to a different conversation',
      eventId,
      tenantId
    );
    return {
      success: false,
      outcome: 'not_attributable',
      message: 'Provider payment belongs to a different conversation',
    };
  }

  const paymentStatus = (detail.paymentStatus ?? detail.status ?? '').toUpperCase();
  if (paymentStatus !== 'SUCCESS') {
    return {
      success: false,
      outcome: 'payment_not_successful',
      tenantId,
      planId,
      status: paymentStatus || 'UNKNOWN',
      message: `Payment is not successful (${paymentStatus || 'unknown'}); nothing was granted`,
    };
  }

  const currency = (detail.currency ?? IYZICO_CURRENCY).toUpperCase();
  const amountMinor = toMinorUnits(detail.paidPrice ?? detail.price ?? 0, currency);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    await alertTenantUnresolved('unknown_tenant', `Tenant not found: ${tenantId}`, eventId, tenantId);
    return {
      success: false,
      outcome: 'unknown_tenant',
      tenantId,
      message: `Tenant not found: ${tenantId}`,
    };
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    await alertTenantUnresolved('unknown_plan', `Plan not found: ${planId}`, eventId, tenantId);
    return {
      success: false,
      outcome: 'unknown_plan',
      tenantId,
      planId,
      message: `Plan not found: ${planId}`,
    };
  }

  const paymentId = detail.paymentId != null ? String(detail.paymentId) : notification.token;

  // Every write below is tenant-scoped (Subscription, CreditLedger,
  // ModuleState, AuditEvent, Invoice all carry `tenantId` and a `tenant_*`
  // RLS policy — prisma/rls.sql). `prisma.$transaction` never set
  // `app.tenant_id`, so under the `fabrika_app` role (NOBYPASSRLS) the very
  // first write — the subscription upsert — was refused outright:
  //
  //   Database error. Code: `42501`. Message: `new row violates row-level
  //   security policy for table "Subscription"`
  //
  // measured with the production handler on the `fabrika_app` connection
  // (TASK-MTVU5DI4C96DB). Locally the app connects as `fabrika`
  // (SUPERUSER, BYPASSRLS), which is why this never failed in dev. `withTenant`
  // is the same fix TASK-MTVSBEO7VX6Y4 applied to the Stripe path.
  return withTenant(tenantId, async (tx) => {
    // Serialise duplicate deliveries of the same event before reading. Unlike
    // the Stripe path before ADR-0003, this lock already closes the
    // concurrent-delivery race on its own: `pg_advisory_xact_lock` blocks a
    // second transaction on the same eventId until the first commits or rolls
    // back, so the "already processed?" read below can never run concurrently
    // with the write that makes it true. Measured under `fabrika_app`
    // (TASK-MTVU5DI4C96DB §2.4): 8 simultaneous deliveries of one event still
    // write exactly one subscription and one credit grant. A second
    // idempotency table (`StripeEventLog`'s UNIQUE-constraint pattern) closes
    // a gap this handler does not have; adding one here would duplicate, not
    // fix, a guard that already holds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockKey(eventId)})`;

    const alreadyProcessed = await tx.auditEvent.findFirst({
      where: {
        type: 'subscription.updated',
        data: { path: ['iyzicoEventId'], equals: eventId },
      },
    });

    if (alreadyProcessed) {
      return {
        success: true,
        outcome: 'duplicate' as const,
        tenantId,
        planId,
        message: `Event ${eventId} already processed; no second write`,
      };
    }

    const existing = await tx.subscription.findUnique({ where: { tenantId } });

    const currentPeriodEnd = new Date(
      Date.now() + SUBSCRIPTION_PERIOD_DAYS[interval] * 24 * 60 * 60 * 1000
    );

    // The price this tenant joined at, kept (TASK-MTR882HVZ8BG7). The rule and
    // the reasoning are in src/lib/billing/price-lock.ts; this path only differs
    // in *which* tier it records, and that difference is deliberate:
    //
    // `createIyzicoCheckout` charges `TRY_PLAN_PRICES` — a stale, hand-typed TRY
    // list with no early-bird discount applied at all (open card TRY-FX-1,
    // docs/BILLING.md §4). So a Turkish buyer is sold at list, whatever campaign
    // the USD pricing page is advertising. Recording the running tier here would
    // lock in a rate the customer never got and promise it back to them on
    // renewal. The lock records what was actually charged: no discount, and the
    // TRY amount off the payment detail — which is worth keeping on its own,
    // because it survives the day TRY_PLAN_PRICES is finally re-derived.
    const lockDecision = priceLockOnActivation({
      existing,
      activeTier: IYZICO_SOLD_TIER,
      charged: { amountMinor, currency },
      now: new Date(),
    });
    const lockColumns = lockDecision.action === 'write' ? lockDecision.columns : null;

    // The version this sale is entitled from, on the same rule as the Stripe
    // path (src/lib/billing/subscription-sync.ts): written on a first sale and
    // on a plan change, left alone on a renewal, and skipped when the plan has
    // no published version so a purchase is never lost to one.
    const planChanged = !existing || existing.planId !== planId;
    const versionId = planChanged ? await publishedVersionIdFor(planId) : null;
    const versionColumn = versionId ? { planVersionId: versionId } : {};

    // TODO(TASK-MUMABL78X5JLX, review Ö-3): no free-pilot guard here yet. The
    // Stripe path refuses to overwrite a `provider: 'pilot'` row
    // (subscription-sync.ts: `lockPilotRow` + `isPilotSubscription` inside the
    // write transaction). Unreachable today — `createIyzicoCheckout` has no
    // caller and is the only source of a conversationId — but the day iyzico
    // checkout opens, add the same guard before this upsert.
    await tx.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId,
        status: 'ACTIVE',
        billingInterval: interval,
        provider: 'iyzico',
        providerCustomerId: notification.merchantId != null ? String(notification.merchantId) : null,
        providerSubId: paymentId,
        currentPeriodEnd,
        ...versionColumn,
        ...(lockColumns ?? {}),
      },
      update: {
        planId,
        status: 'ACTIVE',
        billingInterval: interval,
        provider: 'iyzico',
        providerSubId: paymentId,
        currentPeriodEnd,
        ...versionColumn,
        ...(lockColumns ?? {}),
      },
    });

    // Credits are granted on a first activation or on a re-activation only,
    // matching syncStripeSubscription; a renewal of an already-active
    // subscription must not top the balance up twice.
    let creditsGranted = 0;
    if (!existing || existing.status !== 'ACTIVE') {
      creditsGranted = plan.aiCreditsMonthly;
      await tx.creditLedger.create({
        data: {
          tenantId,
          delta: creditsGranted,
          reason: 'monthly_grant',
          refId: paymentId,
        },
      });
    }

    // A downgrade must revoke what the new plan no longer covers.
    const disabledModules: string[] = [];
    if (existing && existing.planId !== planId) {
      const oldPlan = await tx.plan.findUnique({ where: { id: existing.planId } });
      if (oldPlan) {
        const newModules = new Set(plan.modules);
        for (const moduleId of oldPlan.modules) {
          if (!newModules.has(moduleId)) {
            disabledModules.push(moduleId);
            await tx.moduleState.upsert({
              where: { tenantId_moduleId: { tenantId, moduleId } },
              create: { tenantId, moduleId, status: 'OFF' },
              update: { status: 'OFF' },
            });
          }
        }
      }
    }

    await tx.auditEvent.create({
      data: {
        tenantId,
        type: 'subscription.updated',
        target: paymentId,
        data: {
          iyzicoEventId: eventId,
          provider: 'iyzico',
          planId,
          interval,
          status: 'ACTIVE',
          creditsGranted,
          disabledModules,
          planChanged: existing ? existing.planId !== planId : true,
        },
      },
    });

    // The audit trail of the payment. It is not the invoice — it never was,
    // despite what the comment here used to claim ("There is no Invoice table").
    // `Invoice` has existed since TASK-MTRD9QBJ2G32E; this path simply never
    // wrote to it, so every iyzico customer had an audit row and no document.
    await tx.auditEvent.create({
      data: {
        tenantId,
        type: 'invoice.payment_succeeded',
        target: paymentId,
        data: {
          iyzicoEventId: eventId,
          provider: 'iyzico',
          amountMinor,
          currency,
          planId,
          interval,
        },
      },
    });

    // The document itself. Shared with the Stripe path so the two providers
    // cannot issue different invoices for the same kind of sale, and never
    // allowed to fail the payment: a sale that went through stays recorded even
    // when the buyer's fiscal identity is missing and no invoice can be issued.
    // Runs on `tx`, so the invoice and the subscription commit together.
    const invoice = await createInvoiceForPayment(
      tx,
      {
        tenantId,
        paymentRef: paymentId,
        amountMinor,
        currency,
        description: `${plan.name} (${interval === 'year' ? '1 yıl' : '1 ay'})`,
        paidAt: new Date(),
        provider: 'iyzico',
      }
      // No third argument: the VAT rate is no longer a server setting. It comes
      // from the buyer's country inside the writer (boss decision 2026-09-08).
    );

    return {
      success: true,
      outcome: 'synced' as const,
      invoiceNumber: invoice.status === 'skipped' ? null : invoice.number,
      tenantId,
      planId,
      status: 'ACTIVE',
      amountMinor,
      currency,
      creditsGranted,
      disabledModules,
      message: `iyzico subscription ACTIVE for tenant ${tenantId} on plan ${planId}`,
    };
  });
}
