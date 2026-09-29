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
  /**
   * Password-less e-mail and demo-seat sign-in (src/lib/demo-login.ts). Only the
   * literal `true` turns it on; unset or blank is off. Anything else is rejected
   * at boot, so a typo such as `ture` or `1` cannot leave an operator believing
   * it is off while guessing what "on" means. With NODE_ENV=production the server
   * refuses to start while it is `true` (TASK-MULSCEK4JHK8X).
   */
  DEMO_LOGIN_ENABLED: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['true', 'false']).optional()
  ),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
  INNGEST_API_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  /**
   * Inngest dev mode for local work (README "Yerel Inngest"). The SDK reads it
   * itself; it is listed here so {@link assertInngestDevModeAllowed} can refuse
   * a production server that has it on.
   */
  INNGEST_DEV: z.string().optional(),
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
   * Email address used for outgoing mail (invitations, system notifications).
   * Defaults to noreply@usfinbridge.com; can be overridden per environment.
   */
  NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('noreply@usfinbridge.com'),
  /**
   * Who FonBridge is on an invoice it issues: the seller's own fiscal identity.
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
   * The GİB e-invoice integrator (özel entegratör) FonBridge files through.
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
   * module load. The call sites decide what "unset" means, and for the RAG path
   * (`src/lib/rag.ts`) it means refusing: it used to fall back to a
   * deterministic mock embedding, which wrote meaningless vectors into the real
   * `Chunk` table (TASK-MTUH5L8MJ6S8E). No placeholder key ever ships to a real
   * endpoint either: `sk-mock-key-for-testing` used to be handed to the OpenAI
   * SDK, which turned a missing credential into a 401 at request time instead
   * of a clear configuration error (TASK-MTSWVADF7RQ1B).
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
  /**
   * Cloudflare R2 object storage. Neither of these is a secret; the R2
   * credentials stay on `process.env` inside src/lib/storage.ts because moving
   * a credential is a different change from moving a brand string.
   *
   * R2_PUBLIC_HOST is the origin that serves stored objects publicly
   * (e.g. https://files.example.org). Unset means there is no public origin,
   * and `publicObjectUrl()` then returns null instead of a link: the evidence
   * row is written with `fileUrl = null` and the UI renders no download button,
   * which is the truthful outcome. This used to be a bare literal on the
   * retired brand's storage domain, repeated in six places, so every upload
   * recorded a download link on a domain the company no longer publishes
   * (TASK-MTV5ESBVAHUEV).
   *
   * R2_BUCKET keeps the historical bucket default that storage.ts applies: 50
   * Evidence rows already carry it, and a bucket name is an infrastructure
   * identifier rather than a brand surface — renaming it would orphan every
   * stored object.
   */
  R2_PUBLIC_HOST: optionalUrl,
  R2_BUCKET: z.string().optional(),
  /**
   * How many *consecutive* failed runs of the daily orphan-alert sweep
   * (`src/lib/inngest/jobs/alerts-sweep.ts`) it takes before an `error`-level
   * alert is raised for the operator.
   *
   * A threshold rather than a constant because the right number is an
   * operations decision, not a code fact: a deployment whose database is
   * briefly unreachable during a nightly maintenance window wants a higher
   * number, one that runs the sweep manually wants 1. It is a setting and not
   * a literal for the same reason the sweep's own age floor is documented
   * rather than assumed — see that file.
   *
   * Default 3: the sweep runs once a day, so three runs is three days of the
   * orphan pile growing unattended, which is well inside the window before the
   * console's 300-row cap starts hiding real alerts, and comfortably outside a
   * single transient connection failure.
   *
   * Minimum 1 (= alert on the first failure); 0 and non-numeric text are
   * rejected at boot rather than silently meaning "never", because a threshold
   * that disables the alarm must be an explicit decision somewhere other than
   * an env var typo.
   *
   * Validated here but kept as a *string*, with the numeric view exported
   * separately below. Every other member of this object is a string, and
   * `scripts/efatura-preflight.ts` passes the whole `env` where a
   * `Partial<Record<string, string | undefined>>` is expected; a single number
   * field breaks `pnpm typecheck` at a call site that has nothing to do with
   * alerts. Measured, not guessed — that is exactly what happened when this
   * shipped as `z.coerce.number()`.
   */
  ALERTS_SWEEP_FAILURE_THRESHOLD: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .regex(/^[1-9][0-9]*$/, 'must be a positive integer (1 = alert on the first failure)')
      .default('3')
  ),
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

/**
 * The numeric view of `ALERTS_SWEEP_FAILURE_THRESHOLD`, converted once here so
 * no caller has to remember to. The schema above has already rejected anything
 * that is not a positive integer, so this cannot be `NaN`.
 */
export const alertsSweepFailureThreshold = Number(env.ALERTS_SWEEP_FAILURE_THRESHOLD);

/**
 * Whether this code was BUILT for production. Next replaces a direct
 * `process.env.NODE_ENV` read with a literal at build time, so starting a
 * production build with NODE_ENV=test cannot change it (same reasoning as
 * BUILT_FOR_PRODUCTION in src/lib/demo-login.ts). Keep it a direct member access.
 */
export const INNGEST_BUILT_FOR_PRODUCTION = process.env.NODE_ENV === 'production';

/** Values the Inngest SDK treats as "not dev mode" (its parseAsBoolean, plus blank). */
const INNGEST_DEV_OFF = new Set(['', '0', 'false', 'undefined']);

export class InngestDevModeInProductionError extends Error {
  constructor() {
    super(
      '❌ INNGEST_DEV is on in a production server. Dev mode skips request signature checks on ' +
        '/api/inngest, so anyone could run the scheduled jobs. Remove INNGEST_DEV (or set it to 0) ' +
        'and set INNGEST_SIGNING_KEY. For a local `pnpm start`, run it as `INNGEST_DEV=0 pnpm start`.'
    );
    this.name = 'InngestDevModeInProductionError';
  }
}

/**
 * Run once at server start (src/instrumentation.ts). A production server — a
 * production build, whatever NODE_ENV the process was started with, or
 * NODE_ENV=production — refuses to start while INNGEST_DEV is on. The client
 * (src/lib/inngest/client.ts) already forces cloud mode in a production build;
 * this makes the misconfiguration visible instead of silently ignored.
 *
 * @param builtForProduction the build-time half; a parameter only so the tests
 *   (which run unbuilt, under NODE_ENV=test) can exercise a production build.
 */
export function assertInngestDevModeAllowed(
  source: { INNGEST_DEV?: string; NODE_ENV?: string } = env,
  builtForProduction: boolean = INNGEST_BUILT_FOR_PRODUCTION
): void {
  const devValue = (source.INNGEST_DEV ?? '').trim().toLowerCase();
  if (!INNGEST_DEV_OFF.has(devValue) && (builtForProduction || source.NODE_ENV === 'production')) {
    throw new InngestDevModeInProductionError();
  }
}
