import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { clientIpFrom } from '@/lib/leads/public-lead';
import { logger } from '@/lib/logger';
import { registerExpertPreRegistration } from '@/lib/expert-prereg/server/register';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — POST /api/expert-preregistration. Public, no
 * session. 201 `{ok:true}` · 400 `{errors:{field:code}}` · 409
 * `{errors:{email:'already_registered'}}` · 429 · 503 when the mail cannot go out.
 */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  try {
    const result = await registerExpertPreRegistration(body, {
      ip: clientIpFrom(req.headers),
      salt: env.EXPERT_PREREG_IP_SALT ?? null,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    logger.error('expert pre-registration failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
