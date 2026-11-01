import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Delivery-branch tests for the weekly digest runner. Prisma is mocked so these
 * assert the decision logic — when the digest sends, when it deliberately does
 * not, and what happens when the transport throws — without a database.
 */

const rows = [
  {
    id: 'f1',
    tenantId: 't1',
    title: 'P0 report',
    category: 'BUG',
    priority: 'P0',
    status: 'NEW',
    createdAt: new Date('2026-09-01T00:00:00Z'),
  },
];

/**
 * The one fake client, parked in a hoisted box so the scope helpers below hand it
 * to their callbacks BY REFERENCE. Not `await import('@/lib/db')` inside the
 * helper: a dynamic import of a mocked module re-runs this factory and mints a
 * fresh set of `vi.fn()`s, so an assertion on `.mock.calls` would watch a
 * different object than the code under test just called (TASK-MTVTPVTEBCF5Z).
 */
const dbBox = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('@/lib/db', () => {
  const mod = {
  prisma: {
    feedback: { findMany: vi.fn(async () => rows) },
    tenant: { findMany: vi.fn(async () => [{ id: 't1', name: 'Beta Kurum' }]) },
  },
  };
  dbBox.client = mod.prisma;
  return mod;
});

/**
 * The cross-tenant path hands its callback the same fake client `prisma`
 * resolves to, exactly as the `withTenant` mocks in this suite do — so the
 * assertions below keep watching the one `vi.fn()` after the code under test
 * moved its query onto `withSystemScope` (TASK-MTVTPVTEBCF5Z). Resolved lazily
 * because `vi.mock` is hoisted above the fixture consts.
 */
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async <T,>(_purpose: string, _context: string, cb: (tx: never) => Promise<T> | T) =>
    cb(dbBox.client as never),
}));

const env = vi.hoisted(() => ({
  NODE_ENV: 'test' as string,
  NEXT_PUBLIC_APP_URL: 'https://app.example.org',
  // No SMTP_HOST and no FEEDBACK_DIGEST_TO: the unconfigured default.
}));
vi.mock('@/lib/env', () => ({ env }));

const recordAlert = vi.hoisted(() => vi.fn(async () => ({ status: 'recorded', id: 'a1' })));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert }));

import { runFeedbackDigest } from '@/lib/feedback/digest-run';

describe('runFeedbackDigest delivery branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.NODE_ENV = 'test';
  });

  it('renders without sending when send is disabled', async () => {
    const result = await runFeedbackDigest({ send: false, to: 'admin@example.org' });
    expect(result.emailStatus).toBe('skipped');
    expect(result.emailReason).toBe('send_disabled');
    expect(result.html).toContain('P0 report');
    expect(result.subject).toContain('urgent');
  });

  it('skips with a named reason when no recipient is configured', async () => {
    const result = await runFeedbackDigest({ send: true });
    expect(result.emailStatus).toBe('skipped');
    expect(result.emailReason).toBe('no_recipient');
    expect(result.recipient).toBeUndefined();
  });

  it('skips outside production when a recipient exists but SMTP is not configured', async () => {
    const result = await runFeedbackDigest({ send: true, to: 'admin@example.org' });
    expect(result.emailStatus).toBe('skipped');
    expect(result.emailReason).toBe('no_smtp_config');
    expect(recordAlert).not.toHaveBeenCalled();
  });

  it('fails with an error SystemAlert in production when SMTP is not configured', async () => {
    env.NODE_ENV = 'production';
    const result = await runFeedbackDigest({ send: true, to: 'admin@example.org' });
    expect(result.emailStatus).toBe('failed');
    expect(result.emailReason).toBe('no_smtp_config');
    expect(recordAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', source: 'mail', meta: { caller: 'feedback-digest' } })
    );
  });

  it('sends through the injected sender and reports the recipient', async () => {
    const sent: Array<{ to: string; subject: string }> = [];
    const result = await runFeedbackDigest({
      send: true,
      to: 'admin@example.org',
      sender: async ({ to, subject }) => {
        sent.push({ to, subject });
      },
    });
    expect(result.emailStatus).toBe('sent');
    expect(result.recipient).toBe('admin@example.org');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('admin@example.org');
  });

  it('reports a transport failure instead of throwing out of the job', async () => {
    const result = await runFeedbackDigest({
      send: true,
      to: 'admin@example.org',
      sender: async () => {
        throw new Error('smtp is down');
      },
    });
    expect(result.emailStatus).toBe('failed');
    expect(result.emailReason).toBe('smtp is down');
    // Even a failed send returns usable numbers.
    expect(result.summary.newCount).toBe(1);
  });

  it('resolves the tenant name into the rendered table', async () => {
    const result = await runFeedbackDigest({ send: false });
    expect(result.html).toContain('Beta Kurum');
  });
});
