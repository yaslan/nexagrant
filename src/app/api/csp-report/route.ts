import { handleCspReport } from '@/lib/csp-report';

/**
 * CSP violation reports — no session, log only, size- and rate-limited.
 * Why and how: src/lib/csp-report.ts.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleCspReport(request);
}
