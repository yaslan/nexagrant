/**
 * NG-34 — the records G1 reads (spec §12, §17.1): an organisation's EU Login and LEAR answers,
 * the internal approval of an opportunity, and each partner's budget share range. They only
 * store and read; the gate rule that uses them is NG-33 and the G0 scorer does not read them.
 *
 * PIC is not stored here. It stays where it already lives (Tenant.pic, the seat, PartnerOrg)
 * and a read reports only present or missing, never the number.
 *
 * Every read and write runs in `withTenant`. Another tenant's id answers `null`, as an id that
 * does not exist does, so the caller cannot tell them apart. An audit row names what changed,
 * not the amount or the decision text: the audit log is read more widely than these records.
 */
import { z } from 'zod';

import { withTenant } from '@/lib/db';

type Scope = { tenantId: string; userId: string };

/** Stored as BigInt, sent as a JSON number, so an amount has to fit one exactly. */
const Cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Currency = z.string().regex(/^[A-Z]{3}$/).default('EUR');

export const ReadinessInputSchema = z
  .object({
    euLoginReady: z.boolean().nullable().optional(),
    learReady: z.boolean().nullable().optional(),
  })
  .strict();
export type ReadinessInput = z.infer<typeof ReadinessInputSchema>;

export const InternalApprovalInputSchema = z
  .object({
    approved: z.boolean(),
    cofinancingCents: Cents.nullable(),
    currency: Currency,
    decisionRef: z.string().trim().min(1).max(200).nullable(),
    decisionAt: z.string().datetime().nullable(),
  })
  .strict();
export type InternalApprovalInput = z.input<typeof InternalApprovalInputSchema>;

export const BudgetShareInputSchema = z
  .object({
    seatId: z.string().min(1),
    minCents: Cents,
    maxCents: Cents,
    currency: Currency,
    agreed: z.boolean(),
  })
  .strict()
  .refine((share) => share.minCents <= share.maxCents, { path: ['maxCents'], message: 'min_above_max' });
export type BudgetShareInput = Omit<z.input<typeof BudgetShareInputSchema>, 'seatId'>;

export type ReadinessAnswer = 'yes' | 'no' | 'unknown';
export type ReadinessField = 'pic' | 'euLogin' | 'lear';
export type ReadinessView = {
  subject: string;
  pic: 'present' | 'missing';
  euLogin: ReadinessAnswer;
  lear: ReadinessAnswer;
  /** What still stands between this organisation and complete; "no" counts, as "unknown" does. */
  missing: ReadinessField[];
  complete: boolean;
};

function answer(value: boolean | null | undefined): ReadinessAnswer {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

function readinessView(
  subject: string,
  hasPic: boolean,
  row: { euLoginReady: boolean | null; learReady: boolean | null } | null,
): ReadinessView {
  const euLogin = answer(row?.euLoginReady);
  const lear = answer(row?.learReady);
  const missing: ReadinessField[] = [];
  if (!hasPic) missing.push('pic');
  if (euLogin !== 'yes') missing.push('euLogin');
  if (lear !== 'yes') missing.push('lear');
  return { subject, pic: hasPic ? 'present' : 'missing', euLogin, lear, missing, complete: missing.length === 0 };
}

const SELF = 'self';

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function ownHasPic(tx: Tx, tenantId: string): Promise<boolean> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } });
  return Boolean(tenant?.pic);
}

/** The organisation in a seat. An open seat has none, so it has no record to hold. */
async function seatOrganisation(tx: Tx, tenantId: string, seatId: string) {
  const seat = await tx.consortiumSeat.findFirst({
    where: { id: seatId, tenantId, opportunity: { deletedAt: null } },
    select: { organizationId: true, partnerOrgId: true },
  });
  if (seat?.organizationId) return { subject: `cordis:${seat.organizationId}`, hasPic: true };
  if (seat?.partnerOrgId) {
    const partner = await tx.partnerOrg.findFirst({
      where: { id: seat.partnerOrgId, tenantId },
      select: { pic: true },
    });
    return { subject: `partner:${seat.partnerOrgId}`, hasPic: Boolean(partner?.pic) };
  }
  return null;
}

