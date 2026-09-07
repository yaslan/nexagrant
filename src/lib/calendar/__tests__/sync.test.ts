import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncMeetingBriefToCalendar } from '../sync';
import type { TenantTx } from '@/lib/db';

describe('syncMeetingBriefToCalendar', () => {
  let mockTx: Partial<TenantTx>;

  beforeEach(() => {
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

    const brief = {
      id: 'brief:1',
      partnerName: 'Test Partner',
      content: 'Test content',
      meetingScheduledAt: new Date('2026-09-15T10:00:00Z'),
      meetingScheduledTz: 'Europe/Brussels',
    };

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', brief);

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
      {
        id: 'conn:1',
        provider: 'ics',
        tenantId: 'tenant:1',
        userId: 'user:1',
        isConnected: true,
      },
      {
        id: 'conn:2',
        provider: 'google',
        tenantId: 'tenant:1',
        userId: 'user:1',
        isConnected: true,
      },
    ]);

    mockTx.calendarConnection.update.mockResolvedValue({});

    const brief = {
      id: 'brief:1',
      partnerName: 'Test Partner',
      content: 'Test brief content for meeting preparation',
      meetingScheduledAt: new Date('2026-09-15T10:00:00Z'),
      meetingScheduledTz: 'Europe/Brussels',
    };

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', brief);

    // Should update both connections
    expect(mockTx.calendarConnection.update).toHaveBeenCalledTimes(2);
    expect(mockTx.calendarConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn:1' },
        data: expect.objectContaining({
          lastSyncAt: expect.any(Date),
        }),
      })
    );
  });

  it('should create SystemAlert on sync error', async () => {
    mockTx.calendarConnection.findMany.mockResolvedValue([
      {
        id: 'conn:1',
        provider: 'google',
        tenantId: 'tenant:1',
        userId: 'user:1',
        isConnected: true,
      },
    ]);

    mockTx.calendarConnection.update.mockRejectedValue(new Error('OAuth token expired'));
    mockTx.systemAlert.create.mockResolvedValue({});

    const brief = {
      id: 'brief:1',
      partnerName: 'Test Partner',
      content: 'Test content',
      meetingScheduledAt: new Date('2026-09-15T10:00:00Z'),
      meetingScheduledTz: 'Europe/Brussels',
    };

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', brief);

    // Should create a system alert instead of throwing
    expect(mockTx.systemAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'calendar_sync_failed',
          severity: 'warning',
          sourceModule: 'M9',
        }),
      })
    );
  });

  it('should handle sync for brief with content truncation', async () => {
    mockTx.calendarConnection.findMany.mockResolvedValue([
      {
        id: 'conn:1',
        provider: 'ics',
        tenantId: 'tenant:1',
        userId: 'user:1',
        isConnected: true,
      },
    ]);

    mockTx.calendarConnection.update.mockResolvedValue({});

    const brief = {
      id: 'brief:1',
      partnerName: 'Test Partner',
      content: 'A'.repeat(1000), // Long content
      meetingScheduledAt: new Date('2026-09-15T10:00:00Z'),
      meetingScheduledTz: 'Europe/Brussels',
    };

    await syncMeetingBriefToCalendar(mockTx, 'tenant:1', 'user:1', brief);

    // Should still update the connection
    expect(mockTx.calendarConnection.update).toHaveBeenCalled();
  });
});
