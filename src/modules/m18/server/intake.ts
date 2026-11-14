import { z } from 'zod';

import {
  LEAD_INTAKE_CONSENT_DOCUMENT_ID,
  type LeadIntakeConsent,
  type LeadIntakeRefusal,
  type LeadIntakeRequest,
} from '@/core/contracts/lead-intake';
import { TR_PROVINCES } from '@/lib/readiness/provinces';

/**
 * NG-138 (M18-F4) — the pure half of the lead intake: who may receive a lead, whether the
 * visitor's consent lets it through, and the shape of the request. No database here; the
 * write is ./intake-repo.ts.
 */

/** The only tenants a readiness lead may be routed to (lead assumption K-NG138). */
export function isIntakeTenant(tenant: { orgType: string; kind: string; deletedAt: Date | null }): boolean {
  if (tenant.deletedAt) return false;
  return tenant.orgType === 'CONSULTANCY' || tenant.kind === 'AGENCY';
}

/**
 * No transfer without the visitor's own consent for it. The readiness form's consent
 * (`public-lead-contact`) is deliberately not accepted here: it does not name a recipient.
 */
export function checkIntakeConsent(consent: LeadIntakeConsent | null): LeadIntakeRefusal | null {
  if (!consent) return 'consent_missing';
  if (consent.documentId !== LEAD_INTAKE_CONSENT_DOCUMENT_ID) return 'consent_wrong_document';
  if (consent.withdrawnAt) return 'consent_withdrawn';
  if (!consent.documentVersion.trim() || Number.isNaN(consent.grantedAt.getTime())) return 'consent_missing';
  return null;
}

const text = (max: number) => z.string().trim().min(1).max(max);

const requestSchema = z.object({
  publicLeadId: text(100),
  targetTenantId: text(100),
  contact: z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().max(254).pipe(z.email()) }),
  organisation: z.object({
    name: z.string().trim().min(2).max(200),
    province: z
      .string()
      .nullable()
      .refine((v) => v === null || (TR_PROVINCES as readonly string[]).includes(v)),
    district: z.string().trim().max(80).nullable(),
  }),
  readiness: z
    .object({ code: text(200), total: z.number().int().min(0).max(100), level: text(40) })
    .nullable(),
  receivedAt: z.date(),
});

/** Shape check of everything except the consent (that has its own, ordered, refusal codes). */
export function parseIntakeRequest(request: LeadIntakeRequest): z.infer<typeof requestSchema> | null {
  const parsed = requestSchema.safeParse(request);
  return parsed.success ? parsed.data : null;
}