async function writeReadiness(tx: Tx, scope: Scope, subject: string, input: ReadinessInput) {
  const row = await tx.orgReadiness.upsert({
    where: { tenantId_subject: { tenantId: scope.tenantId, subject } },
    create: { tenantId: scope.tenantId, subject, ...input },
    update: input,
  });
  await tx.auditEvent.create({
    data: { tenantId: scope.tenantId, actorId: scope.userId, type: 'org_readiness.saved', target: row.id },
  });
  return row;
}

export function getOwnReadiness(scope: Pick<Scope, 'tenantId'>): Promise<ReadinessView> {
  return withTenant(scope.tenantId, async (tx) => {
    const row = await tx.orgReadiness.findUnique({
      where: { tenantId_subject: { tenantId: scope.tenantId, subject: SELF } },
    });
    return readinessView(SELF, await ownHasPic(tx, scope.tenantId), row);
  });
}

export function saveOwnReadiness(scope: Scope, input: ReadinessInput): Promise<ReadinessView> {
  return withTenant(scope.tenantId, async (tx) => {
    const row = await writeReadiness(tx, scope, SELF, input);
    return readinessView(SELF, await ownHasPic(tx, scope.tenantId), row);
  });
}

export function getSeatReadiness(scope: Pick<Scope, 'tenantId'>, seatId: string): Promise<ReadinessView | null> {
  return withTenant(scope.tenantId, async (tx) => {
    const organisation = await seatOrganisation(tx, scope.tenantId, seatId);
    if (!organisation) return null;
    const row = await tx.orgReadiness.findUnique({
      where: { tenantId_subject: { tenantId: scope.tenantId, subject: organisation.subject } },
    });
    return readinessView(organisation.subject, organisation.hasPic, row);
  });
}

export function saveSeatReadiness(scope: Scope, seatId: string, input: ReadinessInput): Promise<ReadinessView | null> {
  return withTenant(scope.tenantId, async (tx) => {
    const organisation = await seatOrganisation(tx, scope.tenantId, seatId);
    if (!organisation) return null;
    const row = await writeReadiness(tx, scope, organisation.subject, input);
    return readinessView(organisation.subject, organisation.hasPic, row);
  });
}

export type InternalApprovalView = {
  opportunityId: string;
  approved: boolean;
  approvedAt: string | null;
  approvedById: string | null;
  cofinancingCents: number | null;
  currency: string;
  decisionRef: string | null;
  decisionAt: string | null;
};

function approvalView(row: {
  opportunityId: string;
  approvedAt: Date | null;
  approvedById: string | null;
  cofinancingCommitmentCents: bigint | null;
  currency: string;
  councilDecisionRef: string | null;
  councilDecisionAt: Date | null;
}): InternalApprovalView {
  return {
    opportunityId: row.opportunityId,
    approved: row.approvedAt !== null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedById: row.approvedById,
    cofinancingCents: row.cofinancingCommitmentCents === null ? null : Number(row.cofinancingCommitmentCents),
    currency: row.currency,
    decisionRef: row.councilDecisionRef,
    decisionAt: row.councilDecisionAt?.toISOString() ?? null,
  };
}

export function getInternalApproval(
  scope: Pick<Scope, 'tenantId'>,
  opportunityId: string,
): Promise<InternalApprovalView | null> {
  return withTenant(scope.tenantId, async (tx) => {
    const row = await tx.internalApproval.findFirst({
      where: { opportunityId, tenantId: scope.tenantId, opportunity: { deletedAt: null } },
    });
    return row ? approvalView(row) : null;
  });
}

/**
 * An approval is of a commitment: a changed amount or currency is a new approval, with its own
 * date and approver. Correcting the decision reference leaves the approval as it was.
 */
