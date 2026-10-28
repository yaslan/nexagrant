/**
 * Security response headers (TASK-MUN80T8IVTPM7 — Y-2, D-2 of the TASK-MUN66T2HM4A4E scan).
 *
 * Two halves, because they are set in two places:
 *
 * 1. `STATIC_SECURITY_HEADERS` — the same bytes on every response. next.config.ts
 *    `headers()` puts them on `/:path*` (pages, API routes and `/_next/*` assets
 *    alike). They are baked into the build (`routes-manifest.json`): changing one
 *    means a rebuild.
 *
 * 2. The Content-Security-Policy — it carries a fresh nonce per request, so it is
 *    written by src/proxy.ts at runtime. Next.js reads the nonce back out of the
 *    *request* `Content-Security-Policy` header and stamps it on its own inline
 *    RSC-payload scripts and chunk `<script>` tags; nothing in src/ has to pass it
 *    around. The proxy matcher skips `/api`, `/_next` and static-file extensions
 *    (src/proxy.ts `config`). `/api` gets `API_CONTENT_SECURITY_POLICY` from
 *    next.config instead (never both on one response: two enforced policies
 *    intersect, and the static one has no nonce). A static-file path with no file
 *    behind it gets `STATIC_FILE_CONTENT_SECURITY_POLICY` the same way.
 *
 * Why the policy looks the way it does — keep this in step with the code:
 * - script-src: nonce + 'strict-dynamic'. Next's inline `self.__next_f.push(…)`
 *   scripts rule out a plain 'self' list; 'strict-dynamic' lets the nonced loader
 *   pull in the chunks it creates. 'unsafe-eval' only in `next dev` (React's dev
 *   tooling and HMR use eval); the production build needs none.
 * - style-src 'unsafe-inline': React `style={…}` attributes and next/font's
 *   injected <style> cannot carry a nonce. Style injection is a far smaller risk
 *   than script injection and is the documented Next.js trade-off.
 * - img-src: next/image serves remote images through `/_next/image` ('self'); the
 *   blog also renders unsplash URLs directly, and stored evidence may be shown
 *   from `R2_PUBLIC_HOST`. `data:`/`blob:` for inline icons and local previews.
 * - connect-src: the browser talks to this origin, to PostHog's capture endpoint
 *   (src/lib/analytics.ts — only after consent) and, for evidence uploads, PUTs the
 *   file straight to the R2 presigned URL (`<account>.r2.cloudflarestorage.com`).
 *   Anthropic/OpenAI/SEDIA/CORDIS are called from the server only and are
 *   deliberately absent.
 * - CORDIS widget (FO-168, moved into a sandboxed iframe by FO-169 / K-573263): the
 *   widget's scripts never run in a page of ours with our origin. The home page
 *   (`/tr`, `/en` — `isCordisWidgetHostPath`) only frames `/<locale>/embed/cordis`
 *   (`frame-src 'self'`) in `<iframe sandbox="allow-scripts allow-popups
 *   allow-popups-to-escape-sandbox">` — no `allow-same-origin`, so the document
 *   inside has an opaque origin and cannot read our DOM, storage or cookies or call
 *   our API as the visitor. The embed route (`isCordisWidgetPath`) is the only
 *   policy that names CORDIS: the one path `https://cordis.europa.eu/datalab/visualisations/`
 *   in style-src, img-src and font-src, and `frame-ancestors 'self'` so only our
 *   home page can frame it. Measured with Playwright (CSP off, then enforced): the
 *   nonced widgetLoader.js injects jQuery, three helper scripts, three stylesheets
 *   and the spinner, then fetches its data as JSONP (`<script src=…/widget/api/*.php>`),
 *   not XHR. Scripts need no host entry — 'strict-dynamic' trusts what the nonced
 *   loader injects; connect-src stays as it is. Every other route keeps the policy
 *   above, byte for byte.
 * - form-action: Auth.js signs in with a form POST to /api/auth/signin/google that
 *   redirects to accounts.google.com; Chrome applies form-action to that redirect.
 * - frame-ancestors 'none' (with X-Frame-Options DENY for old browsers),
 *   object-src 'none', base-uri 'self', frame-src 'none' — nothing embeds us and
 *   we embed nothing, except the CORDIS embed above.
 * - report-uri: violations are POSTed to `/api/csp-report`, which only logs a
 *   trimmed summary (İNCELEME-57 Ö-1). Without it a report-only rollout shows
 *   nothing but the visitor's own console. Deliberately no `report-to`: once a
 *   policy names one, Chromium ignores `report-uri` and queues the report for the
 *   Reporting API instead — measured on Chromium 1243 against a local server,
 *   `report-uri` alone arrived at once, while with `report-to` (relative or
 *   absolute `Reporting-Endpoints`) nothing arrived in 70 s. `report-uri` is
 *   deprecated but every current engine still sends it.
 * - No `upgrade-insecure-requests`: HSTS already does it on the real domain, and on
 *   plain-http hosts (local prod build, LAN) it would rewrite same-origin asset URLs
 *   to https and break the page.
 *
 * Rollback without a code change: `CSP_MODE=report-only` (read at request time by
 * the proxy) sends the same policy as `Content-Security-Policy-Report-Only`, so a
 * policy that turns out to block something in production can be defanged with an
 * env change + restart instead of a rebuild.
 */

