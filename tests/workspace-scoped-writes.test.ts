import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TASK-MUO12A7NHANOT (İNCELEME-76 Y-1) — which workspace a write goes to.
 *
 * The public /calls cards linked `/[locale]/default/cagrilar/<id>` and "Add to
 * pipeline" there called `createOpportunity({ workspaceSlug: 'default' })`,
 * which resolved `default` to `tx.workspace.findFirst({ where: { tenantId } })`:
 * no `deletedAt`, no membership filter, no order. fe-fb measured a user limited
 * to workspace B writing into A, and a tenant whose `default` workspace was
 * soft-deleted writing into the deleted one.
 *
 * The fake transaction below applies the where-clause the way Postgres would
 * (tenant, `deletedAt: null`, `id in`, `slug`, `orderBy createdAt`), so a
 * helper that forgets one of those filters picks the wrong row here too.
 */

type Row = { id: string; tenantId: string; slug: string; deletedAt: Date | null; createdAt: Date };

const db = vi.hoisted(() => ({
  workspaces: [] as Row[],
  created: [] as Array<Record<string, unknown>>,
}));

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'id' && v && typeof v === 'object' && 'in' in v) {
      if (!(v as { in: string[] }).in.includes(row.id)) return false;
    } else if ((row as Record<string, unknown>)[k] !== v) {
      return false;
    }
  }
  return true;
}