export function saveInternalApproval(
  scope: Scope,
  opportunityId: string,
  raw: InternalApprovalInput,
): Promise<InternalApprovalView | null> {
  const input = InternalApprovalInputSchema.parse(raw);
  return withTenant(scope.tenantId, async (tx) => {
    const opportunity = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId: scope.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!opportunity) return null;

    const where = { opportunityId_tenantId: { opportunityId, tenantId: scope.tenantId } };
    const existing = await tx.internalApproval.findUnique({ where });
    const cents = input.cofinancingCents === null ? null : BigInt(input.cofinancingCents);
    const unchanged =
      existing?.approvedAt && existing.cofinancingCommitmentCents === cents && existing.currency === input.currency;

    const fields = {
      approvedAt: !input.approved ? null : unchanged ? existing.approvedAt : new Date(),
      approvedById: !input.approved ? null : unchanged ? existing.approvedById : scope.userId,
      cofinancingCommitmentCents: cents,
      currency: input.currency,
      councilDecisionRef: input.decisionRef,
      councilDecisionAt: input.decisionAt ? new Date(input.decisionAt) : null,
    };
    const row = await tx.internalApproval.upsert({
      where,
      create: { tenantId: scope.tenantId, opportunityId, ...fields },
      update: fields,
    });
    await tx.auditEvent.create({
      data: {
        tenantId: scope.tenantId,
        actorId: scope.userId,
        type: 'internal_approval.saved',
        target: opportunityId,
        data: { approved: input.approved },
      },
    });
    return approvalView(row);
  });
}

export type BudgetShareView = {
  seatId: string;
  minCents: number;
  maxCents: number;
  currency: string;
  agreedAt: string | null;
  agreedById: string | null;
};

function shareView(row: {
  seatId: string;
  minCents: bigint;
  maxCents: bigint;
  currency: string;
  agreedAt: Date | null;
  agreedById: string | null;
}): BudgetShareView {
  return {
    seatId: row.seatId,
    minCents: Number(row.minCents),
    maxCents: Number(row.maxCents),
    currency: row.currency,
    agreedAt: row.agreedAt?.toISOString() ?? null,
    agreedById: row.agreedById,
  };
}

export function listBudgetShares(scope: Pick<Scope, 'tenantId'>, opportunityId: string): Promise<BudgetShareView[]> {
  return withTenant(scope.tenantId, async (tx) => {
    const rows = await tx.partnerBudgetShare.findMany({
      where: { tenantId: scope.tenantId, seat: { opportunityId, opportunity: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(shareView);
  });
}

/** The agreement is of a range: a moved range keeps it only if the caller agrees again. */
export function saveBudgetShare(
  scope: Scope,
  seatId: string,
  raw: BudgetShareInput,
  opportunityId?: string,
): Promise<BudgetShareView | null> {
  const input = BudgetShareInputSchema.parse({ ...raw, seatId });
  return withTenant(scope.tenantId, async (tx) => {
    const seat = await tx.consortiumSeat.findFirst({
      where: { id: seatId, tenantId: scope.tenantId, opportunityId, opportunity: { deletedAt: null } },
      select: { id: true },
    });
    if (!seat) return null;

    const where = { seatId_tenantId: { seatId, tenantId: scope.tenantId } };
    const existing = await tx.partnerBudgetShare.findUnique({ where });
    const minCents = BigInt(input.minCents);
    const maxCents = BigInt(input.maxCents);
    const unchanged =
      existing?.agreedAt &&
      existing.minCents === minCents &&
      existing.maxCents === maxCents &&
      existing.currency === input.currency;

    const fields = {
      minCents,
      maxCents,
      currency: input.currency,
      agreedAt: !input.agreed ? null : unchanged ? existing.agreedAt : new Date(),
      agreedById: !input.agreed ? null : unchanged ? existing.agreedById : scope.userId,
    };
    const row = await tx.partnerBudgetShare.upsert({
      where,
      create: { tenantId: scope.tenantId, seatId, ...fields },
      update: fields,
    });
    await tx.auditEvent.create({
      data: {
        tenantId: scope.tenantId,
        actorId: scope.userId,
        type: 'partner_budget_share.saved',
        target: seatId,
        data: { agreed: input.agreed },
      },
    });
    return shareView(row);
  });
}