export type HeaderEntry = { key: string; value: string };

export const PERMISSIONS_POLICY_VALUE =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';

export const STATIC_SECURITY_HEADERS: readonly HeaderEntry[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // accept-invite overrides this with `no-referrer` (next.config.ts, later entry wins).
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY_VALUE },
];

/**
 * The only inline script `/api/*` ever serves: the "print / save as PDF" button of
 * the printable pages (src/lib/document-exporter.ts, src/lib/efatura.ts →
 * `onclick="window.print()"`). 'unsafe-hashes' + this hash allows that exact
 * handler text and nothing else. Change the button, change the hash — the unit
 * test recomputes it and checks the exporters still emit that text.
 */
export const PRINT_BUTTON_HANDLER = 'window.print()';
export const PRINT_BUTTON_HANDLER_SHA256 = 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU=';

/**
 * For responses the proxy never sees (`/api/*`): JSON, downloads, and three printable
 * HTML pages (document / e-invoice / agency report export) that carry user-written
 * text — inline <style> only, no network, one hashed click handler.
 */
export const API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src 'unsafe-hashes' '${PRINT_BUTTON_HANDLER_SHA256}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * File extensions the proxy matcher leaves out (src/proxy.ts `config`): paths that
 * are only ever static files. The matcher has to be a literal Next.js can read at
 * build time, so it repeats this list — src/lib/security-headers.test.ts checks
 * the two are the same.
 */
export const STATIC_FILE_EXTENSIONS =
  'ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map';

/**
 * For a static-file path that has no file behind it (`/yok.png`, `/x.js`,
 * `/robots.txt`): the proxy never runs there, so Next's app 404 — ~30 inline
 * scripts — went out with no policy at all (İNCELEME-78 Y-1). It needs no nonce:
 * the 404 page is a heading and a plain link, and works with its scripts blocked.
 * No report-uri on purpose: every visit would report its own blocked scripts and
 * use up the report endpoint's global budget.
 */
