import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateAiUsageDeclaration } from '../../src/modules/m2/server/actions';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

const h = vi.hoisted(() => ({
  aiUsageLogFindMany: vi.fn(),
}));

vi.mock('../../src/lib/tenant', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.tenantModuleStub();
});

vi.mock('../../src/lib/modules/access', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.moduleAccessStub();
});

vi.mock('../../src/lib/db', async () => {
  const m = await import('../helpers/tenant-scope-mock');
  return m.dbModuleStub({
    aiUsageLog: { findMany: h.aiUsageLogFindMany },
  });
});

describe('M2 Server Actions', () => {
  beforeEach(() => {
    resetScope();
    vi.clearAllMocks();
    h.aiUsageLogFindMany.mockResolvedValue([
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
    ]);
  });

  test('generateAiUsageDeclaration generates formatted EU ethics compliance declaration', async () => {
    const result = await generateAiUsageDeclaration('opp-1');
    expect(result.logsCount).toBe(1);
    expect(result.totalInputTokens).toBe(1200);
    expect(result.totalOutputTokens).toBe(450);
    expect(result.totalCredits).toBe(5);
    expect(result.declarationMarkdown).toContain('Artificial Intelligence Usage & Transparency Declaration');
    expect(result.declarationMarkdown).toContain('claude-3-5-sonnet');
  });

  test('the usage log query is filtered by the session tenant, not a caller-supplied one', async () => {
    await generateAiUsageDeclaration('opp-1');

    expect(h.aiUsageLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', proposalId: 'opp-1' } })
    );
  });

  test('a session with no tenant is refused instead of falling back', async () => {
    setScope(null);

    await expect(generateAiUsageDeclaration('opp-1')).rejects.toBeInstanceOf(FakeTenantScopeError);
    expect(h.aiUsageLogFindMany).not.toHaveBeenCalled();
  });
});
