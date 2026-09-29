import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import {routing} from './i18n/routing';
import { buildContentSecurityPolicy, cspHeaderName, cspOptionsFromEnv, generateNonce } from './lib/security-headers';

const handleIntl = createMiddleware(routing);

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

  const response = handleIntl(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set(cspHeaderName(), csp);
  return response;
}

export default proxy;

export const config = {
  matcher: [
    '/',
    '/(tr|en)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
