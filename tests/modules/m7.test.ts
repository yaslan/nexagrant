import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createTtoItem, matchTtoItemToCalls, generateIpChecklist } from '../../src/modules/m7/server/actions';
import {
  resetScope,
  setScope,
  FakeTenantScopeError,
  FakeModuleAccessError,
  setModuleOpen,
  resetModuleAccess,
} from '../helpers/tenant-scope-mock';
import { generateText } from '../../src/lib/llm';

const h = vi.hoisted(() => ({
  ttoCreate: vi.fn(),
  ttoFindFirst: vi.fn(),
  locale: 'tr' as 'tr' | 'en',
}));

vi.mock('../../src/lib/ai/prompts/locale', () => ({
  promptLocale: async () => h.locale,
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
    resetModuleAccess();
    vi.clearAllMocks();
    h.locale = 'tr';
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

  test('matchTtoItemToCalls returns no matches (matching not yet implemented)', async () => {
    const res = await matchTtoItemToCalls('tto-123');
    expect(res.matchedTopics).toEqual([]);
    expect(h.ttoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tto-123', tenantId: 'tenant-1' } })
    );
  });

  test('matchTtoItemToCalls returns nothing for an item outside the tenant', async () => {
    h.ttoFindFirst.mockResolvedValue(null);

    const res = await matchTtoItemToCalls('tto-from-other-tenant');
    expect(res.matchedTopics).toEqual([]);
  });

  // TASK-MUUS5HE3OW0CT — both actions are public POST endpoints; the page gate
  // does not cover a direct call with M7 off or outside the plan.
  test('createTtoItem refuses before writing when M7 is closed', async () => {
    setModuleOpen(false);

    await expect(
      createTtoItem({ title: 'Gated', trl: 5, patentStatus: 'granted', summary: '', keywords: [] })
    ).rejects.toBeInstanceOf(FakeModuleAccessError);
    expect(h.ttoCreate).not.toHaveBeenCalled();
  });

  test('matchTtoItemToCalls refuses before reading when M7 is closed', async () => {
    setModuleOpen(false);

    await expect(matchTtoItemToCalls('tto-123')).rejects.toBeInstanceOf(FakeModuleAccessError);
    expect(h.ttoFindFirst).not.toHaveBeenCalled();
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

  // TASK-MUN4PSBP19RKK — the catch below the LLM call swaps ANY failure for a
  // canned checklist. A cut-off or declined answer must not be dressed up as
  // one: it reaches the screen with its digest instead.
  test.each(['LLM_TRUNCATED', 'LLM_REFUSED'])('generateIpChecklist rethrows %s instead of the canned list', async (digest) => {
    const outcome = Object.assign(new Error('unusable'), { digest });
    vi.mocked(generateText).mockRejectedValueOnce(outcome);

    await expect(
      generateIpChecklist({ title: 'Solid State Battery Sensor', trl: 5, patentStatus: 'granted' })
    ).rejects.toBe(outcome);
  });

  // The canned list is UI copy: an English user used to get it in Turkish.
  test.each([
    ['tr', 'TTO IP & Lisanslama Kontrol Listesi', "TRL 5'den TRL 7 seviyesine"],
    ['en', 'TTO IP & licensing checklist', 'from TRL 5 to TRL 7'],
  ] as const)('generateIpChecklist fallback is written in the user locale (%s)', async (locale, heading, roadmap) => {
    h.locale = locale;
    vi.mocked(generateText).mockRejectedValueOnce(new Error('provider down'));

    const res = await generateIpChecklist({ title: 'Solid State Battery Sensor', trl: 5, patentStatus: 'granted' });

    expect(res.checklistContent).toContain(heading);
    expect(res.checklistContent).toContain('(GRANTED)');
    expect(res.checklistContent).toContain(roadmap);
    // Every ICU argument was filled; none leaks to the screen as `{trl}`.
    expect(res.checklistContent).not.toMatch(/[{}]/);
  });

  test('generateIpChecklist fallback caps the target TRL at 9', async () => {
    h.locale = 'en';
    vi.mocked(generateText).mockRejectedValueOnce(new Error('provider down'));

    const res = await generateIpChecklist({ title: 'Mature', trl: 8, patentStatus: 'licensed' });

    expect(res.checklistContent).toContain('from TRL 8 to TRL 9');
  });
});
