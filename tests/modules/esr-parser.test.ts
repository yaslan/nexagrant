import { describe, test, expect, vi, beforeEach } from 'vitest';
import { parseEsrDocumentText, extractAndSaveEsrScores } from '../../src/modules/m6/server/esr-parser';

const h = vi.hoisted(() => ({
  generateText: vi.fn(),
  requireTenantAction: vi.fn(),
  proposalFindFirst: vi.fn(),
  proposalUpdate: vi.fn(),
}));

vi.mock('../../src/lib/llm', () => ({
  generateText: h.generateText,
}));

vi.mock('../../src/lib/tenant', () => ({
  requireTenantAction: h.requireTenantAction,
}));

vi.mock('../../src/lib/db', () => ({
  prisma: {},
  withTenant: vi.fn(async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      proposal: {
        findFirst: h.proposalFindFirst,
        update: h.proposalUpdate,
      },
    })
  ),
}));

describe('ESR AI Document Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireTenantAction.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1' });
    h.proposalFindFirst.mockResolvedValue({ id: 'prop-1' });
    h.proposalUpdate.mockResolvedValue({ id: 'prop-1' });
  });

  test('parseEsrDocumentText extracts structured ESR scores from text', async () => {
    const mockJson = JSON.stringify({
      excellence: 4.5,
      impact: 4.0,
      implementation: 4.5,
      total: 13.0,
      threshold: 10.0,
      passed: true,
      strengths: ['Strong consortium', 'Clear methodology'],
      weaknesses: ['Minor risk table gaps'],
    });

    h.generateText.mockResolvedValue(mockJson);

    const esrText = 'Evaluation Summary Report. Excellence: 4.5. Impact: 4.0. Implementation: 4.5. Total: 13.0';
    const result = await parseEsrDocumentText(esrText, 'tenant-1');

    expect(result.excellence).toBe(4.5);
    expect(result.impact).toBe(4.0);
    expect(result.implementation).toBe(4.5);
    expect(result.total).toBe(13.0);
    expect(result.passed).toBe(true);
    expect(result.strengths.length).toBe(2);
  });

  test('parseEsrDocumentText rejects empty ESR text', async () => {
    await expect(parseEsrDocumentText('')).rejects.toThrow(/empty/i);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  test('extractAndSaveEsrScores parses document and updates Proposal.esrScores in DB', async () => {
    const mockJson = JSON.stringify({
      excellence: 4.0,
      impact: 4.0,
      implementation: 4.0,
      total: 12.0,
      threshold: 10.0,
      passed: true,
      strengths: ['Solid proposal'],
      weaknesses: [],
    });

    h.generateText.mockResolvedValue(mockJson);

    const scores = await extractAndSaveEsrScores('prop-1', 'ESR text content here...', 'tenant-1');

    expect(scores.total).toBe(12.0);
    expect(h.proposalFindFirst).toHaveBeenCalledWith({
      where: { id: 'prop-1', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(h.proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop-1' },
        data: expect.objectContaining({
          outcome: 'above_threshold',
        }),
      })
    );
  });
});
