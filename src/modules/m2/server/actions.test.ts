import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConceptNote, ConceptTemplate, Opportunity, Topic } from '@prisma/client';
import { partialRow } from '../../../../tests/helpers/partial-row';

/**
 * Regression tests for TASK-MTRKV25PNBHPX: `Opportunity.topic` and
 * `ConceptNote.opportunity` are not relations in prisma/schema.prisma (only
 * the plain `topicId` / `opportunityId` scalar columns exist), so
 * `include: { topic: true }` / `include: { opportunity: true }` throw
 * PrismaClientValidationError at runtime. When these were written `pnpm
 * typecheck` passed anyway, because src/types/prisma-override.d.ts widened the
 * delegates to `any`; that override is gone (TASK-MTSJHTJZSCILI) and the
 * generated types now reject a phantom include on their own. The tests stay:
 * they assert the queries never request those includes, and that the separate
 * lookups they were replaced with are wired correctly.
 */

const mockPrisma = vi.hoisted(() => ({
  opportunity: { findFirst: vi.fn() },
  topic: { findUnique: vi.fn() },
  conceptTemplate: { findUnique: vi.fn() },
  conceptNote: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  aiUsageLog: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  withTenant: (_tenantId: string, callback: (tx: typeof mockPrisma) => unknown) =>
    callback(mockPrisma),
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn().mockResolvedValue({ tenantId: 'tenant_1', userId: 'user_1' }),
}));

vi.mock('@/lib/llm', () => ({
  generateText: vi.fn().mockResolvedValue('generated section text'),
}));

vi.mock('@/lib/modules/access', async () => {
  const m = await import('../../../../tests/helpers/tenant-scope-mock');
  return m.moduleAccessStub();
});

vi.mock('@/lib/rag', () => ({
  retrieveChunks: vi.fn().mockResolvedValue([]),
}));

import { generateConceptNoteDraft, exportToDocx } from './actions';
import { prisma } from '@/lib/db';
import { retrieveChunks } from '@/lib/rag';

describe('m2 actions — phantom relation regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateConceptNoteDraft', () => {
    it('fetches the opportunity without `include: { topic: true }` and looks up the topic separately', async () => {
      vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(
        partialRow<Opportunity>({
          id: 'opp_1',
          title: 'Smart Grids for Rural Regions',
          topicId: 'topic_1',
        })
      );
      vi.mocked(prisma.topic.findUnique).mockResolvedValue(
        partialRow<Topic>({
          title: 'HORIZON-CL5-2026',
          identifier: 'HORIZON-CL5-2026-09-D4-01',
        })
      );
      vi.mocked(prisma.conceptTemplate.findUnique).mockResolvedValue(
        partialRow<ConceptTemplate>({
          id: 'tpl_1',
          schema: [
            { key: 'summary', labelKey: 'Summary', maxWords: 100, promptKey: 'Write a summary' },
          ],
        })
      );
      vi.mocked(prisma.conceptNote.create).mockResolvedValue(
        partialRow<ConceptNote>({ id: 'note_1' })
      );

      const noteId = await generateConceptNoteDraft('opp_1', 'tpl_1', {});

      expect(noteId).toBe('note_1');

      const findFirstArgs = vi.mocked(prisma.opportunity.findFirst).mock.calls[0]?.[0];
      expect(findFirstArgs).not.toHaveProperty('include');
      expect(findFirstArgs?.where).toEqual({ id: 'opp_1', tenantId: 'tenant_1' });

      expect(prisma.topic.findUnique).toHaveBeenCalledWith({
        where: { id: 'topic_1' },
        select: { title: true, identifier: true },
      });

      // the topic's title reached the RAG search and the generated prompt
      const ragCall = vi.mocked(retrieveChunks).mock.calls[0];
      expect(ragCall, 'retrieveChunks was never called').toBeDefined();
      expect(ragCall?.[0]).toContain('HORIZON-CL5-2026');
    });

    it('skips the topic lookup and still drafts when the opportunity has no topicId', async () => {
      vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(
        partialRow<Opportunity>({
          id: 'opp_2',
          title: 'Untitled idea',
          topicId: null,
        })
      );
      vi.mocked(prisma.conceptTemplate.findUnique).mockResolvedValue(
        partialRow<ConceptTemplate>({
          id: 'tpl_1',
          schema: [
            { key: 'summary', labelKey: 'Summary', maxWords: 100, promptKey: 'Write a summary' },
          ],
        })
      );
      vi.mocked(prisma.conceptNote.create).mockResolvedValue(
        partialRow<ConceptNote>({ id: 'note_2' })
      );

      const noteId = await generateConceptNoteDraft('opp_2', 'tpl_1', {});

      expect(noteId).toBe('note_2');
      expect(prisma.topic.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the opportunity does not exist, without ever calling Prisma with a phantom include', async () => {
      vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(null);

      await expect(generateConceptNoteDraft('missing', 'tpl_1', {})).rejects.toThrow('Opportunity not found');
    });
  });

  describe('exportToDocx', () => {
    it('fetches the note without `include: { opportunity: true }` and looks up the opportunity separately', async () => {
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
          schema: [{ key: 'summary', labelKey: 'Summary', maxWords: 100, promptKey: 'x' }],
        })
      );

      const base64 = await exportToDocx('note_1');

      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);

      const noteFindCall = vi.mocked(prisma.conceptNote.findFirst).mock.calls[0];
      expect(noteFindCall, 'conceptNote.findFirst was never called').toBeDefined();
      const noteFindArgs = noteFindCall?.[0];
      // Without this the next assertion would pass on `undefined` — nothing has
      // the property "include", least of all a call that never happened.
      expect(noteFindArgs).toBeDefined();
      expect(noteFindArgs).not.toHaveProperty('include');

      expect(prisma.opportunity.findFirst).toHaveBeenCalledWith({
        where: { id: 'opp_1', tenantId: 'tenant_1' },
        select: { title: true },
      });
    });

    it('throws a clear error when the note references an opportunity that no longer resolves', async () => {
      vi.mocked(prisma.conceptNote.findFirst).mockResolvedValue(
        partialRow<ConceptNote>({
          id: 'note_1',
          templateId: 'tpl_1',
          opportunityId: 'gone',
          content: {},
        })
      );
      vi.mocked(prisma.opportunity.findFirst).mockResolvedValue(null);

      await expect(exportToDocx('note_1')).rejects.toThrow('Opportunity not found for concept note');
    });

    it('throws when the note does not exist', async () => {
      vi.mocked(prisma.conceptNote.findFirst).mockResolvedValue(null);

      await expect(exportToDocx('missing')).rejects.toThrow('Note not found');
    });
  });
});
