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
import { findScopedWorkspace, resolveScopedWorkspace } from '@/lib/workspaces';
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
