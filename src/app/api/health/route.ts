/**
 * Liveness probe for the host and for uptime monitoring (FO-260, nexagrant.com on
 * Hostinger Cloud hosting). It answers 200 when the Next server process is up and
 * serving requests. It reads no session, no database and no environment value, so
 * it can neither leak configuration nor turn a slow database into a restart loop.
 * Rollback: delete this file.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
