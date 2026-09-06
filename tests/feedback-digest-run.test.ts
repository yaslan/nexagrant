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

vi.mock('@/lib/db', () => ({
  prisma: {
    feedback: { findMany: vi.fn(async () => rows) },
    tenant: { findMany: vi.fn(async () => [{ id: 't1', name: 'Beta Kurum' }]) },
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'https://app.example.org',
    // No RESEND_API_KEY and no FEEDBACK_DIGEST_TO: the unconfigured default.
  },
}));

import { runFeedbackDigest } from '@/lib/feedback/digest-run';

describe('runFeedbackDigest delivery branches', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('skips when a recipient exists but Resend is not configured', async () => {
    const result = await runFeedbackDigest({ send: true, to: 'admin@example.org' });
    expect(result.emailStatus).toBe('skipped');
    expect(result.emailReason).toBe('no_resend_api_key');
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
        throw new Error('resend is down');
      },
    });
    expect(result.emailStatus).toBe('failed');
    expect(result.emailReason).toBe('resend is down');
    // Even a failed send returns usable numbers.
    expect(result.summary.newCount).toBe(1);
  });

  it('resolves the tenant name into the rendered table', async () => {
    const result = await runFeedbackDigest({ send: false });
    expect(result.html).toContain('Beta Kurum');
  });
});
