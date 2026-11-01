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

const { requireTenantActionMock, findUniqueMock, createMock, deleteManyMock, withTenantMock } =
  vi.hoisted(() => ({
    requireTenantActionMock: vi.fn(),
    findUniqueMock: vi.fn(),
    createMock: vi.fn(),
    deleteManyMock: vi.fn(),
    withTenantMock: vi.fn(),
  }));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: requireTenantActionMock,
  TenantScopeError: class TenantScopeError extends Error {},
}));
/**
 * `withTenant` is mocked rather than stubbed away, so the tenant id it is
 * called with is observable. Every query below is reached only through the `tx`
 * this mock hands the callback: a call that went back to the bare `prisma`
 * singleton would touch none of these mocks and the assertions would fail —
 * which is what makes "the queries run inside withTenant" a testable claim
 * rather than a comment (TASK-MTVR7W9ZXO7M).
 */
vi.mock('@/lib/db', () => ({
  withTenant: withTenantMock,
}));

const tx = {
  calendarConnection: {
    findUnique: findUniqueMock,
    create: createMock,
    deleteMany: deleteManyMock,
  },
};

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
  deleteManyMock.mockReset().mockResolvedValue({ count: 1 });
  withTenantMock
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    );
});

describe('connectCalendar', () => {
  test('connects .ics, which needs no authorisation, and says so truthfully', async () => {
    const result = await connectCalendar('ics');

    expect(result).toEqual({ ok: true, connectionId: 'conn-1', provider: 'ics', isConnected: true });
    // The row written matches what was returned. It used to be `isConnected:
    // false` under a `{ success: true }`.
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'ics',
        isConnected: true,
      }),
      // The token columns are never read back (TASK-MUMT3KVHJTYX0).
      select: { id: true, isConnected: true },
    });
  });

  test('refuses google instead of storing a connection that can never carry an event', async () => {
    await expect(connectCalendar('google')).resolves.toEqual({
      ok: false,
      code: 'CALENDAR_OAUTH_NOT_CONFIGURED',
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('rejects outlook as an unknown provider (removed, owner decision 29.09)', async () => {
    await expect(connectCalendar('outlook')).resolves.toEqual({ ok: false, code: 'CALENDAR_UNKNOWN_PROVIDER' });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('rejects an unknown provider rather than writing an unrecognised row', async () => {
    await expect(connectCalendar('fantasy-cal')).resolves.toEqual({ ok: false, code: 'CALENDAR_UNKNOWN_PROVIDER' });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('refuses a second connection for the same tenant, user and provider', async () => {
    findUniqueMock.mockResolvedValue({ id: 'conn-existing' });
    await expect(connectCalendar('ics')).resolves.toEqual({ ok: false, code: 'CALENDAR_ALREADY_CONNECTED' });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('runs its read and its write inside withTenant, on the session tenant', async () => {
    await connectCalendar('ics');

    expect(withTenantMock).toHaveBeenCalledTimes(1);
    expect(withTenantMock.mock.calls[0]![0]).toBe('tenant-1');
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
      select: { id: true },
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

    await expect(disconnectCalendar('conn-1')).resolves.toEqual({ ok: false, code: 'CALENDAR_FORBIDDEN' });
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  test('scopes the delete itself to the owner, not just the check before it', async () => {
    findUniqueMock.mockResolvedValue({ id: 'conn-1', tenantId: 'tenant-1', userId: 'user-1' });

    await expect(disconnectCalendar('conn-1')).resolves.toEqual({ ok: true, success: true });

    // The owner travels *with the write*. `delete({ where: { id } })` would
    // pass the JS check above and then delete by id alone (§3.9 of the
    // tenant-bypass inventory).
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { id: 'conn-1', tenantId: 'tenant-1', userId: 'user-1' },
    });
  });

  test('a delete that matched no row keeps the generic message the P2025 throw produced', async () => {
    findUniqueMock.mockResolvedValue({ id: 'conn-1', tenantId: 'tenant-1', userId: 'user-1' });
    deleteManyMock.mockResolvedValue({ count: 0 });

    // The row vanished between the read and the write. Before this card that
    // raised Prisma P2025, which carries no CALENDAR_* code, so the screen fell
    // back to `errors.unknown`. `calendarErrorCode` must still return null, or
    // the user would see a different translated string than they do today.
    const failure = await disconnectCalendar('conn-1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(calendarErrorCode(failure)).toBeNull();
  });

  test('runs both the ownership read and the delete inside withTenant, on the session tenant', async () => {
    findUniqueMock.mockResolvedValue({ id: 'conn-1', tenantId: 'tenant-1', userId: 'user-1' });

    await disconnectCalendar('conn-1');

    expect(withTenantMock).toHaveBeenCalledTimes(1);
    expect(withTenantMock.mock.calls[0]![0]).toBe('tenant-1');
  });

  test('reports a missing connection as missing', async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(disconnectCalendar('conn-gone')).resolves.toEqual({
      ok: false,
      code: 'CALENDAR_CONNECTION_NOT_FOUND',
    });
  });
});

describe('refusals cross the Server Action boundary as data (TASK-MUSFNYHSA49AB)', () => {
  /**
   * A production build sends the browser only a thrown error's `digest`, never
   * its message, so a thrown CALENDAR_* code was lost there and every refusal
   * read `errors.unknown`. The code has to be in the *returned value*; this
   * round-trips each refusal through the same structured-clone a Flight
   * payload preserves and reads it back with the client's own helper.
   */
  test.each([
    ['google', 'CALENDAR_OAUTH_NOT_CONFIGURED'],
    ['outlook', 'CALENDAR_UNKNOWN_PROVIDER'],
  ] as const)('connectCalendar(%s) returns %s, it does not throw it', async (provider, code) => {
    const result = structuredClone(await connectCalendar(provider));
    expect(result).toEqual({ ok: false, code });
    expect(calendarErrorCode(result)).toBe(code);
  });

  test('disconnectCalendar returns its refusals too', async () => {
    findUniqueMock.mockResolvedValue({ id: 'conn-1', tenantId: 'other-tenant', userId: 'user-1' });
    const forbidden = structuredClone(await disconnectCalendar('conn-1'));
    expect(calendarErrorCode(forbidden)).toBe('CALENDAR_FORBIDDEN');

    const missing = structuredClone(await disconnectCalendar(''));
    expect(calendarErrorCode(missing)).toBe('CALENDAR_CONNECTION_NOT_FOUND');
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

  test('reads the code from a returned { ok: false, code } result', () => {
    expect(calendarErrorCode({ ok: false, code: 'CALENDAR_ALREADY_CONNECTED' })).toBe(
      'CALENDAR_ALREADY_CONNECTED'
    );
    // An unlisted code is not trusted just because it sits in a `code` field.
    expect(calendarErrorCode({ ok: false, code: 'unknown' })).toBeNull();
  });

  test('leaves an unrecognised failure unrecognised', () => {
    // A generic message must not be mapped onto a plausible specific one.
    expect(calendarErrorCode(new Error('ECONNREFUSED'))).toBeNull();
    expect(calendarErrorCode(undefined)).toBeNull();
  });
});

describe('SELF_SERVE_PROVIDERS', () => {
  test('lists only what this deployment can actually connect', () => {
    // Google has no OAuth client and no callback route
    // (`find src/app/api -ipath '*calendar*'` is empty). When it gains one,
    // this list is where it is added — and this test is what makes that a
    // deliberate change.
    expect([...SELF_SERVE_PROVIDERS]).toEqual(['ics']);
  });
});
