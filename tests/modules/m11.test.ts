import { describe, test, expect, vi } from 'vitest';
import {
  createApplicationPart,
  addBudgetLine,
  addWorkPackage,
  calculateLumpSumBudget,
  acquireSectionLock,
  releaseSectionLock,
  updateSectionContent,
  addSectionComment,
  resolveSectionComment,
  restoreSectionRevision,
  updatePresenceHeartbeat,
  generateSectionDraftAi,
} from '../../src/modules/m11/server/actions';
import { DEFAULT_PART_B_SECTIONS } from '../../src/modules/m11/types';

let mockPartStore: any = {
  id: 'part-111',
  tenantId: 'tenant-11',
  opportunityId: 'opp-11',
  part: 'PART_B',
  magicToken: 'tok-123',
  content: {
    budget: [],
    workPackages: [],
    sections: [...DEFAULT_PART_B_SECTIONS],
    revisions: [],
    comments: [],
    presence: [],
  },
};

vi.mock('../../src/lib/db', () => ({
  prisma: {
    applicationPart: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        mockPartStore = {
          id: 'part-111',
          tenantId: data.tenantId,
          opportunityId: data.opportunityId,
          part: data.part,
          magicToken: data.magicToken,
          content: data.content,
        };
        return mockPartStore;
      }),
      findUnique: vi.fn().mockImplementation(async () => mockPartStore),
      update: vi.fn().mockImplementation(async ({ data }) => {
        mockPartStore.content = data.content;
        return mockPartStore;
      }),
    },
  },
}));

describe('M11 Application Production & Collaborative Editing Module', () => {
  test('createApplicationPart creates Part B with standard 8 Horizon Europe sections', async () => {
    const part = await createApplicationPart('opp-11', 'tenant-11', 'PART_B');
    expect(part).toBeDefined();
    expect(part.part).toBe('PART_B');
    expect(part.content.sections).toHaveLength(8);
  });

  test('calculateLumpSumBudget computes 25% overhead and direct personnel cost', async () => {
    const total = await calculateLumpSumBudget(12, 1.0, 0, 2000);
    // Base 5500 * 12 = 66000 direct personnel. Travel 2000. Overhead (66000 + 2000) * 0.25 = 17000. Total = 85000
    expect(total).toBe(85000);
  });

  test('acquireSectionLock acquires exclusive lock for active author', async () => {
    const lockRes = await acquireSectionLock(
      'part-111',
      '1.1_objectives',
      'usr-me',
      'Dr. Mehmet Yılmaz',
      'Fabrika Ar-Ge'
    );
    expect(lockRes.success).toBe(true);

    // Another user tries to lock within 60s
    const secondLock = await acquireSectionLock(
      'part-111',
      '1.1_objectives',
      'usr-klaus',
      'Prof. Klaus Müller',
      'Fraunhofer Institute'
    );
    expect(secondLock.success).toBe(false);
  });

  test('releaseSectionLock frees lock for other co-authors', async () => {
    const unlockRes = await releaseSectionLock('part-111', '1.1_objectives', 'usr-me');
    expect(unlockRes.success).toBe(true);
  });

  test('updateSectionContent saves content and records timestamped revision history', async () => {
    const updateRes = await updateSectionContent(
      'part-111',
      '1.1_objectives',
      'Updated section 1.1 text with new SMART objectives and TRL 7 progression notes.',
      'usr-me',
      'Dr. Mehmet Yılmaz',
      'Fabrika Ar-Ge'
    );
    expect(updateRes.success).toBe(true);
    expect(updateRes.wordCount).toBeGreaterThan(5);
    expect(mockPartStore.content.revisions.length).toBeGreaterThan(0);
  });

  test('addSectionComment and resolveSectionComment manage review threads', async () => {
    const comment = await addSectionComment(
      'part-111',
      '1.1_objectives',
      'Prof. Klaus Müller',
      'Fraunhofer Institute',
      'Lütfen SO3 demo sahalarını netleştirin.'
    );
    expect(comment.id).toBeDefined();
    expect(comment.resolved).toBe(false);

    const resolveRes = await resolveSectionComment('part-111', '1.1_objectives', comment.id);
    expect(resolveRes.success).toBe(true);
    expect(mockPartStore.content.comments[0].resolved).toBe(true);
  });

  test('restoreSectionRevision restores earlier snapshot content', async () => {
    const revId = mockPartStore.content.revisions[0].id;
    const restoreRes = await restoreSectionRevision('part-111', '1.1_objectives', revId);
    expect(restoreRes.success).toBe(true);
  });

  test('updatePresenceHeartbeat registers active co-author session', async () => {
    const presence = await updatePresenceHeartbeat(
      'part-111',
      'usr-sofia',
      'Dr. Sofia Rossi',
      'Politecnico di Milano',
      '2.1_pathways'
    );
    expect(presence.length).toBeGreaterThan(0);
    const sofia = presence.find((p: any) => p.userId === 'usr-sofia');
    expect(sofia).toBeDefined();
    expect(sofia?.activeSection).toBe('2.1_pathways');
  });

  test('generateSectionDraftAi generates Horizon Europe evaluator-aligned structure', async () => {
    const draft = await generateSectionDraftAi(
      'part-111',
      '1.1_objectives',
      '1.1 Objectives and Ambition',
      'Zero-Emission Thermal Batteries'
    );
    expect(draft).toContain('Strategic Relevance');
    expect(draft).toContain('Beyond State-of-the-Art');
    expect(draft).toContain('KPI-1');
  });
});

