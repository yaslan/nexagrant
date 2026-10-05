import type { OppStatus } from '@prisma/client';
import { withTenant, type TenantTx } from '@/lib/db';

/**
 * Application declaration — "gönderildi / kabul / red" (FB KAMU B7, TASK-MULRRU63LWC6E).
 *
 * No schema change was needed: the columns were already there and nothing in the product wrote
 * them. `Proposal.submittedAt` is the submission (M5's hit-rate numerator already reads it) and
 * `Opportunity.status` carries the result as `FUNDED` / `REJECTED` — the enum was drawn for
 * exactly this. Both are the institution's own declaration, not a verified fact: the agency
 * report (docs/kamu/OKA-KANAL-ONERISI.md §4, steps 6-7) says so in its source column.
 *
 * `Proposal.outcome` is deliberately left alone. It holds the ESR evaluation band
 * (`above_threshold` / `below`, src/modules/m6/server/esr-parser.ts); "accepted by the funder"
 * is a different question, and writing it there would put two authors on one column.
 *
 * This module imports `@/lib/db`, so it can only ever run on the server.
 */

export type ApplicationDeclaration = 'submitted' | 'accepted' | 'rejected';

export const APPLICATION_DECLARATIONS: readonly ApplicationDeclaration[] = [
  'submitted',
  'accepted',
  'rejected',
];

export type DeclarationRefusal = 'NOT_SUBMITTED' | 'ALREADY_DECIDED' | 'WITHDRAWN';

const DECIDED: ReadonlySet<OppStatus> = new Set<OppStatus>(['FUNDED', 'REJECTED']);

/**
 * The state machine, pure so it can be tested without a database.
 *
 *   ACTIVE ──submitted──▶ SUBMITTED ──accepted──▶ FUNDED
 *                                   └─rejected──▶ REJECTED
 *
 * - A result needs a submission first: an outcome without a submission would count in
 *   `accepted` while missing from `submitted`, and the funnel would stop being a funnel.
 * - FUNDED ⇄ REJECTED is allowed, so a mis-click can be corrected.
 * - Declaring `submitted` again after a result is refused — it would silently erase the result.
 * - Repeating the current declaration is a no-op, not an error (double-click safe).
 */
export function nextApplicationStatus(
  current: OppStatus,
  submitted: boolean,
  declaration: ApplicationDeclaration,
): { status: OppStatus } | { refused: DeclarationRefusal } {
  if (current === 'WITHDRAWN') return { refused: 'WITHDRAWN' };

  if (declaration === 'submitted') {
    if (DECIDED.has(current)) return { refused: 'ALREADY_DECIDED' };
    return { status: 'SUBMITTED' };
  }

  if (!submitted) return { refused: 'NOT_SUBMITTED' };
  return { status: declaration === 'accepted' ? 'FUNDED' : 'REJECTED' };
}

export interface ApplicationOutcomeCounts {
  submitted: number;
  accepted: number;
  rejected: number;
}

/** Rows that count: a live proposal with a submission, on a live (not archived) opportunity. */
function submittedWhere(tenantId: string, since: Date | undefined, status?: OppStatus) {
  return {
    tenantId,
    deletedAt: null,
    submittedAt: since ? { gte: since } : { not: null },
    opportunity: status ? { deletedAt: null, status } : { deletedAt: null },
  };
}

async function countForTenant(
  tx: TenantTx,
  tenantId: string,
  since: Date | undefined,
): Promise<ApplicationOutcomeCounts> {
  const [submitted, accepted, rejected] = await Promise.all([
    tx.proposal.count({ where: submittedWhere(tenantId, since) }),
    tx.proposal.count({ where: submittedWhere(tenantId, since, 'FUNDED') }),
    tx.proposal.count({ where: submittedWhere(tenantId, since, 'REJECTED') }),
  ]);
  return { submitted, accepted, rejected };
}

/**
 * What {@link countApplicationOutcomes} counts: applications (the default), or organisations with
 * at least one (TASK-MULZATEX4G92H — the agency funnel's small-cell rule counts organisations, so
 * one organisation with six applications must be one).
 */
export type OutcomeUnit = 'application' | 'organisation';

/**
 * Submitted / accepted / rejected applications, summed over `tenantIds`.
 *
 * SECURITY: `tenantIds` MUST be derived server-side from the caller's authorised scope
 * (e.g. `Tenant.agencyId` of the session's agency tenant); never pass client input. This function
 * trusts the list it is given — it answers for every tenant named in it.
 *
 * - Returns one total, never a per-tenant breakdown and never any row content: the agency sees
 *   aggregated numbers only (OKA-KANAL-ONERISI.md §6, B2).
 * - `since` filters on the SUBMISSION date. The three numbers are one cohort — applications
 *   submitted since then — so `accepted` and `rejected` are always subsets of `submitted`.
 * - Each tenant is read inside its own `withTenant`, so RLS holds under a NOBYPASSRLS role and no
 *   system scope (and no tenant-bypass baseline entry) is needed. Tenants are read one after
 *   another to keep one pooled connection per call, whatever the size of the list.
 * - Duplicates are counted once; an empty list is zeros. An empty or blank id throws
 *   (`MissingTenantScopeError`) rather than widening the query.
 * - `unit: 'organisation'` counts each tenant at most once per number: tenants with at least one
 *   submitted / accepted / rejected application. `accepted` and `rejected` then overlap (one
 *   tenant can have both), but each stays a subset of `submitted`.
 */
export async function countApplicationOutcomes(
  tenantIds: string[],
  since?: Date,
  options: { unit?: OutcomeUnit } = {},
): Promise<ApplicationOutcomeCounts> {
  const perOrganisation = options.unit === 'organisation';
  const total: ApplicationOutcomeCounts = { submitted: 0, accepted: 0, rejected: 0 };
  for (const tenantId of new Set(tenantIds)) {
    const c = await withTenant<ApplicationOutcomeCounts>(tenantId, (tx) =>
      countForTenant(tx, tenantId, since),
    );
    const n = (x: number) => (perOrganisation ? Math.min(x, 1) : x);
    total.submitted += n(c.submitted);
    total.accepted += n(c.accepted);
    total.rejected += n(c.rejected);
  }
  return total;
}
