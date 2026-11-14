/**
 * Lead intake contract (NG-138 / M18-F4).
 *
 * What the FonBridge readiness funnel (a visitor who filled the Fon Hazırlık Karnesi and
 * left a contact request, `PublicLead`) hands to a consultancy / agency tenant's client
 * pipeline (M18). The producer builds a {@link LeadIntakeRequest}; M18 consumes it and
 * answers with a {@link LeadIntakeResult}. Neither side imports the other: they only
 * share these shapes (CLAUDE.md "Mimari kurallar" 2).
 *
 * Two rules live in the contract, not in either side:
 *  - no transfer without the person's own, separate consent for it ({@link LEAD_INTAKE_CONSENT_DOCUMENT_ID});
 *  - the person is referenced, never copied twice: the tenant side keeps `publicLeadId`
 *    (as `sourceRef`), the platform side keeps the contact request itself.
 */

/**
 * `Consent.documentId` of the text the visitor accepted for passing the request to a
 * consultancy. NOT the readiness form's own consent (`public-lead-contact`): that text lets
 * the platform contact the visitor and says nothing about a third party receiving the data.
 */
export const LEAD_INTAKE_CONSENT_DOCUMENT_ID = 'lead-intake-transfer';

/** Prefix of the `sourceRef` M18 rows carry; `<prefix><publicLeadId>`. */
export const LEAD_INTAKE_SOURCE_REF_PREFIX = 'public-lead:';

export function leadIntakeSourceRef(publicLeadId: string): string {
  return `${LEAD_INTAKE_SOURCE_REF_PREFIX}${publicLeadId}`;
}

/** The visitor's consent to pass the request to the target tenant. */
export interface LeadIntakeConsent {
  /** Must equal {@link LEAD_INTAKE_CONSENT_DOCUMENT_ID}. */
  documentId: string;
  /** Version of the text that was on screen. */
  documentVersion: string;
  grantedAt: Date;
  /** Language the visitor read it in. */
  locale: 'tr' | 'en';
  /** Set when the visitor withdrew it; a withdrawn consent transfers nothing. */
  withdrawnAt?: Date | null;
}

export interface LeadIntakeRequest {
  /** `PublicLead.id`. */
  publicLeadId: string;
  /** The consultancy / agency tenant that receives the lead. */
  targetTenantId: string;
  contact: { fullName: string; email: string };
  organisation: {
    name: string;
    /** Province in `TR_PROVINCES` spelling, as the form stored it. */
    province: string | null;
    district: string | null;
  };
  /** The scorecard result, recomputed by the platform; null when the visitor sent none. */
  readiness: { code: string; total: number; level: string } | null;
  /** Null = the visitor gave no transfer consent. */
  consent: LeadIntakeConsent | null;
  /** When the contact request was left. */
  receivedAt: Date;
}

export type LeadIntakeRefusal =
  | 'consent_missing'
  | 'consent_withdrawn'
  | 'consent_wrong_document'
  | 'invalid'
  | 'tenant_not_found'
  | 'tenant_ineligible';

export interface LeadIntakeIds {
  organizationId: string;
  contactId: string;
  dealId: string;
  taskId: string;
}

export type LeadIntakeResult =
  | { status: 'created'; ids: LeadIntakeIds }
  /** Same `publicLeadId` already landed in this tenant; nothing was written. */
  | { status: 'duplicate'; ids: LeadIntakeIds }
  | { status: 'refused'; reason: LeadIntakeRefusal };

/** Implemented by M18; callers get it through the module wiring, never by importing M18. */
export interface LeadIntakePort {
  accept(request: LeadIntakeRequest): Promise<LeadIntakeResult>;
}
