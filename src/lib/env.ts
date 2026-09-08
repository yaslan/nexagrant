import { z } from 'zod';

/**
 * Optional URL setting. A variable that is present but blank
 * (`NEXT_PUBLIC_POSTHOG_HOST=`) is treated as unset: an unused endpoint must not
 * throw at import time and take down every route that reads config.
 */
const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: optionalUrl,
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
  INNGEST_API_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  WORKER_URL: z.string().optional(),
  WORKER_TOKEN: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  /** Where the weekly beta feedback digest goes. Unset = digest computes but does not send. */
  FEEDBACK_DIGEST_TO: z.string().email().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  /**
   * iyzico (TRY billing, BILLING.md §4). Unset = the iyzico payment flow is
   * disabled and its webhook route refuses every delivery; it never falls back
   * to a demo key, because a demo key cannot verify a real notification
   * signature and an unverified notification must not reach the database.
   */
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  /** Defaults to the sandbox host; set to https://api.iyzipay.com only for live. */
  IYZICO_BASE_URL: optionalUrl,
  /**
   * Which early-bird discount tier billing runs under — a code from
   * `DISCOUNT_TIERS` in src/lib/billing/catalog.ts, or `NONE` for list price.
   * Unset = the advertised default tier. The discount rate is a server setting;
   * it is never taken from the browser.
   */
  BILLING_ACTIVE_TIER: z.string().optional(),
  /**
   * Who Fabrika is on an invoice it issues: the seller's own fiscal identity.
   *
   * Every one of these is optional and has no default, deliberately. A supplier
   * VKN and tax office are facts about a registered company, not something an
   * application may pick: the route that exports an invoice
   * (`src/app/api/billing/invoices/[id]/export`) refuses to produce a document
   * while any of them is unset rather than printing a plausible-looking number.
   * They shipped hard-coded once — VKN 3810459281, "Maslak Vergi Dairesi" — on a
   * document that claimed a fiscal seal (TASK-MTRD9QBJ2G32E).
   *
   * INVOICE_SUPPLIER_EMAIL is genuinely optional: UBL-TR does not require it.
   */
  INVOICE_SUPPLIER_NAME: z.string().optional(),
  INVOICE_SUPPLIER_VKN: z.string().optional(),
  INVOICE_SUPPLIER_TAX_OFFICE: z.string().optional(),
  INVOICE_SUPPLIER_ADDRESS: z.string().optional(),
  INVOICE_SUPPLIER_CITY: z.string().optional(),
  INVOICE_SUPPLIER_COUNTRY: z.string().optional(),
  INVOICE_SUPPLIER_EMAIL: z.string().optional(),
  /**
   * The VAT (KDV) rate, in percent, that a subscription charge is issued under.
   *
   * Optional and without a default, for the same reason as the supplier
   * identity above: the rate a sale is taxed at is a fiscal fact about the
   * seller and the product, not a constant this code may choose. Nothing in
   * this repo states whether the advertised prices include KDV, and a wrong
   * rate on an invoice is a wrong tax figure, not a cosmetic slip.
   *
   * While it is unset no invoice is issued at all: the payment still completes
   * and a SystemAlert names this variable (`src/lib/billing/invoice-writer.ts`).
   *
   * The charged amount is treated as VAT-INCLUSIVE and decomposed at this rate,
   * so an issued invoice's grand total always equals what the card was actually
   * charged. `0` is a legitimate value and means the sale is not subject to VAT.
   */
  INVOICE_VAT_RATE: z.string().optional(),
  /**
   * The GİB e-invoice integrator (özel entegratör) Fabrika files through.
   *
   * Optional, like everything else here, and for the same reason: an
   * unconfigured integration must leave billing working rather than take the
   * process down at import time. `src/lib/efatura-integrator.ts` reports which
   * of them are missing and files nothing until all four are set — it never
   * invents a credential and never reports a document as filed.
   *
   * EFATURA_INTEGRATOR_TEST_MODE defaults to the vendor's test environment;
   * only the literal string `false` points a filing at production.
   */
  EFATURA_INTEGRATOR_PROVIDER: z.string().optional(),
  EFATURA_INTEGRATOR_BASE_URL: optionalUrl,
  EFATURA_INTEGRATOR_USERNAME: z.string().optional(),
  EFATURA_INTEGRATOR_PASSWORD: z.string().optional(),
  EFATURA_INTEGRATOR_TEST_MODE: z.string().optional(),
  /**
   * LLM provider credentials. Both optional and without a default: an
   * unconfigured provider must leave the app importable rather than throw at
   * module load. The call sites decide what "unset" means — `src/lib/rag.ts`
   * falls back to a deterministic mock embedding for dev/demo, while
   * `src/lib/ai/rag.ts` refuses to ingest. Neither ever ships a placeholder key
   * to a real endpoint: `sk-mock-key-for-testing` used to be handed to the
   * OpenAI SDK, which turned a missing credential into a 401 at request time
   * instead of a clear configuration error (TASK-MTSWVADF7RQ1B).
   */
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * 256-bit AES-GCM encryption key for sensitive tokens in CalendarConnection.
   * If unset, token encryption/decryption will fail with 503 (CalendarEncryptionNotConfiguredError).
   */
  CALENDAR_ENCRYPTION_KEY: z.string().optional(),
  /**
   * Where the TCMB daily exchange-rate bulletin is read from
   * (`src/lib/fx/tcmb.ts`). Unset = the real archive,
   * https://www.tcmb.gov.tr/kurlar — TCMB publishes it openly, so unlike every
   * other integration here this one needs no credential and works out of the box.
   *
   * It is overridable only so a test can point at a fixture host instead of the
   * live bank, never to substitute a different rate source: a rate on an invoice
   * is a fiscal assertion under VUK 280 (ADR-0002).
   */
  TCMB_BASE_URL: optionalUrl,
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  // `issues` names the offending variable; `format()` renders as `{}` on zod v4.
  const details = _env.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  console.error('❌ Invalid environment variables:', details);
  throw new Error(`Invalid environment variables — ${details}`);
}

export const env = _env.data;
