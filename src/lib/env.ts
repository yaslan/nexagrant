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