export const STATIC_FILE_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * next.config `headers()` source for `STATIC_FILE_CONTENT_SECURITY_POLICY`. It covers
 * the paths the proxy matcher skips and that are not `/api/*` (that has its own
 * policy): every path with a static-file extension, and anything under `/_next` or
 * `/_vercel` (`/_next/yok` is the app 404 too). Left out are the responses that are
 * real files: `servedFiles` (e.g. `/logo.png`, read from public/ at build time),
 * `/_next/static/*` (a missing chunk there is a plain-text 404) and `/_next/image`.
 * Those go out without a CSP, cached as before.
 *
 * Header sources match case-insensitively, the proxy matcher does not: `/yok.PNG`
 * and `/tr/yok.png` match here *and* run the proxy. That is safe — the proxy's
 * header replaces this one on the response (measured, see the TASK-MUO06ANN5D3RM
 * report) — and it leaves no hole for `/TR/yok.png`, which the proxy skips.
 *
 * What case-folding costs: the exceptions above leave out every case variant of
 * a real file too — `/Logo.png`, `/Favicon.ICO`, `/_next/Image`, `/_next/STATIC/x.js`,
 * `/_NEXT/static/x.js` — although no file answers them (İNCELEME-98 Y-1). A regex
 * cannot fix that here: Node 22 has no `(?-i:…)`. The proxy matcher closes it —
 * it skips only plain-lowercase paths, so every one of those runs the proxy
 * (src/proxy.ts `config`).
 */
