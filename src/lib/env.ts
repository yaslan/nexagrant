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
  /**
   * Whether `pnpm db:seed` also writes the demo tenant, its users and its
   * opportunities (FO-251, {@link seedDemoDecision}). Reference data (plans,
   * module catalogue, programmes, templates, rubrics) is written either way.
   * Unset or blank: on only when NODE_ENV is explicitly `development` or
   * `test`; off with NODE_ENV=production and off when NODE_ENV is not set.
   */
  SEED_DEMO: blankToUndefined(z.enum(['true', 'false']).optional()),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
  /**
   * CORDIS's own project-list widget on the landing page (FO-169,
   * src/components/CordisProjectsSection.tsx). The key ends up in the page as the
   * loader's `data-apikey`, so it is public by nature — but it is still the
   * owner's key and lives only in the environment. Unset or blank: the section
   * shows a plain link to the same CORDIS search instead of the widget.
   */
  NEXT_PUBLIC_CORDIS_WIDGET_KEY: blankToUndefined(z.string().optional()),
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
  /**
   * Key for the IP hash of the public expert pre-registration (TASK-MVBIXPP33UK1B,
   * src/lib/expert-prereg/server/). The per-IP limit stores HMAC(IP) under this
   * key, never the address. Unset = no IP is stored and the per-IP limit does not
   * apply; the route logs that once. Set it to a random string of 32+ characters.
   */
  EXPERT_PREREG_IP_SALT: blankToUndefined(z.string().min(32).optional()),
  /**
   * FO-396. The EU participant register's organisation-profile address (src/lib/pic-registry.ts).
   * Unset with NODE_ENV=production = the production address; unset anywhere else = no call at all
   * (fail-closed, the answer is UNKNOWN). Only `ec.europa.eu` is called, unless the test flag below
   * is on.
   */
  PIC_REGISTRY_URL: optionalUrl,
  /** FO-396. Test-only: lets the register check reach 127.0.0.1 / localhost (a local stub). Unset = off. */
  PIC_REGISTRY_ALLOW_LOCAL: blankToUndefined(z.enum(['true', 'false']).optional()),
  /** FO-396. Switches the register check off entirely (the e2e web server). Unset = off. */
  PIC_REGISTRY_OFF: blankToUndefined(z.enum(['true', 'false']).optional()),
  /**
   * Signs the opt-out link of a first message (NG-42, src/lib/email/opt-out.ts).
   * The links do not expire and sit in mail already delivered, so this key must
   * NEVER rotate: changing it breaks every one of them. Unset or blank = AUTH_SECRET,
   * and then rotating AUTH_SECRET breaks them. 32+ random characters; not AUTH_SECRET.
   */
  EMAIL_OPTOUT_SECRET: blankToUndefined(z.string().min(32).optional()),
  WORKER_URL: z.string().optional(),
  WORKER_TOKEN: z.string().optional(),
  /** Where the weekly beta feedback digest goes. Unset = digest computes but does not send. */
  FEEDBACK_DIGEST_TO: z.string().email().optional(),
  /**
   * Where the hourly `alerts-ops-digest` mail (new `error` SystemAlerts) goes
   * (FO-246). Unset or blank = the job skips and says so once; nothing is mailed.
   */
  ALERTS_OPS_EMAIL: blankToUndefined(z.string().email().optional()),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  /** NextAuth.js standard for proxy environments (e.g., Passenger). Provides the public origin when req.url is rewritten to localhost. */
  AUTH_URL: z.string().optional(),
  /**
   * The session-signing key (NextAuth; NEXTAUTH_SECRET is the older name). Startup
   * refuses to run without a strong one (src/lib/auth-secret.ts); read it here
   * with {@link authSecret}.
   */
  AUTH_SECRET: blankToUndefined(z.string().optional()),
  NEXTAUTH_SECRET: blankToUndefined(z.string().optional()),
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
   * Defaults to info@nexagrant.com (patron, 30.10.2026, FO-233; was info@fonbridge.com,
   * decision 29.09.2026, TASK-MUN2PKA5AG2IV); can be overridden per environment.
   */
  NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('info@nexagrant.com'),
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
  /** keep.eu Open Data API authentication key for Interreg project data. */
  KEEP_EU_API_KEY: z.string().optional(),
  /**
   * 256-bit AES-GCM encryption key for sensitive tokens in CalendarConnection.
   * If unset, token encryption/decryption will fail with 503 (CalendarEncryptionNotConfiguredError).
   */
  CALENDAR_ENCRYPTION_KEY: z.string().optional(),
  /**
   * 256-bit AES-GCM key for the buyer tax number (`buyerVknTckn`) on
   * TenantBillingIdentity and Invoice (NG-40, src/lib/billing/tax-id-crypto.ts).
   * 64 hex characters or `openssl rand -base64 32`. Unset = billing identity
   * and invoice writes fail closed; the number is never stored in clear.
   */
  TAX_ID_ENCRYPTION_KEY: z.string().optional(),
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
   * R2_PUBLIC_HOST is the public base URL of R2_PUBLIC_BUCKET, a separate
   * bucket the store serves to anyone (blog images, TASK-MUU20NSV2TETW); it may
   * carry a path (MinIO `http://host:9000/<bucket>`, Supabase Storage
   * `https://<ref>.supabase.co/storage/v1/object/public/<bucket>`). The CSP
   * img-src and next.config `images.remotePatterns` read it too. Evidence is
   * never linked from it (B-2, TASK-MUNODY0DVDWC5): anyone holding such a URL
   * read the file, CONFIDENTIAL ones included. Evidence stays in the private
   * R2_BUCKET and is read through the authenticated download route, which
   * redirects to a short-lived presigned GET.
   *
   * R2_BUCKET keeps the historical bucket default that storage.ts applies: 50
   * Evidence rows already carry it, and a bucket name is an infrastructure
   * identifier rather than a brand surface — renaming it would orphan every
   * stored object.
   */
  R2_PUBLIC_HOST: optionalUrl,
  R2_PUBLIC_BUCKET: blankToUndefined(z.string().optional()),
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
  /**
   * Share of the M8 seat-candidate score carried by live partner demand
   * (src/lib/scoring/live-demand.ts, FO-63). A decimal in [0, 1]; unset or
   * blank = the 15 % default. Kept as a string like the threshold above, with
   * the numeric view exported below.
   */
  CONSORTIUM_LIVE_DEMAND_WEIGHT: blankToUndefined(
    z
      .string()
      .regex(/^(0(\.[0-9]+)?|1(\.0+)?)$/, 'must be a decimal between 0 and 1 (e.g. 0.15)')
      .optional()
  ),
  /**
   * Connect timeout of the pg pool, in milliseconds (src/lib/db.ts). Unset or
   * blank = 1000, the production value, which fails fast into the fallback path.
   * Only the test/gate environment raises it (scripts/gate-isolated.sh sets
   * 10000): on a loaded machine a fresh connection can take longer than 1 s, and
   * the page answered 500 instead of waiting (FO-253). Capped at 60 s.
   */
  DB_CONNECT_TIMEOUT_MS: blankToUndefined(
    z
      .string()
      .regex(/^[1-9][0-9]*$/, 'DB_CONNECT_TIMEOUT_MS must be a positive integer (milliseconds)')
      .refine((value) => Number(value) <= 60_000, 'DB_CONNECT_TIMEOUT_MS must be at most 60000')
      .optional()
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
 * NODE_ENV as the process actually set it, before the schema's
 * `.default('development')`: `undefined` when the variable is absent (a blank
 * one already fails the enum above).
 * Only for decisions that must fail closed when nobody said which environment
 * this is ({@link seedDemoDecision}); everything else keeps reading
 * `env.NODE_ENV`. A present value has already passed the enum above.
 */
export const declaredNodeEnv: 'development' | 'test' | 'production' | undefined =
  process.env.NODE_ENV === undefined ? undefined : env.NODE_ENV;

/**
 * The key NextAuth signs sessions with, for code that derives a labelled key of
 * its own from it (FO-29, src/lib/expert-prereg/server/verified-outcome.ts).
 * `null` only in a process that skipped the startup check.
 */
export function authSecret(): string | null {
  return env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? null;
}

/** The key of the opt-out links: its own when set, otherwise the session key. */
export function emailOptOutSecret(): string | null {
  return env.EMAIL_OPTOUT_SECRET ?? authSecret();
}

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

/**
 * Whether the seed writes the demo data (FO-251). `SEED_DEMO` wins when set.
 * Unset fails closed: demo data only when NODE_ENV is explicitly `development`
 * or `test`; with NODE_ENV=production *or no NODE_ENV at all* (a `pnpm db:seed`
 * from a server shell, FO-296) the seed fills the catalogue without opening
 * `demo-tenant`. The default source therefore reads {@link declaredNodeEnv},
 * not `env.NODE_ENV`, whose schema default would turn "unset" into
 * `development`. An explicit `true` in production is obeyed, with a warning
 * for the seed to print.
 */
export function seedDemoDecision(
  source: { SEED_DEMO?: string; NODE_ENV?: string } = { SEED_DEMO: env.SEED_DEMO, NODE_ENV: declaredNodeEnv }
): { enabled: boolean; warning: string | null } {
  const production = source.NODE_ENV === 'production';
  if (source.SEED_DEMO === 'false') return { enabled: false, warning: null };
  if (source.SEED_DEMO === 'true') {
    return {
      enabled: true,
      warning: production
        ? '⚠️  SEED_DEMO=true with NODE_ENV=production: writing demo-tenant and its demo users into this database.'
        : null,
    };
  }
  return { enabled: source.NODE_ENV === 'development' || source.NODE_ENV === 'test', warning: null };
}

/**
 * The numeric view of `CONSORTIUM_LIVE_DEMAND_WEIGHT`; `undefined` when unset,
 * so the scorer falls back to its own default.
 */
export const consortiumLiveDemandWeight: number | undefined =
  env.CONSORTIUM_LIVE_DEMAND_WEIGHT === undefined ? undefined : Number(env.CONSORTIUM_LIVE_DEMAND_WEIGHT);

/**
 * The numeric view of `DB_CONNECT_TIMEOUT_MS`; 1000 ms when unset (production).
 * Read by {@link createDbClient} in src/lib/db.ts.
 */
export const dbConnectTimeoutMs: number =
  env.DB_CONNECT_TIMEOUT_MS === undefined ? 1000 : Number(env.DB_CONNECT_TIMEOUT_MS);
