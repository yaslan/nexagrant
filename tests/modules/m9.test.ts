import { describe, test, expect, vi } from 'vitest';
import { generateMeetingBrief, savePostMeetingNotes } from '../../src/modules/m9/server/actions';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    creditLedger: {
      create: vi.fn().mockResolvedValue({ id: 'ledger-1' }),
    },
    meetingBrief: {
      upsert: vi.fn().mockImplementation(async ({ create }) => ({
        id: 'brief-123',
        tenantId: create.tenantId,
        interactionId: create.interactionId,
        content: create.content,
        createdAt: new Date(),
      })),
      findUnique: vi.fn().mockResolvedValue({
        id: 'brief-123',
        content: '### Initial Brief Content',
      }),
      update: vi.fn().mockResolvedValue({
        id: 'brief-123',
        content: '### Initial Brief Content\n\n---\n### Toplantı Sonrası Notlar',
      }),
    },
  },
}));

vi.mock('../../src/lib/ai/llm', () => ({
  generateText: vi.fn().mockResolvedValue(`### 1. Partner Background & EU Track Record
- Mock partner background output.
### 4. 3 Strategic Questions to Ask in Meeting
1. Strategic Question 1`),
}));

describe('M9 Meeting Briefs Module', () => {
  test('generateMeetingBrief returns formatted brief content', async () => {
    const result = await generateMeetingBrief({
      interactionId: 'int-123',
      partnerName: 'Fraunhofer Institute',
      callTopic: 'HORIZON-CL5-2026-D3-01',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.brief).toBeDefined();
    expect(result.brief.content).toContain('Partner Background');
  });

  test('savePostMeetingNotes formats and appends post-meeting decisions and action items', async () => {
    const result = await savePostMeetingNotes({
      briefId: 'brief-123',
      partnerName: 'Fraunhofer Institute',
      notes: 'Agreed on WP3 leadership and 16 PM effort.',
      decisions: 'NDA will be signed next week.',
      actionItems: ['Prepare NDA draft by Friday', 'Send WP3 effort matrix'],
      nextMeetingDate: '2026-09-15',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.formattedPostNotes).toContain('Toplantı Sonrası Notlar & Alınan Kararlar');
    expect(result.formattedPostNotes).toContain('Prepare NDA draft by Friday');
    expect(result.formattedPostNotes).toContain('2026-09-15');
  });
});