export function staticFileNotFoundSource(servedFiles: readonly string[]): string {
  const served = servedFiles.map((f) => escapeRegExp(f.replace(/^\//, '')));
  const skip = [
    'api(?:/|$)',
    '_next/static/',
    '_next/image$',
    ...(served.length ? [`(?:${served.join('|')})$`] : []),
  ];
  const covered = `.*\\.(?:${STATIC_FILE_EXTENSIONS})|_next(?:/.*)?|_vercel(?:/.*)?`;
  return `/:path((?!${skip.join('|')})(?:${covered})$)`;
}

/** Where the browser POSTs violation reports (src/app/api/csp-report/route.ts). */
export const CSP_REPORT_PATH = '/api/csp-report';

export type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** NEXT_PUBLIC_POSTHOG_HOST, or analytics' EU default when the key is set. */
  posthogHost?: string | null;
  /** R2_ACCOUNT_ID — presigned PUT uploads go to `<id>.r2.cloudflarestorage.com`. */
  r2AccountId?: string | null;
  /** R2_PUBLIC_HOST — public object URLs. */
  r2PublicHost?: string | null;
  /** R2_ENDPOINT — S3-compatible endpoint (MinIO, etc.). Origin only, safe HTTP for loopback. */
  r2Endpoint?: string | null;
  /** The CORDIS widget's own document (`isCordisWidgetPath`): its path for styles, images, fonts; framed by us only. */
  cordisWidget?: boolean;
  /** The page that frames the CORDIS embed (`isCordisWidgetHostPath`): `frame-src 'self'`, nothing from CORDIS. */
  cordisWidgetHost?: boolean;
};

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/** Everything the CORDIS widget loads lives under this one path (CSS, fonts, flags, spinner; its scripts ride on strict-dynamic). */
export const CORDIS_WIDGET_SOURCE = 'https://cordis.europa.eu/datalab/visualisations/';

/**
 * The CORDIS widget's own document: `/tr/embed/cordis`, `/en/embed/cordis`
 * (optional trailing slash). Lower case only — anything else gets the default policy.
 */
export function isCordisWidgetPath(pathname: string): boolean {
  return /^\/(?:tr|en)\/embed\/cordis\/?$/.test(pathname);
}

/**
 * The pages that frame the CORDIS embed: the home page, `/tr` and `/en`
 * (localePrefix is 'always'; `/` redirects to one of them). Lower case only.
 */
export function isCordisWidgetHostPath(pathname: string): boolean {
  return /^\/(?:tr|en)\/?$/.test(pathname);
}

/** `https://host[:port]` of a URL, or null when it is blank or unparsable. */
function originOf(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The `images.remotePatterns` entry next.config adds for R2_PUBLIC_HOST, the
 * public bucket's base URL (blog images, TASK-MUU20NSV2TETW): that host, that
 * port only, and only the `blog/` objects under its path. Null when the value
 * is unset or not an http(s) URL. next.config reads it when the config loads —
 * for the standalone build that is `next build`, so the variable must be set
 * at build time as well.
 */
export function publicAssetImagePattern(
  value: string | null | undefined
): { protocol: 'http' | 'https'; hostname: string; port: string; pathname: string } | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return {
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      hostname: url.hostname,
      port: url.port,
      pathname: `${url.pathname.replace(/\/+$/, '')}/blog/**`,
    };
  } catch {
    return null;
  }
}

/**
 * True when R2_PUBLIC_HOST points at this machine (the MinIO of a local or CI
 * e2e run). next.config then sets `images.dangerouslyAllowLocalIP`: Next 16's
 * optimizer refuses an upstream that resolves to a private address, so the
 * uploaded blog covers rendered through `next/image` showed broken
 * (TASK-MUU20XFIXZKTE). A deployment's public bucket is never on loopback, so
 * there the guard stays on.
 */
export function publicAssetHostIsLoopback(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const host = new URL(value.trim()).hostname;
    return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

/** R2 account ids are 32 hex chars; anything else must not reach a header. */
function r2UploadOrigin(accountId: string | null | undefined): string | null {
  const id = accountId?.trim();
  return id && /^[a-z0-9]{1,64}$/i.test(id) ? `https://${id}.r2.cloudflarestorage.com` : null;
}

/** R2_ENDPOINT origin — S3-compatible endpoint (MinIO, etc.). HTTPS always safe; HTTP only for loopback. */
function r2EndpointOrigin(endpoint: string | null | undefined): string | null {
  if (!endpoint?.trim()) return null;
  try {
    const url = new URL(endpoint.trim());
    if (url.protocol === 'https:') return url.origin;
    if (url.protocol === 'http:') {
      // Node.js URL.hostname returns IPv6 with brackets [::1], strip them for comparison
      const host = url.hostname.toLowerCase().replace(/[\[\]]/g, '');
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return url.origin;
      // allow http for loopback; reject remote http
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(opts: CspOptions): string {
  const posthog = originOf(opts.posthogHost);
  const r2Upload = r2UploadOrigin(opts.r2AccountId);
  const r2Public = originOf(opts.r2PublicHost);
  const r2Ep = r2EndpointOrigin(opts.r2Endpoint);
  const extra = (...values: Array<string | null>) => values.filter((v): v is string => !!v);

  const cordis = opts.cordisWidget ? [CORDIS_WIDGET_SOURCE] : [];

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      ["'self'", `'nonce-${opts.nonce}'`, "'strict-dynamic'", ...(opts.isDev ? ["'unsafe-eval'"] : [])],
    ],
    ['style-src', ["'self'", "'unsafe-inline'", ...cordis]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', ...extra(r2Public), ...cordis]],
    ['font-src', ["'self'", 'data:', ...cordis]],
    // `next dev` HMR runs over a websocket to this origin; ws: is not covered by 'self' everywhere.
    ['connect-src', ["'self'", ...extra(posthog, r2Upload, r2Ep), ...(opts.isDev ? ['ws:', 'wss:'] : [])]],
    ['media-src', ["'self'", 'blob:']],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['frame-src', [opts.cordisWidgetHost ? "'self'" : "'none'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'", 'https://accounts.google.com']],
    ['frame-ancestors', [opts.cordisWidget ? "'self'" : "'none'"]],
    ['report-uri', [CSP_REPORT_PATH]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

/** Options from the runtime environment (the proxy runs on the Node runtime). */
export function cspOptionsFromEnv(nonce: string, env: NodeJS.ProcessEnv = process.env): CspOptions {
  const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return {
    nonce,
    isDev: env.NODE_ENV === 'development',
    posthogHost: posthogKey ? env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST : null,
    r2AccountId: env.R2_ACCOUNT_ID,
    r2PublicHost: env.R2_PUBLIC_HOST,
    r2Endpoint: env.R2_ENDPOINT,
  };
}

/** `CSP_MODE=report-only` → the Report-Only header name; anything else enforces. */
export function cspHeaderName(env: NodeJS.ProcessEnv = process.env): string {
  return env.CSP_MODE?.trim().toLowerCase() === 'report-only'
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';
}

/** 128 random bits, base64. Web Crypto — available on both Node and edge runtimes. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
