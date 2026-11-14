import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { TenantTx } from '@/lib/db';
import { createLead, getLead, listLeads } from '@/modules/m18/server/leads-repo';
import { createDeal, DealTransitionError, listDealsByStage, moveDealStage } from '@/modules/m18/server/deals-repo';
import { createTask, listTasks, setTaskDone } from '@/modules/m18/server/tasks-repo';
import { leadCreateSchema, leadListQuerySchema, stageMoveSchema, taskCreateSchema } from '@/modules/m18/server/schemas';

const T = 'tenant-a';
const asTx = (fake: unknown) => fake as TenantTx;

describe('M18 input schemas', () => {
  it('trims the lead name and rejects an empty one', () => {
    expect(leadCreateSchema.parse({ name: '  Kooperatif A.Ş. ' }).name).toBe('Kooperatif A.Ş.');
    expect(() => leadCreateSchema.parse({ name: '   ' })).toThrow(ZodError);
  });

  it('accepts a 1–2 digit plate code only, and normalises blank to null', () => {
    expect(leadCreateSchema.parse({ name: 'X', provinceCode: '06' }).provinceCode).toBe('06');
    expect(leadCreateSchema.parse({ name: 'X', provinceCode: '' }).provinceCode).toBeNull();
    expect(() => leadCreateSchema.parse({ name: 'X', provinceCode: '6x' })).toThrow(ZodError);
  });

  it('rejects an unknown lifecycle filter and coerces take with a default', () => {
    expect(() => leadListQuerySchema.parse({ lifecycle: 'WHATEVER' })).toThrow(ZodError);
    expect(leadListQuerySchema.parse({}).take).toBe(50);
    expect(leadListQuerySchema.parse({ take: '20' }).take).toBe(20);
  });

  it('refuses a stage name that is not a DealStage', () => {
    expect(() => stageMoveSchema.parse({ dealId: 'd', to: 'PAID' })).toThrow(ZodError);
    expect(stageMoveSchema.parse({ dealId: 'd', to: 'QUALIFIED' }).to).toBe('QUALIFIED');
  });

  it('requires a non-empty task title', () => {
    expect(() => taskCreateSchema.parse({ dealId: 'd', title: ' ' })).toThrow(ZodError);
  });
});

describe('leads-repo', () => {
  it('lists only live rows of this tenant, with the name filter as a case-insensitive contains', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await listLeads(asTx({ leadOrganization: { findMany } }), T, { q: 'koop', lifecycle: 'LEAD' });
    const args = findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      tenantId: T,
      deletedAt: null,
      lifecycle: 'LEAD',
      name: { contains: 'koop', mode: 'insensitive' },
    });
    expect(args.take).toBe(50);
  });

  it('returns null for a lead that is soft-deleted or belongs to another tenant', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    expect(await getLead(asTx({ leadOrganization: { findFirst } }), T, 'lead-1')).toBeNull();
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: 'lead-1', tenantId: T, deletedAt: null });
  });

  it('creates a lead with its dedupe key when no duplicate exists', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'new-1' });
    const tx = { leadOrganization: { findMany: vi.fn().mockResolvedValue([]), create } };
    const result = await createLead(asTx(tx), T, { name: 'Yeni Kooperatif', provinceCode: '06' }, 'u1');
    expect(result).toEqual({ status: 'created', id: 'new-1' });
    const data = create.mock.calls[0]?.[0].data;
    expect(data.tenantId).toBe(T);
    expect(data.dedupeKey).toMatch(/^name:/);
    expect(data.lifecycle).toBe('LEAD');
  });

  it('returns duplicate candidates instead of creating when the name and province collide', async () => {
    const create = vi.fn();
    const existing = [{ id: 'old-1', name: 'Yeni Kooperatif', provinceCode: '06', dedupeKey: null }];
    const tx = { leadOrganization: { findMany: vi.fn().mockResolvedValue(existing), create } };
    const result = await createLead(asTx(tx), T, { name: 'Yeni Kooperatif', provinceCode: '06' }, null);
    expect(result.status).toBe('duplicate');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('deals-repo', () => {
  it('keeps every board stage, including empty ones, in board order', async () => {
    const tx = { deal: { findMany: vi.fn().mockResolvedValue([]) } };
    const board = await listDealsByStage(asTx(tx), T);
    expect(board.map((c) => c.stage)).toEqual([
      'NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY_MEETING', 'ELIGIBILITY_ANALYSIS',
      'PROPOSAL', 'CONTRACT', 'APPLICATION_PREP', 'SUBMITTED', 'WON', 'REJECTED', 'LOST',
    ]);
    expect(board.every((c) => c.deals.length === 0)).toBe(true);
  });

  it('refuses a deal in another tenant or with an unknown organisation', async () => {
    const tx = { leadOrganization: { findFirst: vi.fn().mockResolvedValue(null) }, deal: { create: vi.fn() } };
    expect(await createDeal(asTx(tx), T, { organizationId: 'o', title: 'Teklif' }, null)).toBeNull();
    expect(tx.deal.create).not.toHaveBeenCalled();
  });

  it('applies a legal move and writes the STAGE_CHANGE activity', async () => {
    const update = vi.fn();
    const activityCreate = vi.fn();
    const tx = {
      deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage: 'NEW' }), update },
      dealActivity: { create: activityCreate },
    };
    const result = await moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'QUALIFIED' }, 'u1');
    expect(result).toEqual({ id: 'd1', from: 'NEW', to: 'QUALIFIED' });
    expect(update.mock.calls[0]?.[0].data.stage).toBe('QUALIFIED');
    expect(activityCreate.mock.calls[0]?.[0].data).toMatchObject({ kind: 'STAGE_CHANGE', dealId: 'd1' });
  });

  it('refuses a skipped stage without writing anything', async () => {
    const update = vi.fn();
    const tx = { deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage: 'NEW' }), update } };
    await expect(moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'PROPOSAL' }, null)).rejects.toBeInstanceOf(
      DealTransitionError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('requires a reason to move a deal to LOST', async () => {
    const tx = { deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage: 'NEW' }), update: vi.fn() } };
    await expect(moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'LOST' }, null)).rejects.toMatchObject({
      reason: 'LOST_REASON_REQUIRED',
    });
  });
});

describe('tasks-repo', () => {
  it('does not create a task on a deal of another tenant', async () => {
    const tx = { deal: { findFirst: vi.fn().mockResolvedValue(null) }, dealTask: { create: vi.fn() } };
    expect(await createTask(asTx(tx), T, { dealId: 'd9', title: 'Ara' })).toBeNull();
    expect(tx.dealTask.create).not.toHaveBeenCalled();
  });

  it('marks a task done with a timestamp and undone with null', async () => {
    const update = vi.fn().mockResolvedValue({ id: 't1', doneAt: null });
    const tx = { dealTask: { findFirst: vi.fn().mockResolvedValue({ id: 't1' }), update } };
    const now = new Date('2026-11-14T10:00:00Z');
    await setTaskDone(asTx(tx), T, { taskId: 't1', done: true }, now);
    expect(update.mock.calls[0]?.[0].data.doneAt).toEqual(now);
    await setTaskDone(asTx(tx), T, { taskId: 't1', done: false }, now);
    expect(update.mock.calls[1]?.[0].data.doneAt).toBeNull();
  });

  it('lists tasks of this tenant only', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await listTasks(asTx({ dealTask: { findMany } }), T);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ tenantId: T, deletedAt: null });
  });
});
