import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { invitationMailBaseUrl } from '@/lib/email/invitation-mail-policy';
import { authSecret } from '@/lib/env';
import { verifiedRedirectPath } from '@/lib/expert-prereg/server/verified-outcome';
import { verifyExpertPreRegistration } from '@/lib/expert-prereg/server/verify';
import { logger } from '@/lib/logger';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — GET /api/expert-preregistration/verify?token=…
 * The link in the verification mail. Always answers with a redirect to the
 * result page with one signed `?r=` (FO-29, verified-outcome.ts): the page
 * shows a founder number only for a value this route signed. The token is
 * never echoed back.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = authSecret();
    if (!secret) throw new Error('AUTH_SECRET is not set');
    const result = await verifyExpertPreRegistration(req.nextUrl.searchParams.get('token'));
    const path = verifiedRedirectPath(
      result.locale,
      result.ok ? { outcome: 'ok', founderNumber: result.founderNumber } : { outcome: result.error, founderNumber: null },
      { secret }
    );
    const origin = invitationMailBaseUrl() ?? req.nextUrl.origin;
    return NextResponse.redirect(new URL(path, origin));
  } catch (error) {
    logger.error('expert pre-registration verify failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
