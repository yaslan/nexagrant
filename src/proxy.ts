import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import {routing} from './i18n/routing';
import {
  buildContentSecurityPolicy,
  cspHeaderName,
  cspOptionsFromEnv,
  generateNonce,
} from './lib/security-headers';

const handleIntl = createMiddleware(routing);

/**
 * A path next-intl must not touch: no locale prefix and a dot in it (`/foo.bar`,
 * `/.well-known/x`). The matcher used to skip every dotted path, so these were
 * never locale-redirected — and their 404 page went out with no CSP at all
 * (İNCELEME-57 Y-1). They now come through the proxy for the policy only.
 */
function isLocalelessDottedPath(pathname: string): boolean {
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
  const csp = buildContentSecurityPolicy(cspOptionsFromEnv(nonce));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = isLocalelessDottedPath(request.nextUrl.pathname)
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : handleIntl(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set(cspHeaderName(), csp);
  return response;
}

export default proxy;

/**
 * Where the proxy runs. Pinned by src/lib/security-headers.test.ts through Next's
 * own matcher compiler (İNCELEME-57 Y-2): a matcher that stops covering pages
 * leaves them without a CSP and nothing else notices.
 *
 * Left out: `/api` (gets `API_CONTENT_SECURITY_POLICY` from next.config), Next's
 * internals, and file extensions that are only ever static files — everything in
 * public/ and the favicon. Those need no policy and should not pay for a proxy
 * call. Any other dotted path (`/foo.bar`) is matched, so its 404 has a CSP.
 */
export const config = {
  matcher: [
    '/',
    '/(tr|en)/:path*',
    '/((?!api|_next|_vercel|.*\\.(?:ico|png|jpe?g|gif|webp|avif|svg|txt|xml|webmanifest|woff2?|ttf|css|js|map)$).*)'
  ]
};
