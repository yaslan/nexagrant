import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createTtoItem, matchTtoItemToCalls, generateIpChecklist } from '../../src/modules/m7/server/actions';
import { resetScope, setScope, FakeTenantScopeError } from '../helpers/tenant-scope-mock';

const h = vi.hoisted(() => ({
  ttoCreate: vi.fn(),
  ttoFindFirst: vi.fn(),
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
    ttoPortfolioItem: { create: h.ttoCreate, findFirst: h.ttoFindFirst },
  });
});

vi.mock('../../src/lib/llm', () => ({
  generateText: vi.fn().mockResolvedValue(`### 📋 TTO IP & Lisanslama Kontrol Listesi\n\nMock IP checklist content.`),
}));

describe('M7 TTO Accelerator Module', () => {
  beforeEach(() => {
    resetScope();
    vi.clearAllMocks();
    h.ttoCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'tto-123',
      tenantId: data.tenantId,
      title: data.title,
      trl: data.trl,
      patentStatus: data.patentStatus,
      summary: data.summary,
      keywords: data.keywords,
    }));
    h.ttoFindFirst.mockResolvedValue({ title: 'Solid State Battery Sensor', trl: 5 });
  });

  test('createTtoItem adds patent portfolio item', async () => {
    const item = await createTtoItem({
      title: 'Solid State Battery Sensor',
      trl: 5,
      patentStatus: 'granted',
      summary: 'Patented EV sensor technology',
      keywords: ['battery', 'sensor'],
    });

    expect(item).toBeDefined();
    expect(item.title).toBe('Solid State Battery Sensor');
    expect(item.trl).toBe(5);
    // The row is stamped with the session tenant, not one named by the caller.
    expect(item.tenantId).toBe('tenant-1');
  });

  test('createTtoItem refuses a session with no tenant instead of using a fallback', async () => {
    setScope(null);

    await expect(
      createTtoItem({
        title: 'Solid State Battery Sensor',
        trl: 5,
        patentStatus: 'granted',
        summary: '',
        keywords: [],
      })
    ).rejects.toBeInstanceOf(FakeTenantScopeError);
    expect(h.ttoCreate).not.toHaveBeenCalled();
  });

  test('matchTtoItemToCalls returns matched topics with fitScore and targetTrlRange', async () => {
    const res = await matchTtoItemToCalls('tto-123');
    expect(res.matchedTopics.length).toBeGreaterThan(0);
    expect(res.matchedTopics[0].fitScore).toBeGreaterThan(50);
    expect(res.matchedTopics[0].targetTrlRange).toBeDefined();
    expect(h.ttoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tto-123', tenantId: 'tenant-1' } })
    );
  });

  test('matchTtoItemToCalls returns nothing for an item outside the tenant', async () => {
    h.ttoFindFirst.mockResolvedValue(null);

    const res = await matchTtoItemToCalls('tto-from-other-tenant');
    expect(res.matchedTopics).toEqual([]);
  });

  test('generateIpChecklist generates tailored TTO IP protection checklist', async () => {
    const res = await generateIpChecklist({
      title: 'Solid State Battery Sensor',
      trl: 5,
      patentStatus: 'granted',
    });

    expect(res.success).toBe(true);
    expect(res.checklistContent).toContain('TTO IP & Lisanslama');
  });
});
