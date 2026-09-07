import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncMeetingBriefToCalendar } from '../sync';
import { buildAlertRow, type RecordAlertInput } from '@/lib/observability/system-alert';
import { createDbClient } from '@/lib/db';
import type { TenantTx } from '@/lib/db';

const recordAlert = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({ status: 'recorded' as const, id: 'a1' }))
);
const createEvent = vi.hoisted(() => vi.fn(async (_event: unknown) => ({ externalId: 'ext:1' })));
vi.mock('../factory', () => ({ createCalendarProvider: () => ({ createEvent }) }));
vi.mock('@/lib/observability/system-alert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/system-alert')>()),
  recordAlert,
}));

/** Closed port: Prisma validates arguments before it uses the connection. */
const UNREACHABLE_DB = 'postgresql://nobody:nobody@127.0.0.1:1/does-not-exist';

async function rejectionKind(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'none';
  } catch (error) {
    return (error as object).constructor.name;
  }
}

function scheduledBrief(overrides: Partial<{ partnerName: string | null; content: string }> = {}) {
  return {
    id: 'brief:1',
    partnerName: 'Test Partner',
    content: 'Test content',
    meetingScheduledAt: new Date('2026-09-15T10:00:00Z'),
    meetingScheduledTz: 'Europe/Brussels',
    ...overrides,
  };
}

describe('syncMeetingBriefToCalendar', () => {
  let mockTx: Partial<TenantTx>;

  beforeEach(() => {
    recordAlert.mockClear();
    createEvent.mockClear();
    mockTx = {
      calendarConnection: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      systemAlert: {
        create: vi.fn(),
      },
    };
  });

  it('should skip sync if no meeting scheduled', async () => {
    const brief = {
      id: 'brief:1',
      partnerName: 'Test Partner',
      content: 'Test content',
      meetingScheduledAt: null,
      meetingScheduledTz: 'Europe/Brussels',
    };

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', brief);

    expect(mockTx.calendarConnection.findMany).not.toHaveBeenCalled();
  });

  it('should skip sync if no connected calendars', async () => {
    mockTx.calendarConnection.findMany.mockResolvedValue([]);

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', scheduledBrief());

    expect(mockTx.calendarConnection.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant:1',
        userId: 'user:1',
        isConnected: true,
      },
    });
    expect(mockTx.calendarConnection.update).not.toHaveBeenCalled();
  });

  it('should sync brief to all connected calendars', async () => {
    mockTx.calendarConnection.findMany.mockResolvedValue([
      { id: 'conn:1', provider: 'ics', tenantId: 'tenant:1', userId: 'user:1', isConnected: true },
      { id: 'conn:2', provider: 'google', tenantId: 'tenant:1', userId: 'user:1', isConnected: true },
    ]);
    mockTx.calendarConnection.update.mockResolvedValue({});

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', scheduledBrief());

    expect(mockTx.calendarConnection.update).toHaveBeenCalledTimes(2);
    expect(mockTx.calendarConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn:1' },
        data: expect.objectContaining({ lastSyncAt: expect.any(Date) }),
      })
    );
    expect(recordAlert).not.toHaveBeenCalled();
  });

  it('should handle sync for brief with content truncation', async () => {
    mockTx.calendarConnection.findMany.mockResolvedValue([
      { id: 'conn:1', provider: 'ics', tenantId: 'tenant:1', userId: 'user:1', isConnected: true },
    ]);
    mockTx.calendarConnection.update.mockResolvedValue({});

    await syncMeetingBriefToCalendar(
      mockTx,
      'tenant:1',
      'user:1',
      scheduledBrief({ content: 'A'.repeat(1000) })
    );

    expect(mockTx.calendarConnection.update).toHaveBeenCalled();
  });

  describe('on sync error', () => {
    beforeEach(() => {
      mockTx.calendarConnection.findMany.mockResolvedValue([
        { id: 'conn:1', provider: 'google', tenantId: 'tenant:1', userId: 'user:1', isConnected: true },
      ]);
      mockTx.calendarConnection.update.mockRejectedValue(new Error('OAuth token expired'));
    });

    it('records the failure and does not throw', async () => {
      await expect(
        syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', scheduledBrief())
      ).resolves.toBeUndefined();

      expect(recordAlert).toHaveBeenCalledTimes(1);
      expect(recordAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          source: 'calendar_sync_failed',
          message: expect.stringContaining('OAuth token expired'),
          meta: expect.objectContaining({ module: 'M9', briefId: 'brief:1', provider: 'google' }),
        })
      );
    });

    it('keeps tenant identifiers out of a table that has no RLS policy', async () => {
      await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', scheduledBrief());

      const { meta } = recordAlert.mock.calls[0]![0] as RecordAlertInput;
      expect(meta).not.toHaveProperty('tenantId');
      expect(meta).not.toHaveProperty('userId');
      expect(JSON.stringify(meta)).not.toContain('tenant:1');
      expect(JSON.stringify(meta)).not.toContain('user:1');
    });

    /**
     * The regression that made this whole test file lie. The alert used to be
     * written as `{ severity, type, sourceModule, metadata }` — columns that do
     * not exist on `SystemAlert` — so every write threw
     * PrismaClientValidationError and no calendar failure was ever recorded.
     * The old mocked assertion passed anyway. This one asks the real client.
     */
    it('produces a row the real SystemAlert schema accepts', async () => {
      const db = createDbClient(UNREACHABLE_DB);

      await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', scheduledBrief());
      const input = recordAlert.mock.calls[0]![0] as RecordAlertInput;

      const accepted = await rejectionKind(() =>
        db.systemAlert.create({ data: buildAlertRow(input) })
      );
      expect(accepted).not.toBe('PrismaClientValidationError');

      // Negative control: the shape this code used to write is still rejected.
      const oldShape = await rejectionKind(() =>
        db.systemAlert.create({
          data: {
            severity: 'warning',
            type: 'calendar_sync_failed',
            message: input.message,
            sourceModule: 'M9',
            metadata: {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        })
      );
      expect(oldShape).toBe('PrismaClientValidationError');
    });
  });

  describe('event title', () => {
    beforeEach(() => {
      mockTx.calendarConnection.findMany.mockResolvedValue([
        { id: 'conn:1', provider: 'ics', tenantId: 'tenant:1', userId: 'user:1', isConnected: true },
      ]);
      mockTx.calendarConnection.update.mockResolvedValue({});
    });

    it('names the partner when there is one', async () => {
      await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', scheduledBrief());

      expect(createEvent.mock.calls[0]![0]).toMatchObject({ title: 'Meeting: Test Partner' });
    });

    // partnerName is a nullable column, and the template literal rendered the
    // string "Meeting: null" onto the user's real calendar.
    it('does not put "null" on the calendar for an unnamed partner', async () => {
      await syncMeetingBriefToCalendar(
        mockTx,
        'tenant:1',
        'user:1',
        scheduledBrief({ partnerName: null })
      );

      const event = createEvent.mock.calls[0]![0] as { title: string };
      expect(event.title).toBe('Meeting');
      expect(event.title).not.toContain('null');
      expect(recordAlert).not.toHaveBeenCalled();
    });
  });
});
