import { env } from '@/lib/env';

/**
 * The app's own public origin, read from NEXT_PUBLIC_APP_URL (TASK-MUN3OAFIVW9NA).
 * The live one is https://fonbridge.com (patron, 29.09).
 *
 * Every link the app builds to itself — OAuth redirect URIs, mail links,
 * Stripe return URLs, `metadataBase` — goes through here, so no file carries its
 * own `http://localhost:3000` or a guessed domain. The rules started as
 * `invitationMailBaseUrl` (K-3 of TASK-MUMMERMBJF1LM), which now calls this.
 */

export type AppUrlSource = Pick<typeof env, 'NODE_ENV' | 'NEXT_PUBLIC_APP_URL'>;

/** The live domain, used only when production has no usable NEXT_PUBLIC_APP_URL. */
export const CANONICAL_APP_URL = 'https://fonbridge.com';
const DEV_APP_URL = 'http://localhost:3000';

/**
 * NEXT_PUBLIC_APP_URL without a trailing slash, or null when there is none:
 * unset, blank or not a URL → null everywhere; in production a loopback host is
 * null as well. A loopback URL set on purpose in development is allowed.
 */
export function appBaseUrl(source: AppUrlSource = env): string | null {
  const raw = source.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (source.NODE_ENV === 'production' && isLoopback(url.hostname)) return null;
  return raw.replace(/\/+$/, '');
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
 * is (and always null outside production). `insecure` is an `http://` URL:
 * `appBaseUrl()` still returns it, but OAuth providers refuse a non-https
 * redirect_uri for anything but localhost and mail links would go out in the
 * clear.
 */
export function appUrlProblem(source: AppUrlSource = env): AppUrlProblem | null {
  if (source.NODE_ENV !== 'production') return null;
  const raw = source.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return 'unset';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid';
  }
  if (isLoopback(url.hostname)) return 'loopback';
  if (url.protocol !== 'https:') return 'insecure';
  return null;
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
