'use server';

import { headers } from 'next/headers';
import { clientIpFrom, submitPublicLead, type PublicLeadResult } from '@/lib/leads/public-lead';

/**
 * The readiness result screen's contact form (TASK-MULR765AR5G0C). Anonymous by
 * design: no session is read. Validation, the honeypot, the rate limits and the
 * write all live in src/lib/leads/public-lead.ts; this only adds the client IP.
 */
export async function submitReadinessLead(input: unknown): Promise<PublicLeadResult> {
  const ip = clientIpFrom(await headers());
  return submitPublicLead(input, { ip });
}
