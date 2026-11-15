import { withTenant, type TenantTx } from '@/lib/db';
import type { DealBriefContext, DealBriefContextPort } from '@/core/contracts/deal-brief-context';
import { releasableReport } from './eligibility';

/**
 * M18 side of the deal brief context contract (NG-136). Reads organisation and deal facts (no
 * contact data) and only an APPROVED eligibility pre-report; a DRAFT never leaves M18.
 */
export async function loadDealBriefContext(tx: TenantTx, tenantId: string, dealId: string): Promise<DealBriefContext | null> {
  const deal = await tx.deal.findFirst({
    where: { id: dealId, tenantId, deletedAt: null },
    select: {
      title: true,
      stage: true,
      callId: true,
      organizationId: true,
      organization: { select: { name: true, orgType: true, provinceCode: true, sizeBand: true, themes: true, deletedAt: true } },
      call: { select: { callIdentifier: true, title: true } },
    },
  });
  if (!deal || deal.organization.deletedAt) return null;
  // A deal with no call gets no pre-assessment: a report is always about one call (NG-136 review).
  const report = deal.callId ? await releasableReport(tx, tenantId, deal.organizationId, deal.callId) : null;
  const org = deal.organization;
  return {
    dealTitle: deal.title,
    dealStage: deal.stage,
    organization: { name: org.name, orgType: org.orgType, provinceCode: org.provinceCode, sizeBand: org.sizeBand, themes: org.themes },
    call: deal.call,
    approvedEligibility: report?.approvedAt ? { approvedAt: report.approvedAt, summary: report.content } : null,
  };
}

export function createDealBriefContextPort(): DealBriefContextPort {
  return {
    forDeal: (tenantId, dealId) => withTenant(tenantId, (tx) => loadDealBriefContext(tx, tenantId, dealId)),
  };
}
