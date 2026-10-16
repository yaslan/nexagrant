import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { clientIpFrom } from '@/lib/leads/public-lead';
import { logger } from '@/lib/logger';
import { registerExpertPreRegistration } from '@/lib/expert-prereg/server/register';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — POST /api/expert-preregistration. Public, no
 * session. 201 `{ok:true}` · 400 `{errors:{field:code}}` · 409
 * `{errors:{email:'already_registered'}}` · 429 · 5xx through internalError()
 * with a fixed code when the mail cannot go out.
 */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  try {
    // No salt here: register.ts resolves it (EXPERT_PREREG_IP_SALT, else the AUTH_SECRET-derived key).
    const result = await registerExpertPreRegistration(body, { ip: clientIpFrom(req.headers) });
    if (result.kind === 'created') return NextResponse.json({ ok: true }, { status: 201 });
    if (result.kind === 'invalid') return NextResponse.json({ errors: result.errors }, { status: 400 });
    if (result.kind === 'duplicate') {
      return NextResponse.json({ errors: { email: 'already_registered' } }, { status: 409 });
    }
    if (result.kind === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    return internalError({ error: result.error }, { status: result.error === 'server' ? 500 : 503 });
  } catch (error) {
    logger.error('expert pre-registration failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
