import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';
 
const handleProxy = createMiddleware(routing);

export const proxy = handleProxy;
export default handleProxy;

export const config = {
  matcher: [
    '/',
    '/(tr|en)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
