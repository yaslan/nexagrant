import { env } from './env';

/**
 * The switch for the password-less e-mail sign-in (TASK-MULSCEK4JHK8X).
 *
 * The Credentials provider in src/lib/auth.ts checks no password: whoever types
 * an address signs in as that account, an unknown address creates one, and the
 * demo seats below carry platform-admin rights. That is a demo convenience, not
 * authentication, so it exists only where `DEMO_LOGIN_ENABLED=true` says so.
 * Unset means off. With it off:
 *
 * - the Credentials provider is not registered, so
 *   `POST /api/auth/callback/credentials` has nothing to sign in with;
 * - the e-mail address `PLATFORM_ADMIN_DEMO_EMAIL` grants nothing — platform
 *   admin comes only from `User.isPlatformAdmin` in the database;
 * - the login page shows only the configured OAuth providers.
 *
 * Kept free of NextAuth and Prisma so the startup check and server components
 * can read it without loading the auth stack.
 */

/** The demo seat that is a platform admin. Grants that role only while demo sign-in is on. */
export const PLATFORM_ADMIN_DEMO_EMAIL = 'admin@yasinaslan.com.tr';

type DemoLoginEnv = { DEMO_LOGIN_ENABLED?: string; NODE_ENV?: string };

/**
 * Whether this code was BUILT for production, not whether the process says it
 * runs in production. Next replaces a direct `process.env.NODE_ENV` read with a
 * literal at build time (`next build` → "production", `next dev` → "development"),
 * so starting a production build with `NODE_ENV=test` or `development` cannot
 * change it. It has to stay a direct member access: read through the parsed
 * `env` object it is a runtime value again, and that is the hole this closes
 * (TASK-MULU7GVFBTRXX Ö-1: a production build started with NODE_ENV=test handed
 * out a password-less admin session).
 */
const BUILT_FOR_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * On only when the flag says `true` AND neither the build nor the process is a
 * production one. The production half is a second lock behind
 * {@link assertDemoLoginAllowed}, which refuses to start such a server in the
 * first place.
 *
 * @param builtForProduction the build-time half; a parameter only so the tests
 *   (which run unbuilt, under NODE_ENV=test) can exercise a production build.
 */
export function isDemoLoginEnabled(
  source: DemoLoginEnv = env,
  builtForProduction: boolean = BUILT_FOR_PRODUCTION
): boolean {
  return (
    source.DEMO_LOGIN_ENABLED === 'true' && !builtForProduction && source.NODE_ENV !== 'production'
  );
}

export function isPlatformAdminDemoEmail(
  email: string | null | undefined,
  source: DemoLoginEnv = env,
  builtForProduction: boolean = BUILT_FOR_PRODUCTION
): boolean {
  return (
    isDemoLoginEnabled(source, builtForProduction) &&
    typeof email === 'string' &&
    email.trim().toLowerCase() === PLATFORM_ADMIN_DEMO_EMAIL
  );
}

export class DemoLoginInProductionError extends Error {
  constructor() {
    super(
      'DEMO_LOGIN_ENABLED=true is not allowed in a production build or with NODE_ENV=production: it lets anyone sign in as any account, platform admin included, without a password. Remove it from the production environment; the server will not start with it.'
    );
    this.name = 'DemoLoginInProductionError';
  }
}

/**
 * Run once at server start (src/instrumentation.ts). A production server with
 * the flag on — a production build, whatever NODE_ENV the process was started
 * with, or NODE_ENV=production — refuses to start rather than warn: a warning lands in a log nobody
 * reads while the login page quietly hands out admin sessions, and silently
 * ignoring the flag would leave an operator who set it on purpose wondering why
 * the demo is gone. Refusal is the one outcome that is both safe and visible.
 */
export function assertDemoLoginAllowed(
  source: DemoLoginEnv = env,
  builtForProduction: boolean = BUILT_FOR_PRODUCTION
): void {
  if (
    source.DEMO_LOGIN_ENABLED === 'true' &&
    (builtForProduction || source.NODE_ENV === 'production')
  ) {
    throw new DemoLoginInProductionError();
  }
}

export type OAuthProviderAvailability = { google: boolean; microsoft: boolean };

/**
 * Which OAuth providers have both halves of their credentials set — the same
 * variables src/lib/auth.ts hands to the providers. A button for a provider
 * without them only leads to an Auth.js error page.
 */
export function configuredOAuthProviders(
  source: Record<string, string | undefined> = process.env
): OAuthProviderAvailability {
  const set = (...names: string[]) => names.some((n) => (source[n] ?? '').trim() !== '');
  return {
    google:
      set('AUTH_GOOGLE_ID', 'GOOGLE_CLIENT_ID') && set('AUTH_GOOGLE_SECRET', 'GOOGLE_CLIENT_SECRET'),
    microsoft:
      set('AUTH_MICROSOFT_ENTRA_ID_ID') && set('AUTH_MICROSOFT_ENTRA_ID_SECRET'),
  };
}
