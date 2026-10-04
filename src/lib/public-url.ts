import { NextRequest } from 'next/server';

/**
 * Build a safe origin URL for redirects behind a proxy (e.g., Passenger).
 *
 * When behind Passenger/LiteSpeed, req.url is rewritten to http://localhost:3000/...
 * making `new URL(path, req.url)` produce a localhost-based redirect. This helper
 * uses AUTH_URL (NextAuth.js standard for proxy environments) to pin the public origin,
 * falling back to NEXT_PUBLIC_APP_URL for production compatibility, or extracting the
 * origin from req.url when both env vars are unset.
 *
 * Open-redirect safe: returns only the origin (scheme + host + port), no path/query.
 */
export function publicUrl(req?: NextRequest): string {
  // AUTH_URL: NextAuth.js standard when behind a proxy (see .env.example line 42)
  if (process.env.AUTH_URL) {
    try {
      const url = new URL(process.env.AUTH_URL);
      return url.origin;
    } catch {
      // Invalid AUTH_URL — fall through
    }
  }

  // Fallback to NEXT_PUBLIC_APP_URL for development/production without AUTH_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_APP_URL);
      return url.origin;
    } catch {
      // Invalid NEXT_PUBLIC_APP_URL — fall through
    }
  }

  // Fallback to origin from request URL if available
  if (req?.url) {
    try {
      const url = new URL(req.url);
      return url.origin;
    } catch {
      // Invalid request URL — fall through
    }
  }

  // Last resort: localhost (development with no env vars and no req)
  return 'http://localhost:3000';
}
