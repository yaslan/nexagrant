import type { TenantTx } from '@/lib/db';
import { dedupeKey, findDuplicates, type DuplicateCandidate } from './duplicates';
import { leadCreateSchema, leadListQuerySchema, type LeadCreateInput, type LeadListQuery } from './schemas';

/**
 * Lead organisation CRUD (NG-135 / F3). Every query is tenant-bound and soft-delete aware.
 * The transaction is a parameter: callers wrap it in `withTenant`, tests pass a fake.
 */

export const LEAD_LIST_SELECT = {
  id: true,
  name: true,
  orgType: true,
  provinceCode: true,
  lifecycle: true,
  sizeBand: true,
  updatedAt: true,
} as const;

export async function listLeads(tx: TenantTx, tenantId: string, rawQuery: unknown) {
  const query: LeadListQuery = leadListQuerySchema.parse(rawQuery);
  return tx.leadOrganization.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(query.lifecycle ? { lifecycle: query.lifecycle } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: query.take,
    select: LEAD_LIST_SELECT,
  });
}

export async function getLead(tx: TenantTx, tenantId: string, id: string) {
  return tx.leadOrganization.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: {
      ...LEAD_LIST_SELECT,
      legalName: true,
      district: true,
      website: true,
      lifecycle: true,
      disqualifyReason: true,
      contacts: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true, fullName: true, title: true, email: true, phone: true, doNotContact: true },
      },
      deals: {
        where: { deletedAt: null },
        orderBy: [{ stageChangedAt: 'desc' }],
        select: { id: true, title: true, stage: true, estimatedFeeCents: true, currency: true },
      },
    },
  });
}

export type CreateLeadResult =
  | { status: 'created'; id: string }
  | { status: 'duplicate'; candidates: DuplicateCandidate[] };

/**
 * Creates a lead unless it collides with an existing one. A collision is returned, never
 * silently merged: merging is the duplicate-review screen's job (F3 phase B).
 */
export async function createLead(
  tx: TenantTx,
  tenantId: string,
  rawInput: unknown,
  ownerUserId: string | null,
): Promise<CreateLeadResult> {
  const input: LeadCreateInput = leadCreateSchema.parse(rawInput);
  const key = dedupeKey({ name: input.name, provinceCode: input.provinceCode });

  const existing = await tx.leadOrganization.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, provinceCode: true, dedupeKey: true },
    take: 5000,
  });
  const candidates = findDuplicates(
    { name: input.name, provinceCode: input.provinceCode },
    existing,
  );
  if (candidates.length > 0) return { status: 'duplicate', candidates };

  const created = await tx.leadOrganization.create({
    data: {
      tenantId,
      name: input.name,
      legalName: input.legalName,
      provinceCode: input.provinceCode,
      website: input.website,
      sizeBand: input.sizeBand,
      dedupeKey: key,
      ownerUserId,
      lifecycle: 'LEAD',
    },
    select: { id: true },
  });
  return { status: 'created', id: created.id };
}
