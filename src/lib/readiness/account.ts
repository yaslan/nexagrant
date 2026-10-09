/**
 * FB KAMU B6 (TASK-MULRR8P7HIII4) — the scorecard result kept on a tenant.
 *
 * Where: `Tenant.settings.readiness` (an existing JSON column; no schema change).
 * What: the result code of the sign-up link (`<orgType>.<15 answers>`, see
 * share.ts) and when it was imported. The score, level and gaps are NOT stored:
 * they are recomputed from the answers with scoreReadiness, so the dashboard
 * card always agrees with the scorecard's own rules and texts.
 *
 * When: once, in the registration transaction, and only when the person ticked
 * "add my result to my account" (KVKK: nothing leaves the browser without it;
 * the scorecard itself writes nothing). Everything read back goes through
 * decodeReadinessCode, so a malformed value imports nothing; a hand-made but
 * well-formed one is a valid result and is accepted as such (K-1, İNCELEME-12).
 *
 * Server-free: the registration form and the dashboard both import it.
 */
import { READINESS_ORG_TYPES, type ReadinessOrgType } from './score';
import type { ReadinessAnswers } from './questions';
import { decodeReadinessCode } from './share';

export const TENANT_READINESS_KEY = 'readiness';

export interface TenantReadiness {
  orgType: ReadinessOrgType;
  answers: ReadinessAnswers;
  code: string;
  /** ISO timestamp of the import (the registration). */
  importedAt: string;
}

/** A result code from a form, a cookie or a URL; null unless it decodes exactly. */
export function toReadinessCode(raw: unknown): string | null {
  return typeof raw === 'string' ? (decodeReadinessCode(raw.trim(), READINESS_ORG_TYPES)?.code ?? null) : null;
}

/** The `settings` of a new tenant carrying `code`, or undefined (the column default `{}`) without one. */
export function readinessSettings(
  code: string | null,
  now: Date = new Date(),
): { [TENANT_READINESS_KEY]: { code: string; importedAt: string } } | undefined {
  const valid = toReadinessCode(code);
  return valid ? { [TENANT_READINESS_KEY]: { code: valid, importedAt: now.toISOString() } } : undefined;
}

/** `Tenant.settings` in, the stored result out; null when there is none or it does not decode. */
export function readTenantReadiness(settings: unknown): TenantReadiness | null {
  if (!settings || typeof settings !== 'object') return null;
  const entry = (settings as Record<string, unknown>)[TENANT_READINESS_KEY];
  if (!entry || typeof entry !== 'object') return null;
  const { code, importedAt } = entry as Record<string, unknown>;
  const decoded = decodeReadinessCode(typeof code === 'string' ? code : null, READINESS_ORG_TYPES);
  if (!decoded) return null;
  return {
    ...decoded,
    importedAt: typeof importedAt === 'string' ? importedAt : '',
  };
}
