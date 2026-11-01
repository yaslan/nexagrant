import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import {routing} from './i18n/routing';
import {
  buildContentSecurityPolicy,
  cspHeaderName,
  cordisSandboxPolicy,
  cspOptionsFromEnv,
  generateNonce,
  isCordisWidgetHostPath,
  isCordisWidgetPath,
} from './lib/security-headers';

const handleIntl = createMiddleware(routing);

/**
 * A path next-intl must not touch: no locale prefix and a dot in it (`/foo.bar`,
 * `/.well-known/x`). The matcher used to skip every dotted path, so these were
 * never locale-redirected — and their 404 page went out with no CSP at all
 * (İNCELEME-57 Y-1). They now come through the proxy for the policy only.
 * So does anything under `/_next` or `/_vercel` in any case (`/_next/Image`,
 * `/_NEXT/x`, İNCELEME-98 Y-1): Next's internals, never a page to redirect to.
 */
function isPolicyOnlyPath(pathname: string): boolean {
  if (/^\/_(?:next|vercel)(?:\/|$)/i.test(pathname)) return true;
  return pathname.includes('.') && !/^\/(tr|en)(\/|$)/.test(pathname);
}

/**
 * next-intl routing + a per-request nonce CSP (TASK-MUN80T8IVTPM7).
 *
 * The policy goes on the *request* as well as the response: Next.js reads the nonce
 * from the request's `Content-Security-Policy` header and puts it on the scripts it
 * renders. next-intl copies the request headers into its `NextResponse.next/rewrite`,
 * so handing it a request that already carries them is enough. Why each directive is
 * there: src/lib/security-headers.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const cordisWidget = isCordisWidgetPath(request.nextUrl.pathname);
  const csp = buildContentSecurityPolicy({
    ...cspOptionsFromEnv(nonce),
    cordisWidget,
    cordisWidgetHost: isCordisWidgetHostPath(request.nextUrl.pathname),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = isPolicyOnlyPath(request.nextUrl.pathname)
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : handleIntl(new NextRequest(request, { headers: requestHeaders }));
  const headerName = cspHeaderName();
  response.headers.set(headerName, csp);
  // A report-only `sandbox` is not enforced: the embed also gets an enforced sandbox-only policy.
  if (cordisWidget && headerName !== 'Content-Security-Policy') {
    response.headers.append('Content-Security-Policy', cordisSandboxPolicy());
  }
  return response;
}

export default proxy;

/**
 * Where the proxy runs. Pinned by src/lib/security-headers.test.ts through Next's
 * own matcher compiler (İNCELEME-57 Y-2): a matcher that stops covering pages
 * leaves them without a CSP and nothing else notices.
 *
 * Left out: `/api/*` (gets `API_CONTENT_SECURITY_POLICY` from next.config), Next's
 * internals, and file extensions that are only ever static files — everything in
 * public/ and the favicon. Those need no nonce and should not pay for a proxy
 * call; when no file is behind one, next.config gives the 404 the static
 * `STATIC_FILE_CONTENT_SECURITY_POLICY`. The extension list is
 * `STATIC_FILE_EXTENSIONS` — Next wants a literal here, the test keeps them equal.
 * Any other dotted path (`/foo.bar`) is matched, so its 404 has a CSP.
 *
 * `api`, `_next` and `_vercel` are whole segments (İNCELEME-78 Y-1): without the
 * `(?:/|$)`, `/apifoo`, `/api-docs` and `/_nextfoo` were skipped too.
 *
 * Case (İNCELEME-98 Y-1). This matcher is case-sensitive; next.config header
 * sources are not, so the static rule's real-file exceptions (`/logo.png`,
 * `/_next/static/`, `/_next/image`) also leave out `/Logo.png`, `/Favicon.ico`,
 * `/_next/Image` and `/_NEXT/static/x.js` — no file answers those, and Next's app
 * 404 went out with no CSP. Only this side can tell the cases apart, so it skips a
 * static-file path or a `/_next/…` path only when it is plain lowercase ASCII
 * (`[-a-z0-9_./]`), which every served file is (the test checks public/). Anything
 * else — an upper-case letter, `%`, non-ASCII (`ı` folds to `I` under /i) — runs
 * the proxy and gets the nonce policy. `/_next/static/` is the one exception:
 * build chunk names carry upper case, and a missing chunk there is a plain-text 404.
 */
export const config = {
  matcher: [
    '/',
    '/(tr|en)/:path*',
    '/((?!api(?:/|$)|_vercel(?:/|$)|_next/static/|_next(?:/[-a-z0-9_./]*)?$|[-a-z0-9_./]*\\.(?:ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map)$).*)'
  ]
};
