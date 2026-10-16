import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { invitationMailBaseUrl } from '@/lib/email/invitation-mail-policy';
import { verifiedRedirectPath } from '@/lib/expert-prereg/server/constants';
import { verifyExpertPreRegistration } from '@/lib/expert-prereg/server/verify';
import { logger } from '@/lib/logger';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — GET /api/expert-preregistration/verify?token=…
 * The link in the verification mail. Always answers with a redirect to the
 * result page: `?n=<founderNumber|yok>` on success, `?error=expired|invalid`
 * otherwise. The token is never echoed back.
 */
export async function GET(req: NextRequest) {
  try {
    const result = await verifyExpertPreRegistration(req.nextUrl.searchParams.get('token'));
    const path = verifiedRedirectPath(
      result.locale,
      result.ok ? { founderNumber: result.founderNumber } : { error: result.error }
    );
    const origin = invitationMailBaseUrl() ?? req.nextUrl.origin;
    return NextResponse.redirect(new URL(path, origin));
  } catch (error) {
    logger.error('expert pre-registration verify failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
