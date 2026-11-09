/**
 * NG-104 — the opt-out key falls back to AUTH_SECRET when EMAIL_OPTOUT_SECRET
 * is unset (src/lib/env.ts `emailOptOutSecret`). Nothing says so at runtime,
 * and rotating AUTH_SECRET then breaks every link already sent.
 */

/** Reason recorded when no opt-out key is available (src/app/api/invitations/route.ts). */
export const OPT_OUT_SECRET_UNSET = 'opt_out_secret_unset';

/**
 * The startup warning for production, or null when none is needed. Never
 * includes the value of any key.
 */
export function optOutSecretFallbackWarning(
  source: Record<string, string | undefined> = process.env,
): string | null {
  if (source.NODE_ENV !== 'production') return null;
  if (source.EMAIL_OPTOUT_SECRET?.trim()) return null;
  return (
    'EMAIL_OPTOUT_SECRET is not set: opt-out links are signed with AUTH_SECRET. ' +
    'Rotating AUTH_SECRET will break every opt-out link already sent; set EMAIL_OPTOUT_SECRET (32+ characters) before sending mail.'
  );
}
