/**
 * Deal brief context contract (NG-136 / M18-F5).
 *
 * What the client pipeline (M18) hands to the meeting brief (M9) about one deal, so the brief can
 * be written with the client in mind. M18 produces it (`src/modules/m18/server/deal-brief-context.ts`),
 * M9 consumes it; neither imports the other (CLAUDE.md "Mimari kurallar" 2). The composition root
 * is `src/lib/ports/deal-brief-context.ts`.
 *
 * Rules that live in the contract, not in either side:
 *  - no personal data: organisation and deal facts only, never a contact's name, e-mail or phone;
 *  - only an APPROVED eligibility pre-report crosses (a DRAFT never leaves M18), and it is still an
 *    internal pre-assessment, so it is passed with that label and is never called a score.
 */

export interface DealBriefContext {
  dealTitle: string;
  dealStage: string;
  organization: {
    name: string;
    orgType: string | null;
    provinceCode: string | null;
    sizeBand: string | null;
    themes: string[];
  };
  call: { callIdentifier: string; title: string } | null;
  /** The newest APPROVED eligibility pre-report for this organisation (and the deal's call, if any). */
  approvedEligibility: { approvedAt: Date; summary: string } | null;
}

export interface DealBriefContextPort {
  /** Null when the deal is not this tenant's, or is deleted. */
  forDeal(tenantId: string, dealId: string): Promise<DealBriefContext | null>;
}

/** Characters of an approved pre-report that travel; the brief needs the gist, not the whole text. */
export const DEAL_BRIEF_ELIGIBILITY_MAX_CHARS = 1_500;

/**
 * The context as plain text for a prompt's data field. English keys (the prompt reads them in any
 * locale); values are the tenant's own data and travel only inside `separatedPrompt`'s data fence.
 */
export function formatDealBriefContext(ctx: DealBriefContext): string {
  const lines = [
    `deal: ${ctx.dealTitle} (stage: ${ctx.dealStage})`,
    `client organisation: ${ctx.organization.name}`,
    `organisation type: ${ctx.organization.orgType ?? '-'}`,
    `province code: ${ctx.organization.provinceCode ?? '-'}`,
    `size band: ${ctx.organization.sizeBand ?? '-'}`,
    `themes: ${ctx.organization.themes.join(', ') || '-'}`,
    `call: ${ctx.call ? `${ctx.call.callIdentifier} — ${ctx.call.title}` : '-'}`,
  ];
  if (ctx.approvedEligibility) {
    lines.push(
      `internal eligibility pre-assessment (approved ${ctx.approvedEligibility.approvedAt.toISOString().slice(0, 10)}; not an official evaluation):`,
      ctx.approvedEligibility.summary.slice(0, DEAL_BRIEF_ELIGIBILITY_MAX_CHARS),
    );
  }
  return lines.join('\n');
}
