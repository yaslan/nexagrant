import { forwardPublicLead, type PublicLeadForwardResult } from '@/lib/leads/public-lead-intake';

/**
 * Composition root of the lead intake contract (NG-138 / NG-212): the one place that knows M18
 * implements `LeadIntakePort` (src/core/contracts/lead-intake.ts), so src/lib/leads/public-lead.ts
 * (the form's write) never imports M18 (CLAUDE.md "Mimari kurallar" 2; same pattern as
 * ./deal-brief-context.ts). Only the port implementation (`@/modules/m18/server/intake-repo`) is
 * loaded on first use. M18 is NOT kept out of the form's module graph: the static import below pulls
 * public-lead-intake → province-route → `@/modules/m18/server/intake` (`isIntakeTarget`, NG-167) in
 * as soon as this file loads.
 *
 * Runs the NG-138 bridge for one stored `PublicLead`: the consent gate, the province map, the
 * consented-recipient check and the claim all stay in forwardPublicLead.
 */
export async function forwardPublicLeadToPipeline(publicLeadId: string): Promise<PublicLeadForwardResult> {
  const { createLeadIntakePort } = await import('@/modules/m18/server/intake-repo');
  return forwardPublicLead(publicLeadId, createLeadIntakePort());
}
