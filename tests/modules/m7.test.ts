import { describe, test, expect, vi } from 'vitest';
import { createTtoItem, matchTtoItemToCalls, generateIpChecklist } from '../../src/modules/m7/server/actions';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    ttoPortfolioItem: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'tto-123',
        tenantId: data.tenantId,
        title: data.title,
        trl: data.trl,
        patentStatus: data.patentStatus,
        summary: data.summary,
        keywords: data.keywords,
      })),
      findUnique: vi.fn().mockResolvedValue({
        id: 'tto-123',
        title: 'Solid State Battery Sensor',
        trl: 5,
        patentStatus: 'granted',
      }),
    },
  },
}));

vi.mock('../../src/lib/ai/llm', () => ({
  generateText: vi.fn().mockResolvedValue(`### 📋 TTO IP & Lisanslama Kontrol Listesi\n\nMock IP checklist content.`),
}));

describe('M7 TTO Accelerator Module', () => {
  test('createTtoItem adds patent portfolio item', async () => {
    const item = await createTtoItem({
      tenantId: 'tenant-1',
      title: 'Solid State Battery Sensor',
      trl: 5,
      patentStatus: 'granted',
      summary: 'Patented EV sensor technology',
      keywords: ['battery', 'sensor'],
    });

    expect(item).toBeDefined();
    expect(item.title).toBe('Solid State Battery Sensor');
    expect(item.trl).toBe(5);
  });

  test('matchTtoItemToCalls returns matched topics with fitScore and targetTrlRange', async () => {
    const res = await matchTtoItemToCalls('tto-123');
    expect(res.matchedTopics.length).toBeGreaterThan(0);
    expect(res.matchedTopics[0].fitScore).toBeGreaterThan(50);
    expect(res.matchedTopics[0].targetTrlRange).toBeDefined();
  });

  test('generateIpChecklist generates tailored TTO IP protection checklist', async () => {
    const res = await generateIpChecklist({
      title: 'Solid State Battery Sensor',
      trl: 5,
      patentStatus: 'granted',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(res.success).toBe(true);
    expect(res.checklistContent).toContain('TTO IP & Lisanslama');
  });
});
