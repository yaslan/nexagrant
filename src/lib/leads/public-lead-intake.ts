import type { LeadIntakePort, LeadIntakeRequest, LeadIntakeResult } from '@/core/contracts/lead-intake';
import { LEAD_INTAKE_CONSENT_DOCUMENT_ID } from '@/core/contracts/lead-intake';
import type { UnmatchedReason } from '@/core/contracts/lead-routing';
import { prisma } from '@/lib/db';
import { resolveLeadRoute } from '@/lib/leads/province-route';
import { withSystemScopeOn } from '@/lib/system-scope';
import { READINESS_ORG_TYPES, scoreReadiness } from '@/lib/readiness/score';
import { decodeReadinessCode } from '@/lib/readiness/share';

/**
 * NG-138 (M18-F4) — the PRODUCER half of the readiness → M18 bridge: turns one stored
 * `PublicLead` into a {@link LeadIntakeRequest}. It talks to M18 only through the
 * `LeadIntakePort` it is handed (src/core/contracts/lead-intake.ts), never by importing it.
 *
 * Consent gate: a lead is forwarded only when `transferConsent` is literally true AND the
 * version and time were recorded. The form's own consent never counts. With the gate shut
 * the port is not called at all, so no row of any kind is created.
 *
 * Which tenant receives it comes from the platform-admin province map (NG-167, ProvinceLeadRoute):
 * no mapping means no transfer and the lead is marked 'unmatched'. Which advisor owns it is still an
 * open product decision: nothing here assigns an owner (the lead lands unassigned).
 * Nothing here logs a name, address or organisation.
 */

export interface PublicLeadForIntake {
  id: string;
  name: string;
  email: string;
  organisation: string;
  province: string | null;
  district: string | null;
  readinessCode: string | null;
  transferConsent: boolean;
  transferConsentVersion: string | null;
  transferConsentAt: Date | null;
  locale: string;
  createdAt: Date;
}

export type PublicLeadForwardResult =
  | LeadIntakeResult
  | { status: 'skipped'; reason: 'transfer_consent_off' | 'not_found' }
  /** Consent given but no target: province empty / unmapped. Marked for the platform-admin worklist. */
  | { status: 'skipped'; reason: 'unmatched'; unmatchedReason: UnmatchedReason };

/** The consent gate: literally true AND the version and time were recorded. Pure. */
export function hasTransferConsent(
  lead: Pick<PublicLeadForIntake, 'transferConsent' | 'transferConsentVersion' | 'transferConsentAt'>
): boolean {
  return lead.transferConsent === true && Boolean(lead.transferConsentVersion) && Boolean(lead.transferConsentAt);
}

/** Null when the gate is shut. Pure. */
export function buildIntakeRequest(lead: PublicLeadForIntake, targetTenantId: string): LeadIntakeRequest | null {
  if (!hasTransferConsent(lead) || !lead.transferConsentVersion || !lead.transferConsentAt) return null;
  const decoded = lead.readinessCode ? decodeReadinessCode(lead.readinessCode, READINESS_ORG_TYPES) : null;
  const score = decoded ? scoreReadiness(decoded.answers, decoded.orgType) : null;
  return {
    publicLeadId: lead.id,
    targetTenantId,
    contact: { fullName: lead.name, email: lead.email },
    organisation: { name: lead.organisation, province: lead.province, district: lead.district },
    // total/level are recomputed here, never trusted from the stored columns.
    readiness: score && lead.readinessCode ? { code: lead.readinessCode, total: score.total0to100, level: score.level } : null,
    consent: {
      documentId: LEAD_INTAKE_CONSENT_DOCUMENT_ID,
      documentVersion: lead.transferConsentVersion,
      grantedAt: lead.transferConsentAt,
      locale: lead.locale === 'en' ? 'en' : 'tr',
    },
    receivedAt: lead.createdAt,
  };
}

/** Records the routing outcome on the lead (platform data, system scope). */
async function markRoute(
  db: typeof prisma,
  publicLeadId: string,
  mark: { status: 'routed'; tenantId: string } | { status: 'unmatched'; reason: UnmatchedReason }
): Promise<void> {
  await withSystemScopeOn(db, 'cross-tenant-job', 'public-lead-intake.mark', (tx) =>
    tx.publicLead.update({
      where: { id: publicLeadId },
      data:
        mark.status === 'routed'
          ? { routeStatus: 'routed', routeReason: null, routedTenantId: mark.tenantId, routedAt: new Date() }
          : { routeStatus: 'unmatched', routeReason: mark.reason, routedTenantId: null, routedAt: new Date() },
      select: { id: true },
    })
  );
}

/**
 * Reads the lead (platform data, system scope), picks the target tenant from the province map
 * (NG-167) and hands it to M18 when the consent gate is open.
 *
 *  - no transfer consent            → `skipped/transfer_consent_off`, nothing written anywhere;
 *  - consent + province mapped      → port.accept(...) for that tenant, lead marked 'routed';
 *  - consent + province empty/unmapped, or the mapped tenant refuses → port NOT called (or its
 *    refusal kept), lead marked 'unmatched' for the platform-admin worklist. No default tenant.
 * Safe to call again for an unmatched lead after the map changed (M18 answers `duplicate` if it already landed).
 */
export async function forwardPublicLead(
  publicLeadId: string,
  port: LeadIntakePort,
  db: typeof prisma = prisma
): Promise<PublicLeadForwardResult> {
  const { lead, decision } = await withSystemScopeOn(db, 'cross-tenant-job', 'public-lead-intake.read', async (tx) => {
    const found = await tx.publicLead.findUnique({
      where: { id: publicLeadId },
      select: {
        id: true, name: true, email: true, organisation: true, province: true, district: true,
        readinessCode: true, transferConsent: true, transferConsentVersion: true, transferConsentAt: true,
        locale: true, createdAt: true,
      },
    });
    if (!found) return { lead: null, decision: null };
    return { lead: found, decision: hasTransferConsent(found) ? await resolveLeadRoute(tx, found.province) : null };
  });
  if (!lead) return { status: 'skipped', reason: 'not_found' };
  if (!decision) return { status: 'skipped', reason: 'transfer_consent_off' };
  if (!decision.match) {
    await markRoute(db, lead.id, { status: 'unmatched', reason: decision.reason });
    return { status: 'skipped', reason: 'unmatched', unmatchedReason: decision.reason };
  }
  const request = buildIntakeRequest(lead, decision.tenantId);
  if (!request) return { status: 'skipped', reason: 'transfer_consent_off' };
  const result = await port.accept(request);
  if (result.status === 'created' || result.status === 'duplicate') {
    await markRoute(db, lead.id, { status: 'routed', tenantId: decision.tenantId });
  } else if (result.reason === 'tenant_not_found' || result.reason === 'tenant_ineligible') {
    await markRoute(db, lead.id, { status: 'unmatched', reason: 'tenant_refused' });
  }
  return result;
}
