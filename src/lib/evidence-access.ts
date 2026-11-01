import { asRole, can, type Action } from '@/lib/rbac';

/**
 * Who may read an evidence row (Y-1, TASK-MUNTTZ94LJWBC, İNCELEME-66).
 *
 * The list and the download used to ask only for a tenant session, so the
 * external partner (GUEST_PARTNER, no `view_proposal`) listed and downloaded
 * every document of the tenant, and `confidentiality` was a label nothing
 * enforced. Now:
 *
 *   - reading any evidence needs `view_proposal`;
 *   - a document above the open levels needs `edit_proposal` as well, so a
 *     MEMBER sees the INTERNAL pack but not what was marked confidential.
 *
 * The open levels are an allow-list: `CONFIDENTIAL`, `RESTRICTED`, a lower-case
 * spelling or a value this code does not know all count as confidential.
 */
export const EVIDENCE_READ_ACTION: Action = 'view_proposal';
export const EVIDENCE_CONFIDENTIAL_READ_ACTION: Action = 'edit_proposal';

export const OPEN_EVIDENCE_LEVELS = ['PUBLIC', 'CONSORTIUM', 'INTERNAL'] as const;

export function isConfidentialEvidence(confidentiality: string | null | undefined): boolean {
  return !(OPEN_EVIDENCE_LEVELS as readonly string[]).includes(confidentiality ?? '');
}

/**
 * The extra `where` a role's evidence reads carry: `{}` for a role that reads
 * everything, an open-levels filter for one that reads only those, and null
 * for a role that may not read evidence at all (the caller issues no query).
 */
export function evidenceReadWhere(
  role: string | null | undefined
): Record<string, never> | { confidentiality: { in: string[] } } | null {
  const r = asRole(role);
  if (!can(r, EVIDENCE_READ_ACTION)) return null;
  if (can(r, EVIDENCE_CONFIDENTIAL_READ_ACTION)) return {};
  return { confidentiality: { in: [...OPEN_EVIDENCE_LEVELS] } };
}

/** Whether `role` may read one evidence row of the given level. */
export function canReadEvidence(role: string | null | undefined, confidentiality: string | null | undefined): boolean {
  const r = asRole(role);
  if (!can(r, EVIDENCE_READ_ACTION)) return false;
  return !isConfidentialEvidence(confidentiality) || can(r, EVIDENCE_CONFIDENTIAL_READ_ACTION);
}