const tx = vi.hoisted(() => ({
  workspace: {
    findFirst: vi.fn(
      async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: Array<Record<string, 'asc'>> }) => {
        let rows = db.workspaces.filter((r) => matches(r, where));
        if (orderBy) {
          rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
        }
        const hit = rows[0];
        return hit ? { id: hit.id, slug: hit.slug } : null;
      }
    ),
  },
  opportunity: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `opp-${db.created.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      db.created.push(row);
      return row;
    }),
  },
}));

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/billing/pilot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/pilot')>()),
  assertTenantWritable: vi.fn(async () => undefined),
}));
vi.mock('@/lib/scoring/g0-compute', () => ({ rescoreOpportunityG0: vi.fn(async () => null) }));
vi.mock('@/lib/k5-pipeline/pipelineStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/k5-pipeline/pipelineStore')>()),
  getWorkspaceMembers: vi.fn(async () => []),
  addInMemoryOpportunity: vi.fn(() => {
    throw new Error('a refused write must not be buffered as if the database were down');
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {},
  withTenant: vi.fn(async (_tenantId: string, cb: (t: unknown) => unknown) => cb(tx)),
}));

import { createOpportunity } from '@/app/[locale]/(app)/[workspace]/pipeline/actions';
import { findScopedWorkspace, normalizeWorkspaceSlug, resolveScopedWorkspace } from '@/lib/workspaces';
import { addInMemoryOpportunity } from '@/lib/k5-pipeline/pipelineStore';
import { Prisma } from '@prisma/client';
import { rescoreOpportunityG0 } from '@/lib/scoring/g0-compute';
import type { TenantScope } from '@/lib/tenant';
import type { TenantTx } from '@/lib/db';

const T2 = 't2';
const T3 = 't3';
const at = (n: number) => new Date(Date.UTC(2026, 0, n));

beforeEach(() => {
  db.created.length = 0;
  db.workspaces.length = 0;
  db.workspaces.push(
    // fe-fb's T2: ws-a created first, ws-b second.
    { id: 'ws-a', tenantId: T2, slug: 'ws-a', deletedAt: null, createdAt: at(1) },
    { id: 'ws-b', tenantId: T2, slug: 'ws-b', deletedAt: null, createdAt: at(2) },
    // fe-fb's T3: the workspace literally called `default` is soft-deleted.
    { id: 'ws-def', tenantId: T3, slug: 'default', deletedAt: at(5), createdAt: at(1) },
    { id: 'ws-new', tenantId: T3, slug: 'yeni', deletedAt: null, createdAt: at(3) },
    // another tenant's workspace with a slug that exists in T2 too
    { id: 'ws-x', tenantId: 'other', slug: 'ws-b', deletedAt: null, createdAt: at(0) }
  );
});

const scope = (tenantId: string, workspaceIds: string[] = []): TenantScope => ({
  tenantId,
  userId: 'u-1',
  role: 'TENANT_OWNER',
  workspaceIds,
  isPlatformAdmin: false,
});

const find = (s: TenantScope, slug: string | null) => findScopedWorkspace(tx as unknown as TenantTx, s, slug);

describe('findScopedWorkspace', () => {
  it('restr76: a member of B only gets B for the alias, and nothing for A', async () => {
    const restricted = scope(T2, ['ws-b']);
    expect(await find(restricted, 'default')).toEqual({ id: 'ws-b', slug: 'ws-b' });
    expect(await find(restricted, null)).toEqual({ id: 'ws-b', slug: 'ws-b' });
    expect(await find(restricted, 'ws-a')).toBeNull();
    expect(await find(restricted, 'ws-b')).toEqual({ id: 'ws-b', slug: 'ws-b' });
  });

  it('del76: the alias skips a soft-deleted `default` workspace; the deleted slug itself is refused', async () => {
    expect(await find(scope(T3), 'default')).toEqual({ id: 'ws-new', slug: 'yeni' });
    const deletedById = scope(T3, ['ws-def']);
    expect(await find(deletedById, 'default')).toBeNull();
  });

  it('owner76: an unrestricted member gets the slug asked for, and the oldest workspace for the alias', async () => {
    expect(await find(scope(T2), 'ws-b')).toEqual({ id: 'ws-b', slug: 'ws-b' });
    expect(await find(scope(T2), 'default')).toEqual({ id: 'ws-a', slug: 'ws-a' });
  });

  it('never falls back from an unknown slug, and never crosses tenants', async () => {
    expect(await find(scope(T2), 'nope')).toBeNull();
    expect(await find(scope(T3), 'ws-a')).toBeNull();
    expect(await find(scope('other'), 'ws-b')).toEqual({ id: 'ws-x', slug: 'ws-b' });
  });

  it('prefers a live, permitted workspace literally called `default` over the oldest one', async () => {
    db.workspaces.push({ id: 'ws-d2', tenantId: T2, slug: 'default', deletedAt: null, createdAt: at(9) });
    expect(await find(scope(T2), 'default')).toEqual({ id: 'ws-d2', slug: 'default' });
    expect(await find(scope(T2, ['ws-b']), 'default')).toEqual({ id: 'ws-b', slug: 'ws-b' });
  });

  it('picks the oldest workspace by createdAt, not whichever row the database returns first', async () => {
    // Stored newest-first: without an ORDER BY, Postgres may hand back either.
    db.workspaces.unshift({ id: 'ws-z', tenantId: 't5', slug: 'late', deletedAt: null, createdAt: at(20) });
    db.workspaces.push({ id: 'ws-y', tenantId: 't5', slug: 'early', deletedAt: null, createdAt: at(10) });
    expect(await find(scope('t5'), null)).toEqual({ id: 'ws-y', slug: 'early' });
  });

  it('resolveScopedWorkspace runs the same lookup in its own tenant scope', async () => {
    expect(await resolveScopedWorkspace(scope(T2, ['ws-b']), null)).toEqual({ id: 'ws-b', slug: 'ws-b' });
  });
});

describe('createOpportunity writes only into a workspace the membership covers', () => {
  const add = (workspaceSlug: string) => createOpportunity({ workspaceSlug, title: 'Fırsat', topicId: 'HORIZON-1' });

  it('restr76 on the old /default/ link: the row lands in B, not A', async () => {
    session.current = { user: { id: 'u-1' }, tenantId: T2, role: 'TENANT_OWNER', workspaceIds: ['ws-b'] };
    const res = await add('default');
    expect(res.success).toBe(true);
    expect(db.created).toEqual([expect.objectContaining({ tenantId: T2, workspaceId: 'ws-b' })]);
  });

  it('restr76 naming A explicitly: refused, nothing written, nothing buffered', async () => {
    session.current = { user: { id: 'u-1' }, tenantId: T2, role: 'TENANT_OWNER', workspaceIds: ['ws-b'] };
    expect(await add('ws-a')).toEqual({ success: false, error: 'WORKSPACE_NOT_FOUND' });
    expect(db.created).toEqual([]);
  });

  it('del76: `default` resolves to the live workspace, never the deleted one', async () => {
    session.current = { user: { id: 'u-1' }, tenantId: T3, role: 'TENANT_OWNER' };
    await add('default');
    expect(db.created).toEqual([expect.objectContaining({ workspaceId: 'ws-new' })]);
  });

  it('an unknown slug is refused rather than swapped for the first workspace', async () => {
    session.current = { user: { id: 'u-1' }, tenantId: T2, role: 'TENANT_OWNER' };
    expect(await add('typo')).toEqual({ success: false, error: 'WORKSPACE_NOT_FOUND' });
    expect(db.created).toEqual([]);
  });

  it('owner76 on B writes into B', async () => {
    session.current = { user: { id: 'u-1' }, tenantId: T2, role: 'TENANT_OWNER' };
    await add('ws-b');
    expect(db.created).toEqual([expect.objectContaining({ workspaceId: 'ws-b' })]);
  });
});

/**
 * TASK-MUO64UQJUWEBI (İNCELEME-83 Y-1 / O-1). cs-fb replayed the "Add to pipeline"
 * request with a `workspaceSlug` Prisma or Postgres cannot take; the lookup threw, the
 * catch called it an outage, and the row was buffered with `success: true`.
 */
describe('createOpportunity refuses what is not a workspace slug, before the database', () => {
  const buffered = vi.mocked(addInMemoryOpportunity);
  beforeEach(() => {
    session.current = { user: { id: 'u-1' }, tenantId: T2, role: 'TENANT_OWNER', workspaceIds: ['ws-b'] };
    buffered.mockClear();
    tx.workspace.findFirst.mockClear();
  });

  const call = (input: unknown) => createOpportunity(input as Parameters<typeof createOpportunity>[0]);

  it.each([
    ['NUL', 'ws-a\u0000'],
    ['object', { foo: 1 }],
    ['filter object', { contains: 'ws' }],
    ['array', ['ws-a']],
    ['number', 7],
    ['empty', ''],
    ['upper case', 'WS-B'],
    ['non-ASCII with space', 'çalışma alanı'],
    ['too long', 'a'.repeat(64)],
  ])('%s → INVALID_INPUT, no query, nothing written, nothing buffered', async (_label, workspaceSlug) => {
    expect(await call({ workspaceSlug, title: 'Fırsat' })).toEqual({ success: false, error: 'INVALID_INPUT' });
    expect(tx.workspace.findFirst).not.toHaveBeenCalled();
    expect(db.created).toEqual([]);
    expect(buffered).not.toHaveBeenCalled();
  });

  it.each([
    ['title NUL', { title: 'x\u0000' }],
    ['title object', { title: { foo: 1 } }],
    ['title blank', { title: '   ' }],
    ['topicId number', { title: 't', topicId: 7 }],
    ['notes NUL', { title: 't', notes: 'a\u0000b' }],
    ['stage unknown', { title: 't', stage: 'G9' }],
    ['intendedRole object', { title: 't', intendedRole: {} }],
  ])('other fields too: %s → INVALID_INPUT', async (_label, rest) => {
    expect(await call({ workspaceSlug: 'ws-b', ...rest })).toEqual({ success: false, error: 'INVALID_INPUT' });
    expect(db.created).toEqual([]);
    expect(buffered).not.toHaveBeenCalled();
  });

  it('a well-formed request still lands in the permitted workspace (notes with newlines kept)', async () => {
    const res = await call({ workspaceSlug: 'ws-b', title: 'Fırsat', notes: 'satır 1\nsatır 2\t.', stage: 'G1' });
    expect(res.success).toBe(true);
    expect(db.created).toEqual([expect.objectContaining({ workspaceId: 'ws-b', stage: 'G1', notes: 'satır 1\nsatır 2\t.' })]);
  });

  it('a query the database refuses is a refusal, not an outage: CREATE_FAILED, nothing buffered', async () => {
    const refused = new Prisma.PrismaClientKnownRequestError('invalid byte sequence for encoding "UTF8": 0x00', {
      code: 'P2039',
      clientVersion: 'test',
    });
    tx.workspace.findFirst.mockRejectedValueOnce(refused);
    expect(await call({ workspaceSlug: 'ws-b', title: 'Fırsat' })).toEqual({ success: false, error: 'CREATE_FAILED' });
    expect(buffered).not.toHaveBeenCalled();
  });

  it('a scoring failure after the row is committed keeps the created row, unbuffered', async () => {
    vi.mocked(rescoreOpportunityG0).mockRejectedValueOnce(new Error('scoring blew up'));
    const res = await call({ workspaceSlug: 'ws-b', title: 'Fırsat' });
    expect(res).toEqual({ success: true, opportunity: expect.objectContaining({ id: 'opp-1', workspaceId: 'ws-b', g0Score: null }) });
    expect(buffered).not.toHaveBeenCalled();
  });

  it('a real outage (connection refused) still falls back to the buffer', async () => {
    tx.workspace.findFirst.mockRejectedValueOnce(Object.assign(new Error(''), { code: 'ECONNREFUSED' }));
    buffered.mockImplementationOnce((tenantId, opp) => ({ ...opp, tenantId }));
    const res = await call({ workspaceSlug: 'ws-b', title: 'Fırsat' });
    expect(res).toEqual({ success: true, opportunity: expect.objectContaining({ workspaceId: 'ws-b', title: 'Fırsat' }) });
    expect(buffered).toHaveBeenCalledTimes(1);
  });
});

describe('workspace slugs that cannot be a URL segment (O-1)', () => {
  it('normalizeWorkspaceSlug decodes, lower-cases, and refuses what is not a slug', () => {
    expect(normalizeWorkspaceSlug('ws-b')).toBe('ws-b');
    expect(normalizeWorkspaceSlug('WS-B')).toBe('ws-b');
    expect(normalizeWorkspaceSlug('ws%2Db')).toBe('ws-b');
    expect(normalizeWorkspaceSlug('%C3%A7al%C4%B1%C5%9Fma%20alan%C4%B1')).toBeNull();
    expect(normalizeWorkspaceSlug('çalışma alanı')).toBeNull();
    expect(normalizeWorkspaceSlug('%E0%A4%A')).toBeNull();
    expect(normalizeWorkspaceSlug('a%00')).toBeNull();
    expect(normalizeWorkspaceSlug('..%2f..%2fevil')).toBeNull();
    expect(normalizeWorkspaceSlug('')).toBeNull();
  });

  it('findScopedWorkspace never hands back a workspace whose stored slug has no URL', async () => {
    db.workspaces.push({ id: 'ws-t8', tenantId: 't8', slug: 'çalışma alanı', deletedAt: null, createdAt: at(1) });
    // the alias and the workspace-free route would redirect to it: refused instead
    expect(await find(scope('t8'), null)).toBeNull();
    expect(await find(scope('t8'), 'default')).toBeNull();
    // and it cannot be asked for by name either
    expect(await find(scope('t8'), 'çalışma alanı')).toBeNull();
  });
});
