import type { LeadIntakePort, LeadIntakeRequest, LeadIntakeResult } from '@/core/contracts/lead-intake';
import { LEAD_INTAKE_CONSENT_DOCUMENT_ID } from '@/core/contracts/lead-intake';
import type { UnmatchedReason } from '@/core/contracts/lead-routing';
import { prisma } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
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
  | { status: 'skipped'; reason: 'transfer_consent_off' | 'not_found' | 'already_routed' }
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

/**
 * NG-174 (SEC NG-170 Y-1) — a PublicLead is handed to AT MOST ONE tenant.
 *
 * The target is claimed BEFORE the port is called, with one conditional UPDATE (the row lock makes two
 * parallel calls serialise: the loser sees count 0). A claimed lead reads `routeStatus = 'routed'` +
 * `routedTenantId`; from then on the only thing a repeat call may do is re-ask the SAME tenant (M18
 * answers `duplicate`, so a crash between claim and port is healed). A different target is never tried.
 */
async function claimRoute(db: typeof prisma, publicLeadId: string, tenantId: string): Promise<boolean> {
  // An undefined key would make Prisma drop the filter and claim EVERY lead (where-guard-src).
  const leadId = requireActionId(publicLeadId, 'publicLeadId');
  const claimed = await withSystemScopeOn(db, 'cross-tenant-job', 'public-lead-intake.claim', (tx) =>
    tx.publicLead.updateMany({
      where: { id: leadId, routedTenantId: null, OR: [{ routeStatus: null }, { routeStatus: { not: 'routed' } }] },
      data: { routeStatus: 'routed', routeReason: null, routedTenantId: tenantId, routedAt: new Date() },
    })
  );
  return claimed.count === 1;
}

/**
 * Records an 'unmatched' outcome. Never overwrites a lead that is already routed (the claim wins):
 * a mapping that went away or a deleted tenant leaves `routedTenantId` as the audit trail.
 */
async function markUnmatched(db: typeof prisma, publicLeadId: string, reason: UnmatchedReason): Promise<void> {
  const leadId = requireActionId(publicLeadId, 'publicLeadId');
  await withSystemScopeOn(db, 'cross-tenant-job', 'public-lead-intake.mark', (tx) =>
    tx.publicLead.updateMany({
      where: { id: leadId, routedTenantId: null, OR: [{ routeStatus: null }, { routeStatus: { not: 'routed' } }] },
      data: { routeStatus: 'unmatched', routeReason: reason, routedTenantId: null, routedAt: new Date() },
    })
  );
}

/** Gives the claim back (M18 refused the tenant, or the call failed), only if THIS target still holds it. */
async function releaseClaim(db: typeof prisma, publicLeadId: string, tenantId: string, reason: UnmatchedReason | null): Promise<void> {
  const leadId = requireActionId(publicLeadId, 'publicLeadId');
  const owner = requireActionId(tenantId, 'tenantId');
  await withSystemScopeOn(db, 'cross-tenant-job', 'public-lead-intake.release', (tx) =>
    tx.publicLead.updateMany({
      where: { id: leadId, routeStatus: 'routed', routedTenantId: owner },
      data: reason
        ? { routeStatus: 'unmatched', routeReason: reason, routedTenantId: null, routedAt: new Date() }
        : { routeStatus: null, routeReason: null, routedTenantId: null, routedAt: null },
    })
  );
}

/**
 * Reads the lead (platform data, system scope), picks the target tenant from the province map
 * (NG-167) and hands it to M18 when the consent gate is open.
 *
 *  - no transfer consent            → `skipped/transfer_consent_off`, nothing written anywhere;
 *  - already routed (NG-174)        → never a second tenant: same target → idempotent re-ask of that
 *                                     tenant only; any other target (map moved, mapping gone, tenant
 *                                     deleted) → `skipped/already_routed`, port NOT called, row untouched;
 *  - consent + province mapped      → target claimed atomically, then port.accept(...);
 *  - consent + province empty/unmapped, or the mapped tenant refuses → port NOT called (or its
 *    refusal kept), lead marked 'unmatched' for the platform-admin worklist. No default tenant.
 * Safe to call again for an unmatched lead after the map changed (M18 answers `duplicate` if it already landed).
 * Re-routing a routed lead (new recipient) is deliberately NOT done: it may need a new consent (open product/legal call).
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
        locale: true, createdAt: true, routeStatus: true, routedTenantId: true,
      },
    });
    if (!found) return { lead: null, decision: null };
    return { lead: found, decision: hasTransferConsent(found) ? await resolveLeadRoute(tx, found.province) : null };
  });
  if (!lead) return { status: 'skipped', reason: 'not_found' };
  if (!decision) return { status: 'skipped', reason: 'transfer_consent_off' };

  const alreadyRouted = lead.routeStatus === 'routed' || lead.routedTenantId !== null;
  if (alreadyRouted) return reAskOwner(lead, lead.routedTenantId, decision, port);

  if (!decision.match) {
    await markUnmatched(db, lead.id, decision.reason);
    return { status: 'skipped', reason: 'unmatched', unmatchedReason: decision.reason };
  }
  const request = buildIntakeRequest(lead, decision.tenantId);
  if (!request) return { status: 'skipped', reason: 'transfer_consent_off' };

  if (!(await claimRoute(db, lead.id, decision.tenantId))) {
    // Lost the race (or it was routed between our read and the claim): re-read, never go to another tenant.
    const owner = await withSystemScopeOn(db, 'cross-tenant-job', 'public-lead-intake.reread', (tx) =>
      tx.publicLead.findUnique({ where: { id: lead.id }, select: { routedTenantId: true } })
    );
    return reAskOwner(lead, owner?.routedTenantId ?? null, decision, port);
  }
  let result: LeadIntakeResult;
  try {
    result = await port.accept(request);
  } catch (err) {
    await releaseClaim(db, lead.id, decision.tenantId, null);
    throw err;
  }
  if (result.status === 'refused' && (result.reason === 'tenant_not_found' || result.reason === 'tenant_ineligible')) {
    await releaseClaim(db, lead.id, decision.tenantId, 'tenant_refused');
  } else if (result.status === 'refused') {
    await releaseClaim(db, lead.id, decision.tenantId, null);
  }
  return result;
}

/** The lead belongs to `ownerTenantId` already. Only that tenant may be asked again; nothing is written. */
async function reAskOwner(
  lead: PublicLeadForIntake,
  ownerTenantId: string | null,
  decision: { match: boolean; tenantId?: string },
  port: LeadIntakePort
): Promise<PublicLeadForwardResult> {
  if (!ownerTenantId || !decision.match || decision.tenantId !== ownerTenantId) return { status: 'skipped', reason: 'already_routed' };
  const request = buildIntakeRequest(lead, ownerTenantId);
  if (!request) return { status: 'skipped', reason: 'transfer_consent_off' };
  return port.accept(request);
}
