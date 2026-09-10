import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConceptNote, ConceptTemplate, Opportunity } from '@prisma/client';
import { partialRow } from '../../../../../../tests/helpers/partial-row';

/**
 * Regression test for TASK-MTRKV25PNBHPX: `ConceptNote.opportunity` is not a
 * relation in prisma/schema.prisma — `include: { opportunity: true }` throws
 * PrismaClientValidationError at runtime (a 500 for every export request).
 * `pnpm typecheck` was green when this was written because
 * src/types/prisma-override.d.ts widened the delegates to `any`; that override
 * is gone (TASK-MTSJHTJZSCILI). This asserts the query no longer requests that
 * include and that the opportunity title is still resolved via a separate
 * lookup by `opportunityId`.
 */

const mockPrisma = vi.hoisted(() => ({
  conceptNote: { findFirst: vi.fn() },
  opportunity: { findFirst: vi.fn() },
  conceptTemplate: { findUnique: vi.fn() },
}));

/**
 * `withTenant` hands the callback the same fake client `prisma` resolves to, so
 * the assertions below keep watching the same `vi.fn()`s after the route moved
 * its two tenant-scoped reads into a tenant scope (TASK-MTVR9T834EPUC). The
 * `conceptTemplate` lookup stays on `prisma` — it is the shared catalogue.
 */
vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb(mockPrisma as never),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

function makeRequest() {
  return new Request('https://example.test/api/concept-notes/note_1/export');
}

describe('GET /api/concept-notes/[id]/export — phantom relation regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the note without `include: { opportunity: true }` and looks up the opportunity separately', async () => {
    vi.mocked(auth).mockResolvedValue({ tenantId: 'tenant_1' } as never);
    vi.mocked(prisma.conceptNote.findFirst).mockResolvedValue(
      partialRow<ConceptNote>({
        id: 'note_1',
        templateId: 'tpl_1',
        opportunityId: 'opp_1',
        content: { summary: 'Draft text' },
      })
    );
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(
      partialRow<Opportunity>({ title: 'Smart Grids for Rural Regions' })
    );
    vi.mocked(prisma.conceptTemplate.findUnique).mockResolvedValue(
      partialRow<ConceptTemplate>({
        id: 'tpl_1',
        name: 'Standard Template',
        schema: { sections: [{ key: 'summary', labelKey: 'Summary' }] },
      })
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'note_1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('Smart Grids for Rural Regions');

    const noteFindArgs = vi.mocked(prisma.conceptNote.findFirst).mock.calls[0]?.[0];
    expect(noteFindArgs).not.toHaveProperty('include');

    expect(prisma.opportunity.findFirst).toHaveBeenCalledWith({
      where: { id: 'opp_1', tenantId: 'tenant_1' },
      select: { title: true },
    });
  });

  it('returns 404 without ever building the document when the note does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({ tenantId: 'tenant_1' } as never);
    vi.mocked(prisma.conceptNote.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'missing' }) });

    expect(res.status).toBe(404);
    expect(prisma.opportunity.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to "Untitled"/"ConceptNote" when the opportunity no longer resolves, instead of throwing', async () => {
    vi.mocked(auth).mockResolvedValue({ tenantId: 'tenant_1' } as never);
    vi.mocked(prisma.conceptNote.findFirst).mockResolvedValue(
      partialRow<ConceptNote>({
        id: 'note_1',
        templateId: 'tpl_1',
        opportunityId: 'gone',
        content: {},
      })
    );
    vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.conceptTemplate.findUnique).mockResolvedValue(
      partialRow<ConceptTemplate>({
        id: 'tpl_1',
        name: 'Standard Template',
        schema: { sections: [] },
      })
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'note_1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('ConceptNote');
  });

  it('returns 401 without touching the database when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'note_1' }) });

    expect(res.status).toBe(401);
    expect(prisma.conceptNote.findFirst).not.toHaveBeenCalled();
  });
});
