import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-89 — every refusal of POST /api/invitations carries a language-free
 * `code`, so the members page can say it in the reader's locale. The old
 * `error` sentence stays in the body for existing callers. The database is not
 * needed for these branches: the transaction is replaced by a fake `tx` whose
 * membership lookup and seat check decide which refusal comes back.
 */

const state = vi.hoisted(() => ({
  role: 'TENANT_OWNER',
  existingMember: false,
  seatLimit: null as null | { limit: number; members: number; pendingInvitations: number },
  throwInTx: false,
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantApi: async () => ({
    ok: true,
    scope: { tenantId: 't-ng89', userId: 'u-ng89', role: state.role, workspaceIds: [], isPlatformAdmin: false },
  }),
}));
vi.mock('@/lib/billing/seat-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/seat-limit')>();
  return {
    ...actual,
    assertSeatAvailable: vi.fn(async () => {
      if (state.seatLimit) throw new actual.SeatLimitReachedError(state.seatLimit);
    }),
  };
});
vi.mock('@/lib/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, cb: (tx: unknown) => unknown) => {
    if (state.throwInTx) throw new Error('connection refused at postgres://secret@db');
    return cb({
      membership: { findFirst: async () => (state.existingMember ? { id: 'm-1' } : null) },
    });
  }),
}));
vi.mock('@/lib/email/mailer', () => ({ smtpMailer: () => null, reportMailNotConfigured: vi.fn() }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn() }));

const { POST } = await import('@/app/api/invitations/route');

async function invite(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await POST(
    new Request('http://localhost/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  state.role = 'TENANT_OWNER';
  state.existingMember = false;
  state.seatLimit = null;
  state.throwInTx = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/invitations — refusal codes (NG-89)', () => {
  test('a role that may not invite: 403 FORBIDDEN_ROLE, old sentence kept', async () => {
    state.role = 'WRITER';
    const res = await invite({ email: 'a@example.test', role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
    expect(res.body.error).toMatch(/yetkiniz yok/);
  });

  test('a malformed address: 400 INVALID_EMAIL', async () => {
    const res = await invite({ email: 'not-an-address', role: 'MEMBER' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
    expect(res.body.error).toBe('Geçerli bir e-posta adresi zorunludur.');
  });

  test('an address that is already a member: 400 ALREADY_MEMBER', async () => {
    state.existingMember = true;
    const res = await invite({ email: 'a@example.test', role: 'MEMBER' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALREADY_MEMBER');
    expect(res.body.error).toBe('Bu e-posta adresi zaten bu kurumun üyesidir.');
  });

  test('the plan has no free seat: 403 SEAT_LIMIT_REACHED with the numbers', async () => {
    state.seatLimit = { limit: 2, members: 1, pendingInvitations: 1 };
    const res = await invite({ email: 'a@example.test', role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SEAT_LIMIT_REACHED');
    expect(res.body.seats).toEqual({ limit: 2, members: 1, pendingInvitations: 1 });
    expect(res.body.error).toMatch(/koltuk sınırına/);
  });

  test('an unexpected failure: 500 INTERNAL_ERROR, nothing from the thrown error in the body', async () => {
    state.throwInTx = true;
    const res = await invite({ email: 'a@example.test', role: 'MEMBER' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|secret/);
  });
});
