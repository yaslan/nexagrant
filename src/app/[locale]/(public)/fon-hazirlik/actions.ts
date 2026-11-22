'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { clientIpFrom, submitPublicLead, type PublicLeadResult } from '@/lib/leads/public-lead';
import { transferOrgNameFor } from '@/lib/leads/transfer-org';
import { forwardPublicLeadToPipeline } from '@/lib/ports/lead-intake';

/**
 * The readiness result screen's contact form (TASK-MULR765AR5G0C). Anonymous by
 * design: no session is read. Validation, the honeypot, the rate limits and the
 * write all live in src/lib/leads/public-lead.ts; this only adds the client IP and the
 * client-pipeline bridge (NG-212): a lead whose transfer consent was recorded is handed to M18
 * after its write committed, through the composition root in src/lib/ports/lead-intake.ts.
 */
export async function submitReadinessLead(input: unknown): Promise<PublicLeadResult> {
  const ip = clientIpFrom(await headers());
  return submitPublicLead(input, { ip, forwardLead: forwardPublicLeadToPipeline });
}

const transferOrgInput = z.object({ province: z.string().max(40) });

/**
 * NG-179 — the organisation NAME under the transfer box for the chosen province; null hides
 * the box. Returns the name only, never the tenant id. Any failure fails closed (no box).
 */
export async function getTransferOrgName(input: unknown): Promise<{ name: string | null }> {
  const parsed = transferOrgInput.safeParse(input);
  if (!parsed.success) return { name: null };
  try {
    return { name: await transferOrgNameFor(parsed.data.province) };
  } catch {
    return { name: null };
  }
}
