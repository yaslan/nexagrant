import type { LeadIntakePort, LeadIntakeRequest, LeadIntakeResult } from '@/core/contracts/lead-intake';
import { LEAD_INTAKE_CONSENT_DOCUMENT_ID } from '@/core/contracts/lead-intake';
import { prisma } from '@/lib/db';
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
 * Which tenant receives it and which advisor owns it are open product decisions: the caller
 * names the tenant explicitly and nothing here assigns an owner (the lead lands unassigned).
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

export type PublicLeadForwardResult = LeadIntakeResult | { status: 'skipped'; reason: 'transfer_consent_off' | 'not_found' };

/** Null when the gate is shut. Pure. */
export function buildIntakeRequest(lead: PublicLeadForIntake, targetTenantId: string): LeadIntakeRequest | null {
  if (lead.transferConsent !== true || !lead.transferConsentVersion || !lead.transferConsentAt) return null;
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

/** Reads the lead (platform data, system scope) and hands it to M18 when the gate is open. */
export async function forwardPublicLead(
  publicLeadId: string,
  targetTenantId: string,
  port: LeadIntakePort,
  db: typeof prisma = prisma
): Promise<PublicLeadForwardResult> {
  const lead = await withSystemScopeOn(
    db,
    'cross-tenant-job',
    'public-lead-intake.read',
    (tx) =>
      tx.publicLead.findUnique({
        where: { id: publicLeadId },
        select: {
          id: true, name: true, email: true, organisation: true, province: true, district: true,
          readinessCode: true, transferConsent: true, transferConsentVersion: true, transferConsentAt: true,
          locale: true, createdAt: true,
        },
      })
  );
  if (!lead) return { status: 'skipped', reason: 'not_found' };
  const request = buildIntakeRequest(lead, targetTenantId);
  if (!request) return { status: 'skipped', reason: 'transfer_consent_off' };
  return port.accept(request);
}
