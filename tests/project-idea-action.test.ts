import { beforeEach, describe, expect, it, vi } from 'vitest';

// The action runs the real `createProjectIdea` (NG-38) — its zod schema and audit row —
// and only the database seam is faked. So a refused shape is proven to write nothing.
const requireTenantAction = vi.fn();
const revalidatePath = vi.fn();
const tx = {
  projectIdea: { create: vi.fn() },
  auditEvent: { create: vi.fn() },
};
const withTenant = vi.fn(async (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: (...args: unknown[]) => requireTenantAction(...args),
}));
vi.mock('@/lib/db', () => ({
  withTenant: (tenantId: string, fn: (t: typeof tx) => unknown) => withTenant(tenantId, fn),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import { saveProjectIdea } from '@/app/[locale]/(app)/[workspace]/proje-fikri/actions';

const VALID = {
  title: 'Akıllı sulama',
  summary: null,
  keywords: ['sulama'],
  trl: 4,
  targetPrograms: ['horizonEurope'],
};

describe('saveProjectIdea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantAction.mockResolvedValue({ tenantId: 'tenant-a', userId: 'user-1', role: 'TENANT_OWNER' });
    tx.projectIdea.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'idea-1',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...data,
    }));
    tx.auditEvent.create.mockResolvedValue({});
  });

  it('asks for the edit_proposal permission before any write', async () => {
    await saveProjectIdea(VALID);
    expect(requireTenantAction).toHaveBeenCalledWith({ can: 'edit_proposal' });
  });

  it('writes the idea and its audit row under the caller tenant, then revalidates', async () => {
    const res = await saveProjectIdea(VALID);
    expect(withTenant).toHaveBeenCalledWith('tenant-a', expect.any(Function));
    expect(tx.projectIdea.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-a', createdById: 'user-1', title: 'Akıllı sulama', trl: 4 }) }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'project_idea.created', target: 'idea-1' }) }),
    );
    expect(res.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('refuses a TRL outside 1..9 and writes nothing', async () => {
    const res = await saveProjectIdea({ ...VALID, trl: 10 });
    expect(res).toEqual({ ok: false, code: 'invalid' });
    expect(tx.projectIdea.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a blank title and writes nothing', async () => {
    const res = await saveProjectIdea({ ...VALID, title: '   ' });
    expect(res).toEqual({ ok: false, code: 'invalid' });
    expect(tx.projectIdea.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown field (strict schema) and writes nothing', async () => {
    const res = await saveProjectIdea({ ...VALID, institution: 'Örnek' } as never);
    expect(res).toEqual({ ok: false, code: 'invalid' });
    expect(tx.projectIdea.create).not.toHaveBeenCalled();
  });

  it('lets a role refusal from requireTenantAction propagate unchanged', async () => {
    const refusal = new Error('FORBIDDEN_ROLE');
    requireTenantAction.mockRejectedValue(refusal);
    await expect(saveProjectIdea(VALID)).rejects.toBe(refusal);
    expect(tx.projectIdea.create).not.toHaveBeenCalled();
  });
});
