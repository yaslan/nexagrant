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

/** A present-but-blank variable (`SMTP_HOST=`) counts as unset. */
function blankToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema);
}

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
  /**
   * Scheduled jobs (graphile-worker, `pnpm jobs:worker`, ADR-0008).
   *
   * JOBS_CRON_ENABLED decides whether this worker schedules the crontab. It
   * must be set to `true` or `false` explicitly when NODE_ENV=production: the
   * switch from the old hosted scheduler is only safe once that one has stopped
   * firing, and a default would let a new worker and the old scheduler run the
   * same tick (ADR-0008 Ö-2, {@link jobsCronEnabled}). Outside production
   * unset means on. `false` still runs jobs added by hand.
   * JOBS_DATABASE_URL is the connection the worker uses for its own
   * `graphile_worker` schema (it creates and migrates it on start); unset =
   * DATABASE_URL. Job bodies always use DATABASE_URL through src/lib/db.ts.
   * JOBS_CONCURRENCY: jobs one worker process runs at once (default 2).
   */
  JOBS_CRON_ENABLED: blankToUndefined(z.enum(['true', 'false']).optional()),
  JOBS_DATABASE_URL: optionalUrl,
  JOBS_CONCURRENCY: blankToUndefined(
    z.string().regex(/^[1-9][0-9]*$/, 'JOBS_CONCURRENCY must be a positive integer').default('2')
  ),
  /**
   * Outgoing mail over our own SMTP server (src/lib/email/mailer.ts,
   * TASK-MUMLF57HOYFSB). SMTP_HOST unset or blank = no mail is sent; every
   * caller reports that (and in production writes a SystemAlert) instead of
   * counting the mail as sent. SMTP_SECURE unset = implicit TLS only on 465,
   * STARTTLS otherwise. SMTP_PASS is a credential — env only, never logged.
   * SMTP_FROM unset = `${PRODUCT_NAME} <NEXT_PUBLIC_SMTP_FROM_ADDRESS>`.
   */
  SMTP_HOST: blankToUndefined(z.string().optional()),
  // A string like every other entry (scripts treat `env` as a string record);
  // src/lib/email/mailer.ts turns it into a number.
  SMTP_PORT: blankToUndefined(z.string().regex(/^\d{1,5}$/, 'SMTP_PORT must be a port number').optional()),
  SMTP_SECURE: blankToUndefined(z.enum(['true', 'false']).optional()),
  SMTP_USER: blankToUndefined(z.string().optional()),
  SMTP_PASS: blankToUndefined(z.string().optional()),
  SMTP_FROM: blankToUndefined(z.string().optional()),
  WORKER_URL: z.string().optional(),
  WORKER_TOKEN: z.string().optional(),
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
   * Defaults to info@fonbridge.com (owner's decision 29.09.2026,
   * TASK-MUN2PKA5AG2IV); can be overridden per environment.
   */
  NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('info@fonbridge.com'),
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
  /**
   * Spend ceiling, in USD, for one run of the `k1-embeddings` job
   * (src/lib/scoring/embeddings.ts). The run stops before the call that would
   * cross it; the rows left over are embedded by the next run. Low by default so
   * a misconfigured catalogue cannot turn one night into a bill — raise it on
   * the worker for a one-off backfill.
   */
  K1_EMBEDDING_MAX_USD_PER_RUN: z
    .string()
    .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/, 'K1_EMBEDDING_MAX_USD_PER_RUN must be a non-negative number of USD')
    .default('0.05'),
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
   * R2_PUBLIC_HOST is the public origin of the bucket, if one exists. Evidence
   * is no longer linked from it (B-2, TASK-MUNODY0DVDWC5): anyone holding such
   * a URL read the file, CONFIDENTIAL ones included, and it went into the CSV
   * export. Evidence is read through the authenticated download route, which
   * redirects to a short-lived presigned GET. Only the CSP still reads this
   * (src/lib/security-headers.ts); the bucket itself should not be public.
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
   * (`src/lib/jobs/tasks/alerts-sweep.ts`) it takes before an `error`-level
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

export class JobsCronUnsetInProductionError extends Error {
  constructor() {
    super(
      '❌ JOBS_CRON_ENABLED is not set on a production worker. Set it to `false` until the old ' +
        'scheduler has stopped firing (deploy the web app first, see ADR-0008 §7 "Dağıtım sırası"), ' +
        'then to `true`. A default here could run the same tick twice.'
    );
    this.name = 'JobsCronUnsetInProductionError';
  }
}

/**
 * Whether a worker schedules the crontab (ADR-0008 Ö-2). Production refuses to
 * guess; anywhere else unset means on.
 */
export function jobsCronEnabled(
  source: { JOBS_CRON_ENABLED?: string; NODE_ENV?: string } = env
): boolean {
  if (source.JOBS_CRON_ENABLED === 'true') return true;
  if (source.JOBS_CRON_ENABLED === 'false') return false;
  if (source.NODE_ENV === 'production') throw new JobsCronUnsetInProductionError();
  return true;
}
