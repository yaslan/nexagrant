import { describe, test, expect, vi, beforeEach } from 'vitest';

import { calendarErrorCode, SELF_SERVE_PROVIDERS } from '@/lib/calendar/errors';

/**
 * TASK-MTQUTBH8Q9VMK — "the calendar connect flow is never visible".
 *
 * `connectCalendar` used to write a `CalendarConnection` row with
 * `isConnected: false`, no token and no external id, and return
 * `{ success: true }` — a connection that could never carry an event, recorded
 * as a success. (The settings screen never even called it: its Connect button
 * was a `console.log` and a `TODO`.)
 *
 * Both halves are pinned here: a provider that genuinely works must connect,
 * and one whose OAuth client does not exist must be refused with a code the UI
 * can translate — not stored as a half-connection.
 */

const { requireTenantActionMock, findUniqueMock, createMock, deleteMock } = vi.hoisted(() => ({
  requireTenantActionMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: requireTenantActionMock,
  TenantScopeError: class TenantScopeError extends Error {},
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    calendarConnection: {
      findUnique: findUniqueMock,
      create: createMock,
      delete: deleteMock,
    },
  },
}));

const { connectCalendar, disconnectCalendar } = await import(
  '@/modules/m9/server/calendar-actions'
);

beforeEach(() => {
  requireTenantActionMock.mockReset().mockResolvedValue({
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'PIPELINE_MANAGER',
    workspaceIds: [],
    isPlatformAdmin: false,
  });
  findUniqueMock.mockReset().mockResolvedValue(null);
  createMock.mockReset().mockImplementation(async ({ data }: { data: { isConnected: boolean } }) => ({
    id: 'conn-1',
    ...data,
  }));
  deleteMock.mockReset().mockResolvedValue({});
});

describe('connectCalendar', () => {
  test('connects .ics, which needs no authorisation, and says so truthfully', async () => {
    const result = await connectCalendar('ics');

    expect(result).toEqual({ connectionId: 'conn-1', provider: 'ics', isConnected: true });
    // The row written matches what was returned. It used to be `isConnected:
    // false` under a `{ success: true }`.
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'ics',
        isConnected: true,
      }),
    });
  });

  test.each(['google', 'outlook'])(
    'refuses %s instead of storing a connection that can never carry an event',
    async (provider) => {
      await expect(connectCalendar(provider)).rejects.toThrow('CALENDAR_OAUTH_NOT_CONFIGURED');
      expect(createMock).not.toHaveBeenCalled();
    }
  );

  test('rejects an unknown provider rather than writing an unrecognised row', async () => {
    await expect(connectCalendar('fantasy-cal')).rejects.toThrow('CALENDAR_UNKNOWN_PROVIDER');
    expect(createMock).not.toHaveBeenCalled();
  });

  test('refuses a second connection for the same tenant, user and provider', async () => {
    findUniqueMock.mockResolvedValue({ id: 'conn-existing' });
    await expect(connectCalendar('ics')).rejects.toThrow('CALENDAR_ALREADY_CONNECTED');
    expect(createMock).not.toHaveBeenCalled();
  });

  test('scopes the uniqueness check to the session tenant and user', async () => {
    await connectCalendar('ics');
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: {
        tenantId_userId_provider: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          provider: 'ics',
        },
      },
    });
  });
});

describe('disconnectCalendar', () => {
  test("refuses another tenant's connection with a translatable code", async () => {
    findUniqueMock.mockResolvedValue({
      id: 'conn-1',
      tenantId: 'other-tenant',
      userId: 'user-1',
    });

    await expect(disconnectCalendar('conn-1')).rejects.toThrow('CALENDAR_FORBIDDEN');
    expect(deleteMock).not.toHaveBeenCalled();
  });

  test('reports a missing connection as missing', async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(disconnectCalendar('conn-gone')).rejects.toThrow(
      'CALENDAR_CONNECTION_NOT_FOUND'
    );
  });
});

describe('calendarErrorCode', () => {
  test('reads the code back out of a Server Action error', () => {
    // Next.js serialises the throw, so the class does not survive the boundary;
    // only the message does. The client translates on the code, never on prose.
    expect(calendarErrorCode(new Error('CALENDAR_OAUTH_NOT_CONFIGURED'))).toBe(
      'CALENDAR_OAUTH_NOT_CONFIGURED'
    );
  });

  test('leaves an unrecognised failure unrecognised', () => {
    // A generic message must not be mapped onto a plausible specific one.
    expect(calendarErrorCode(new Error('ECONNREFUSED'))).toBeNull();
    expect(calendarErrorCode(undefined)).toBeNull();
  });
});

describe('SELF_SERVE_PROVIDERS', () => {
  test('lists only what this deployment can actually connect', () => {
    // Google and Outlook have no OAuth client and no callback route
    // (`find src/app/api -ipath '*calendar*'` is empty). When either gains one,
    // this list is where it is added — and this test is what makes that a
    // deliberate change.
    expect([...SELF_SERVE_PROVIDERS]).toEqual(['ics']);
  });
});
