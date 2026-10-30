import { env } from '@/lib/env';

/**
 * The app's own public origin, read from NEXT_PUBLIC_APP_URL (TASK-MUN3OAFIVW9NA).
 * The live one is https://nexagrant.com (patron, 30.10.2026, FO-233).
 *
 * Every link the app builds to itself — OAuth redirect URIs, mail links,
 * Stripe return URLs, `metadataBase` — goes through here, so no file carries its
 * own `http://localhost:3000` or a guessed domain. The rules started as
 * `invitationMailBaseUrl` (K-3 of TASK-MUMMERMBJF1LM), which now calls this.
 */

export type AppUrlSource = Pick<typeof env, 'NODE_ENV' | 'NEXT_PUBLIC_APP_URL'>;

/** The live domain, used only when production has no usable NEXT_PUBLIC_APP_URL. */
export const CANONICAL_APP_URL = 'https://nexagrant.com';
const DEV_APP_URL = 'http://localhost:3000';

/**
 * The origin of NEXT_PUBLIC_APP_URL (scheme, host, port; no path, query or
 * trailing slash), or null when there is none.
 *
 * In production it is null whenever `appUrlProblem()` names a problem: unset,
 * not a URL, loopback, http:// or more than an origin. The invitation mail and
 * the Google Calendar redirect_uri are built from this and nothing else, so the
 * `.env.example` promise holds: with a wrong value both stay off rather than go
 * out over http:// or with a query glued in front of the path (B-1 and B-3 of
 * İNCELEME-39). Outside production a loopback or http:// URL set on purpose
 * (mailpit, `next dev`) is allowed.
 */
export function appBaseUrl(source: AppUrlSource = env): string | null {
  if (source.NODE_ENV === 'production' && appUrlProblem(source)) return null;
  const url = parseAppUrl(source);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  return url.origin;
}

/**
 * For links that cannot be left out (a Stripe return URL, `metadataBase`, a
 * digest mail): `appBaseUrl()`, else the live domain in production and
 * localhost elsewhere. Production without a usable value is reported at
 * startup by `appUrlProblem()`; this only keeps the link off localhost.
 */
export function appUrl(source: AppUrlSource = env): string {
  return appBaseUrl(source) ?? (source.NODE_ENV === 'production' ? CANONICAL_APP_URL : DEV_APP_URL);
}

export type AppUrlProblem = 'unset' | 'invalid' | 'loopback' | 'insecure';

/**
 * What is wrong with NEXT_PUBLIC_APP_URL in production, or null when nothing
 * is (and always null outside production). Any answer but null makes
 * `appBaseUrl()` null there too.
 *   • `invalid`: not a URL, or more than an origin — a query, a fragment, a
 *     path or credentials. A link built as `${base}/path` would carry them in
 *     the wrong place (`https://nexagrant.com/?x=1/api/calendar/callback`).
 *   • `insecure`: not https. OAuth providers refuse such a redirect_uri for
 *     anything but localhost, and invitation links would go out in the clear.
 */
export function appUrlProblem(source: AppUrlSource = env): AppUrlProblem | null {
  if (source.NODE_ENV !== 'production') return null;
  if (!source.NEXT_PUBLIC_APP_URL?.trim()) return 'unset';
  const url = parseAppUrl(source);
  if (!url) return 'invalid';
  if (isLoopback(url.hostname)) return 'loopback';
  if (url.protocol !== 'https:') return 'insecure';
  // `https://nexagrant.com?` parses to an empty `search`, hence the raw check.
  const raw = source.NEXT_PUBLIC_APP_URL.trim();
  if (url.search || url.hash || raw.includes('?') || raw.includes('#')) return 'invalid';
  if (url.pathname !== '/' || url.username || url.password) return 'invalid';
  return null;
}

function parseAppUrl(source: AppUrlSource): URL | null {
  const raw = source.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  // `localhost.` (a trailing root dot) resolves like `localhost` (İNCELEME-26 Ö-3).
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    h.startsWith('127.') ||
    // IPv4-mapped loopback: WHATWG URL writes [::ffff:127.0.0.1] as [::ffff:7f00:1].
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(h)
  );
}
