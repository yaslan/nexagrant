import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Unit tests for the KVKK/GDPR erasure purge rule.
 *
 * The whole point of the 30-day grace period is that a subject can change their
 * mind, so the two rules worth pinning down are: nothing inside the window is
 * ever destroyed, and every completed erasure leaves an audit record that does
 * not itself re-create the identifier that was just erased.
 */

const findMany = vi.fn();
const userDelete = vi.fn().mockResolvedValue({});
const effortDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const aiUsageUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const auditCreate = vi.fn().mockResolvedValue({});
// Columns that hold a `User.id` with no foreign key: nothing cascades them, so
// the job has to clear each one by hand and each one needs a mock here.
const calendarDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const savedSearchDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const auditUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const opportunityUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const feedbackUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const proposalUsageUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const relationshipUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

vi.mock('../src/lib/db', () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => findMany(...args),
      delete: (...args: unknown[]) => userDelete(...args),
    },
    effort: { deleteMany: (...args: unknown[]) => effortDeleteMany(...args) },
    aiUsageLog: { updateMany: (...args: unknown[]) => aiUsageUpdateMany(...args) },
    auditEvent: {
      create: (...args: unknown[]) => auditCreate(...args),
      updateMany: (...args: unknown[]) => auditUpdateMany(...args),
    },
    calendarConnection: { deleteMany: (...args: unknown[]) => calendarDeleteMany(...args) },
    savedSearch: { deleteMany: (...args: unknown[]) => savedSearchDeleteMany(...args) },
    opportunity: { updateMany: (...args: unknown[]) => opportunityUpdateMany(...args) },
    feedback: { updateMany: (...args: unknown[]) => feedbackUpdateMany(...args) },
    proposalUsage: { updateMany: (...args: unknown[]) => proposalUsageUpdateMany(...args) },
    relationship: { updateMany: (...args: unknown[]) => relationshipUpdateMany(...args) },
  },
}));

vi.mock('../src/lib/storage', () => ({
  deleteUserFilesFromR2: vi.fn().mockResolvedValue(undefined),
}));

const { purgeDueUsers } = await import('../src/lib/inngest/jobs/users-scheduled-deletion');

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
});

describe('purgeDueUsers — grace period', () => {
  test('only scans requests older than the grace period', async () => {
    await purgeDueUsers(30);

    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.deletionRequestedAt.not).toBeNull();

    const cutoff: Date = where.deletionRequestedAt.lte;
    const expected = daysAgo(30);
    // Within a second of "30 days ago" — the two Dates are built moments apart.
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  test('an account still inside the window is never queried for deletion', async () => {
    // The cutoff is what protects in-window subjects, so a due-set of zero rows
    // must destroy nothing at all.
    await purgeDueUsers(30);

    expect(userDelete).not.toHaveBeenCalled();
    expect(effortDeleteMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(calendarDeleteMany).not.toHaveBeenCalled();
    expect(savedSearchDeleteMany).not.toHaveBeenCalled();
    expect(relationshipUpdateMany).not.toHaveBeenCalled();
  });

  test('every uncascaded column is cleared, and always scoped to the one subject', async () => {
    // A `deleteMany` on one of these tables with no `where` would empty it for
    // the whole platform, so the scope matters as much as the call.
    findMany.mockResolvedValue([
      { id: 'due', deletionRequestedAt: daysAgo(40), deletionReason: 'subject_request', memberships: [] },
    ]);

    await purgeDueUsers(30);

    expect(calendarDeleteMany).toHaveBeenCalledWith({ where: { userId: 'due' } });
    expect(savedSearchDeleteMany).toHaveBeenCalledWith({ where: { userId: 'due' } });
    expect(auditUpdateMany).toHaveBeenCalledWith({ where: { actorId: 'due' }, data: { actorId: null } });
    expect(opportunityUpdateMany).toHaveBeenCalledWith({ where: { ownerId: 'due' }, data: { ownerId: null } });
    expect(feedbackUpdateMany).toHaveBeenCalledWith({ where: { userId: 'due' }, data: { userId: null } });
    expect(proposalUsageUpdateMany).toHaveBeenCalledWith({
      where: { usedByUserId: 'due' },
      data: { usedByUserId: null },
    });
    // The focal point is detached, never the relationship deleted: the tenant
    // keeps the partner record, it just has no owner until someone is assigned.
    expect(relationshipUpdateMany).toHaveBeenCalledWith({
      where: { ownerUserId: 'due' },
      data: { ownerUserId: null },
    });
  });

  test('honours a custom grace period', async () => {
    await purgeDueUsers(7);

    const cutoff: Date = findMany.mock.calls[0][0].where.deletionRequestedAt.lte;
    expect(Math.abs(cutoff.getTime() - daysAgo(7).getTime())).toBeLessThan(1000);
  });
});

describe('purgeDueUsers — erasure', () => {
  const requestedAt = daysAgo(31);

  beforeEach(() => {
    findMany.mockResolvedValue([
      {
        id: 'user-due',
        deletionRequestedAt: requestedAt,
        deletionReason: 'subject_request',
        memberships: [{ tenantId: 'tenant-a' }, { tenantId: 'tenant-b' }],
      },
    ]);
  });

  test('purges the user and reports the counts', async () => {
    const result = await purgeDueUsers(30);

    expect(userDelete).toHaveBeenCalledWith({ where: { id: 'user-due' } });
    expect(effortDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-due' } });
    // Billing/AI history is kept but detached from the person.
    expect(aiUsageUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-due' },
      data: { userId: null },
    });
    expect(result).toMatchObject({ success: true, dueCount: 1, purgedCount: 1, failedCount: 0 });
  });

  test('writes one audit event per tenant, keyed by a one-way hash', async () => {
    await purgeDueUsers(30);

    expect(auditCreate).toHaveBeenCalledTimes(2);
    const written = auditCreate.mock.calls.map((c) => c[0].data);
    expect(written.map((w) => w.tenantId).sort()).toEqual(['tenant-a', 'tenant-b']);

    const expectedRef = createHash('sha256').update('user-due').digest('hex');
    for (const row of written) {
      expect(row.type).toBe('user.erased');
      expect(row.target).toBe(expectedRef);
      expect(row.data.reason).toBe('subject_request');
      expect(row.data.requestedAt).toBe(requestedAt.toISOString());
    }

    // The erased id must not survive anywhere in the audit trail.
    expect(JSON.stringify(written)).not.toContain('user-due');
  });

  test('a user with no memberships still leaves an audit record', async () => {
    findMany.mockResolvedValue([
      { id: 'orphan', deletionRequestedAt: requestedAt, deletionReason: null, memberships: [] },
    ]);

    await purgeDueUsers(30);

    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data.tenantId).toBeUndefined();
    expect(auditCreate.mock.calls[0][0].data.data.reason).toBe('subject_request');
  });

  test('one failed purge does not abort the rest of the batch', async () => {
    findMany.mockResolvedValue([
      { id: 'bad', deletionRequestedAt: requestedAt, deletionReason: null, memberships: [] },
      { id: 'good', deletionRequestedAt: requestedAt, deletionReason: null, memberships: [] },
    ]);
    userDelete.mockRejectedValueOnce(new Error('FK violation'));

    const result = await purgeDueUsers(30);

    expect(result).toMatchObject({ dueCount: 2, purgedCount: 1, failedCount: 1 });
    expect(result.errors?.[0]).toMatchObject({ userId: 'bad', message: 'FK violation' });
    // The failed subject must not get an "erased" record it did not earn.
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
