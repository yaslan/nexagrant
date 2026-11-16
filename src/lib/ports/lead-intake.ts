import { forwardPublicLead, type PublicLeadForwardResult } from '@/lib/leads/public-lead-intake';

/**
 * Composition root of the lead intake contract (NG-138 / NG-212): the one place that knows M18
 * implements `LeadIntakePort` (src/core/contracts/lead-intake.ts), so src/lib/leads never imports
 * M18 (CLAUDE.md "Mimari kurallar" 2; same pattern as ./deal-brief-context.ts). The M18 code is
 * loaded on first use only.
 *
 * Runs the NG-138 bridge for one stored `PublicLead`: the consent gate, the province map, the
 * consented-recipient check and the claim all stay in forwardPublicLead.
 */
export async function forwardPublicLeadToPipeline(publicLeadId: string): Promise<PublicLeadForwardResult> {
  const { createLeadIntakePort } = await import('@/modules/m18/server/intake-repo');
  return forwardPublicLead(publicLeadId, createLeadIntakePort());
}
