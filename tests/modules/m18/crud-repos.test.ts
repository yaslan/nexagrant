import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { TenantTx } from '@/lib/db';
import { createLead, getLead, listLeads } from '@/modules/m18/server/leads-repo';
import { createDeal, DealTransitionError, listDealsByStage, moveDealStage } from '@/modules/m18/server/deals-repo';
import { createTask, listTasks, setTaskDone } from '@/modules/m18/server/tasks-repo';
import { AUTO_TASK_RULES } from '@/modules/m18/server/pipeline-rules';
import enMessages from '../../../messages/en.json';
import trMessages from '../../../messages/tr.json';
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
      $queryRaw: vi.fn().mockResolvedValue([]),
      deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage: 'NEW' }), update },
      dealActivity: { create: activityCreate },
      dealTask: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
    };
    const result = await moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'QUALIFIED' }, 'u1', 'tr');
    expect(result).toEqual({ id: 'd1', from: 'NEW', to: 'QUALIFIED' });
    expect(update.mock.calls[0]?.[0].data.stage).toBe('QUALIFIED');
    expect(activityCreate.mock.calls[0]?.[0].data).toMatchObject({ kind: 'STAGE_CHANGE', dealId: 'd1' });
  });

  it('locks the deal row FOR UPDATE, scoped to tenant and id, before it reads the stage (NG-220)', async () => {
    const order: string[] = [];
    const $queryRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      order.push('lock');
      expect(strings.join('?')).toMatch(/FROM "Deal" WHERE "tenantId" = \? AND "id" = \? FOR UPDATE/);
      expect(values).toEqual([T, 'd1']);
      return Promise.resolve([]);
    });
    const findFirst = vi.fn(() => {
      order.push('read');
      return Promise.resolve({ id: 'd1', stage: 'NEW' });
    });
    const tx = {
      $queryRaw,
      deal: { findFirst, update: vi.fn() },
      dealActivity: { create: vi.fn() },
      dealTask: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
    };
    await moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'QUALIFIED' }, 'u1', 'tr');
    expect(order).toEqual(['lock', 'read']);
  });

  it('refuses a skipped stage without writing anything', async () => {
    const update = vi.fn();
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage: 'NEW' }), update } };
    await expect(moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'PROPOSAL' }, null, 'tr')).rejects.toBeInstanceOf(
      DealTransitionError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('requires a reason to move a deal to LOST', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage: 'NEW' }), update: vi.fn() } };
    await expect(moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'LOST' }, null, 'tr')).rejects.toMatchObject({
      reason: 'LOST_REASON_REQUIRED',
    });
  });
});

describe('deals-repo — auto tasks on entering a stage (NG-216)', () => {
  function fakeTx(stage: string, existing: Array<{ autoRuleKey: string | null }> = []) {
    return {
      $queryRaw: vi.fn().mockResolvedValue([]),
      deal: { findFirst: vi.fn().mockResolvedValue({ id: 'd1', stage }), update: vi.fn() },
      dealActivity: { create: vi.fn() },
      dealTask: { findMany: vi.fn().mockResolvedValue(existing), createMany: vi.fn(), create: vi.fn() },
    };
  }
  const created = (tx: ReturnType<typeof fakeTx>) =>
    [
      ...tx.dealTask.createMany.mock.calls.flatMap((c) => c[0].data as Array<Record<string, unknown>>),
      ...tx.dealTask.create.mock.calls.map((c) => c[0].data as Record<string, unknown>),
    ];

  it('creates the PROPOSAL tasks (send quote, follow up) when a deal enters PROPOSAL', async () => {
    const tx = fakeTx('ELIGIBILITY_ANALYSIS');
    await moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'PROPOSAL' }, 'u1', 'tr');
    const rows = created(tx);
    expect(rows.map((r) => r.autoRuleKey)).toEqual(['proposal.send-quote', 'proposal.follow-up']);
    for (const r of rows) {
      expect(r).toMatchObject({ tenantId: T, dealId: 'd1', autoGenerated: true });
      expect(typeof r.title).toBe('string');
      expect(r.title).not.toBe('');
      expect(r.title).not.toContain('proposal.');
      expect(r.dueAt).toBeInstanceOf(Date);
    }
    // the existing-keys lookup is scoped to this tenant's live tasks of this deal
    expect(tx.dealTask.findMany.mock.calls[0]?.[0].where).toMatchObject({ tenantId: T, dealId: 'd1', deletedAt: null });
  });

  it('does not create a task whose rule already sits on the deal (back-and-forth move)', async () => {
    const tx = fakeTx('ELIGIBILITY_ANALYSIS', [{ autoRuleKey: 'proposal.send-quote' }, { autoRuleKey: null }]);
    await moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'PROPOSAL' }, 'u1', 'tr');
    expect(created(tx).map((r) => r.autoRuleKey)).toEqual(['proposal.follow-up']);
  });

  it('renders the task title in the acting user\'s locale, from m18.autoTasks', async () => {
    const tr = fakeTx('ELIGIBILITY_ANALYSIS');
    await moveDealStage(asTx(tr), T, { dealId: 'd1', to: 'PROPOSAL' }, 'u1', 'tr');
    const en = fakeTx('ELIGIBILITY_ANALYSIS');
    await moveDealStage(asTx(en), T, { dealId: 'd1', to: 'PROPOSAL' }, 'u1', 'en');
    expect(created(tr)[0]?.title).toBe(trMessages.m18.autoTasks.proposal['send-quote']);
    expect(created(en)[0]?.title).toBe(enMessages.m18.autoTasks.proposal['send-quote']);
  });

  it('every AUTO_TASK_RULES key has a title in both locales', () => {
    const lookup = (m: Record<string, unknown>, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], m);
    for (const rule of Object.values(AUTO_TASK_RULES).flat()) {
      for (const messages of [trMessages, enMessages]) {
        expect(typeof lookup(messages.m18.autoTasks, rule.ruleKey), rule.ruleKey).toBe('string');
      }
    }
  });

  it('writes no task for a refused move', async () => {
    const tx = fakeTx('NEW');
    await expect(moveDealStage(asTx(tx), T, { dealId: 'd1', to: 'PROPOSAL' }, null, 'tr')).rejects.toBeInstanceOf(
      DealTransitionError,
    );
    expect(created(tx)).toEqual([]);
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
