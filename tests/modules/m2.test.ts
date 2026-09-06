import { describe, test, expect, vi } from 'vitest';
import { generateAiUsageDeclaration } from '../../src/modules/m2/server/actions';
import { prisma } from '../../src/lib/db';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    aiUsageLog: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'log-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          module: 'M2',
          purpose: 'Drafting section: excellence',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          promptHash: 'abcdef123456',
          inputTokens: 1200,
          outputTokens: 450,
          credits: 5,
          proposalId: 'opp-1',
          section: 'excellence',
          createdAt: new Date('2026-09-03T10:00:00Z')
        }
      ])
    }
  }
}));

describe('M2 Server Actions', () => {
  test('generateAiUsageDeclaration generates formatted EU ethics compliance declaration', async () => {
    const result = await generateAiUsageDeclaration('opp-1', 'tenant-1');
    expect(result.logsCount).toBe(1);
    expect(result.totalInputTokens).toBe(1200);
    expect(result.totalOutputTokens).toBe(450);
    expect(result.totalCredits).toBe(5);
    expect(result.declarationMarkdown).toContain('Artificial Intelligence Usage & Transparency Declaration');
    expect(result.declarationMarkdown).toContain('claude-3-5-sonnet');
  });
});
