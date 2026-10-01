import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * Live KVKK/GDPR data-subject tests — real Postgres, real Prisma, real queries.
 *
 * The unit suite in `users-scheduled-deletion.test.ts` mocks the database, so it
 * can only prove the *shape* of a query. These endpoints make claims that a
 * mocked client cannot check: that an export carries the subject's rows and
 * nobody else's, that a deletion request destroys nothing, and that the purge
 * really removes the row. Those are properties of the database, so they are
 * measured against one.
 *
 * Only `auth()` is mocked — it is the session identity, not behaviour under
 * test. Everything below it is the production code path.
 */

const CONNECTION =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';

/** Skips the whole file rather than failing CI when no database is reachable. */
async function dbReachable(): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: CONNECTION, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

const HAS_DB = await dbReachable();

// The session the production code will read. Mutated per test.
type TestSession = { user?: { id: string }; tenantId?: string } | null;
let currentSession: TestSession = null;

vi.mock('@/lib/auth', () => ({
  auth: async () => currentSession,
}));

// Every stored object is a tenant's, so erasing a person must not reach the
// object store (TASK-MUPL2D9B8QWAB; tests/user-erasure-object-store.test.ts
// against a real store). Any delete export the purge called would land here.
const storeDelete = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/storage', () => ({
  deleteUserFilesFromR2: (...args: unknown[]) => storeDelete('deleteUserFilesFromR2', ...args),
  deleteFileFromR2: (...args: unknown[]) => storeDelete('deleteFileFromR2', ...args),
  deleteTenantObject: (...args: unknown[]) => storeDelete('deleteTenantObject', ...args),
  deleteObjectBytes: (...args: unknown[]) => storeDelete('deleteObjectBytes', ...args),
}));

const { exportUserData } = await import('@/actions/user/export-data');
const { requestAccountDeletion, cancelAccountDeletion, getDeletionStatus } = await import(
  '@/actions/user/request-deletion'
);
const { purgeDueUsers } = await import('@/lib/jobs/tasks/users-scheduled-deletion');

// A separate client for assertions, so the test observes the database directly
// rather than trusting the value the code under test just returned.
const pool = new pg.Pool({ connectionString: CONNECTION });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

// Measured as the app's own role on purpose (see tests/helpers/live-db-role.ts):
// over an RLS-subject role the policies, not the code, would do the refusing.
if (HAS_DB) await assertAppOwnerRole(db, 'gdpr data-subject live test');
else skipOrFailInCi('gdpr data-subject live test', 'Postgres is unreachable (`docker compose up -d`)');

const RUN = randomBytes(4).toString('hex');
const ids = {
  tenantA: `t-a-${RUN}`,
  tenantB: `t-b-${RUN}`,
  wsA: `w-a-${RUN}`,
  wsB: `w-b-${RUN}`,
  subject: `u-subj-${RUN}`,
  neighbour: `u-nb-${RUN}`,
  outsider: `u-out-${RUN}`,
  oppSubject: `o-subj-${RUN}`,
  oppNeighbour: `o-nb-${RUN}`,
  oppOutsider: `o-out-${RUN}`,
  relSubject: `r-subj-${RUN}`,
  relNeighbour: `r-nb-${RUN}`,
};

async function seed() {
  await db.tenant.createMany({
    data: [
      { id: ids.tenantA, name: `A ${RUN}`, slug: `a-${RUN}`, country: 'TR' },
      { id: ids.tenantB, name: `B ${RUN}`, slug: `b-${RUN}`, country: 'BE' },
    ],
  });
  await db.workspace.createMany({
    data: [
      { id: ids.wsA, tenantId: ids.tenantA, name: 'WS A', slug: `ws-a-${RUN}` },
      { id: ids.wsB, tenantId: ids.tenantB, name: 'WS B', slug: `ws-b-${RUN}` },
    ],
  });
  await db.user.createMany({
    data: [
      { id: ids.subject, email: `subject-${RUN}@t.invalid`, name: 'Subject', locale: 'tr' },
      { id: ids.neighbour, email: `nb-${RUN}@t.invalid`, name: 'Neighbour', locale: 'tr' },
      { id: ids.outsider, email: `out-${RUN}@t.invalid`, name: 'Outsider', locale: 'en' },
    ],
  });
  await db.membership.createMany({
    data: [
      { tenantId: ids.tenantA, userId: ids.subject, role: 'TENANT_OWNER', workspaceIds: [ids.wsA] },
      { tenantId: ids.tenantA, userId: ids.neighbour, role: 'TENANT_OWNER', workspaceIds: [ids.wsA] },
      { tenantId: ids.tenantB, userId: ids.outsider, role: 'TENANT_OWNER', workspaceIds: [ids.wsB] },
    ],
  });

  // An OAuth account carrying real-looking secrets: the export must not leak these.
  await db.account.create({
    data: {
      userId: ids.subject,
      type: 'oauth',
      provider: `google-${RUN}`,
      providerAccountId: `pa-${RUN}`,
      refresh_token: 'SECRET_REFRESH_TOKEN_VALUE',
      access_token: 'SECRET_ACCESS_TOKEN_VALUE',
      id_token: 'SECRET_ID_TOKEN_VALUE',
      scope: 'openid email',
    },
  });

  await db.opportunity.createMany({
    data: [
      { id: ids.oppSubject, tenantId: ids.tenantA, workspaceId: ids.wsA, title: 'Subject opp', ownerId: ids.subject, notes: 'subject-notes' },
      { id: ids.oppNeighbour, tenantId: ids.tenantA, workspaceId: ids.wsA, title: 'Neighbour opp', ownerId: ids.neighbour, notes: 'neighbour-notes' },
      { id: ids.oppOutsider, tenantId: ids.tenantB, workspaceId: ids.wsB, title: 'Outsider opp', ownerId: ids.outsider, notes: 'outsider-notes' },
    ],
  });
  await db.proposal.create({
    data: { tenantId: ids.tenantA, opportunityId: ids.oppSubject, acronym: `ACR-${RUN}` },
  });

  await db.effort.createMany({
    data: [
      { tenantId: ids.tenantA, opportunityId: ids.oppSubject, userId: ids.subject, date: new Date(), hours: 3, note: 'subject-effort' },
      { tenantId: ids.tenantA, opportunityId: ids.oppNeighbour, userId: ids.neighbour, date: new Date(), hours: 5, note: 'neighbour-effort' },
    ],
  });
  await db.aiUsageLog.createMany({
    data: [
      { tenantId: ids.tenantA, userId: ids.subject, module: 'M6', purpose: 'draft', provider: 'anthropic', model: 'claude-opus-5', promptHash: 'h1', inputTokens: 10, outputTokens: 20, credits: 1 },
      { tenantId: ids.tenantA, userId: ids.neighbour, module: 'M6', purpose: 'draft', provider: 'anthropic', model: 'claude-opus-5', promptHash: 'h2', inputTokens: 10, outputTokens: 20, credits: 1 },
    ],
  });
  await db.evaluation.createMany({
    data: [
      { tenantId: ids.tenantA, opportunityId: ids.oppSubject, userId: ids.subject, readerType: 'HUMAN' },
      { tenantId: ids.tenantA, opportunityId: ids.oppNeighbour, userId: ids.neighbour, readerType: 'HUMAN' },
    ],
  });
  await db.approvalRequest.create({
    data: {
      tenantId: ids.tenantA, actionType: 'BUDGET_ALLOCATION', title: `Req ${RUN}`,
      payload: {}, requesterId: ids.subject, expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  // Rows that carry the subject's id with NO foreign key to `User`. Nothing in
  // the database cascades them, so unless the purge names each one explicitly
  // they outlive the erasure. Each is seeded for the neighbour too, so the
  // assertions can tell "the purge cleaned it" from "the purge cleaned
  // everything".
  await db.calendarConnection.createMany({
    data: [
      {
        tenantId: ids.tenantA, userId: ids.subject, provider: 'google',
        externalId: `subject-${RUN}@cal.invalid`,
        accessToken: 'SECRET_CALENDAR_ACCESS_TOKEN',
        refreshToken: 'SECRET_CALENDAR_REFRESH_TOKEN',
      },
      {
        tenantId: ids.tenantA, userId: ids.neighbour, provider: 'google',
        externalId: `nb-${RUN}@cal.invalid`, accessToken: 'nb-access', refreshToken: 'nb-refresh',
      },
    ],
  });
  await db.savedSearch.createMany({
    data: [
      { tenantId: ids.tenantA, userId: ids.subject, name: `Subject search ${RUN}`, filters: { q: 'subject-query' } },
      { tenantId: ids.tenantA, userId: ids.neighbour, name: `Neighbour search ${RUN}`, filters: { q: 'neighbour-query' } },
    ],
  });
  await db.feedback.createMany({
    data: [
      { tenantId: ids.tenantA, userId: ids.subject, category: 'BUG', title: `Subject report ${RUN}`, body: 'subject-body' },
      { tenantId: ids.tenantA, userId: ids.neighbour, category: 'BUG', title: `Neighbour report ${RUN}`, body: 'neighbour-body' },
    ],
  });
  await db.auditEvent.createMany({
    data: [
      { tenantId: ids.tenantA, actorId: ids.subject, type: 'module.state.changed', target: `m8-${RUN}` },
      { tenantId: ids.tenantA, actorId: ids.neighbour, type: 'module.state.changed', target: `m9-${RUN}` },
    ],
  });

  // M4 relationships. `ownerUserId` is the internal focal point and carried the
  // subject's id in a NOT NULL column until `relationship-owner-nullable.sql`,
  // so it used to survive the purge outright. `counterpartName`/`Email` are the
  // external partner — the tenant's own data, and not the subject — so they
  // must still be there afterwards: erasure detaches the owner, it does not
  // take the tenant's partner record with it.
  await db.relationship.createMany({
    data: [
      {
        id: ids.relSubject, tenantId: ids.tenantA, kind: 'partner',
        ownerUserId: ids.subject, counterpartName: `Partner Contact ${RUN}`,
        counterpartEmail: `partner-${RUN}@t.invalid`, warmth: 'warm',
      },
      {
        id: ids.relNeighbour, tenantId: ids.tenantA, kind: 'ncp',
        ownerUserId: ids.neighbour, counterpartName: `NCP Contact ${RUN}`,
        counterpartEmail: `ncp-${RUN}@t.invalid`, warmth: 'cold',
      },
    ],
  });
}

async function cleanup() {
  // Ordered by dependency; the tenant cascade clears most of it, but efforts and
  // AI logs carry no FK to the tenant row.
  await db.effort.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.aiUsageLog.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.auditEvent.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.calendarConnection.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.savedSearch.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.feedback.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.relationship.deleteMany({ where: { tenantId: { in: [ids.tenantA, ids.tenantB] } } });
  await db.tenant.deleteMany({ where: { id: { in: [ids.tenantA, ids.tenantB] } } });
  await db.user.deleteMany({ where: { id: { in: [ids.subject, ids.neighbour, ids.outsider] } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await cleanup();
  await seed();
});

afterAll(async () => {
  if (HAS_DB) await cleanup();
  await db.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
});

describe.skipIf(!HAS_DB)('GDPR export — live', () => {
  test('rejects an unauthenticated caller', async () => {
    currentSession = null;
    const result = await exportUserData();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
    expect(result.data).toBeUndefined();
  });

  test('returns the subject rows and no other member of the same tenant', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    const result = await exportUserData();
    expect(result.success).toBe(true);

    const tables = result.data!.tables;
    const flat = JSON.stringify(tables);

    // Present: the subject's own rows.
    expect(tables.User).toHaveLength(1);
    expect((tables.User?.[0] as { id: string } | undefined)?.id).toBe(ids.subject);
    expect((tables.Opportunity ?? []).map((o) => (o as { id: string }).id)).toEqual([ids.oppSubject]);
    expect(tables.Effort).toHaveLength(1);
    expect(tables.Evaluation).toHaveLength(1);
    expect(tables.AiUsageLog).toHaveLength(1);
    expect(tables.ApprovalRequest).toHaveLength(1);
    expect(tables.Proposal).toHaveLength(1);

    // Absent: a co-tenant's rows. This is the isolation that matters most here —
    // the endpoint runs inside a shared tenant, so "my data" must not mean
    // "my tenant's data".
    expect(flat).not.toContain('neighbour-notes');
    expect(flat).not.toContain('neighbour-effort');
    expect(flat).not.toContain(ids.neighbour);
    expect(flat).not.toContain(ids.oppNeighbour);
  });

  test('carries no rows from another tenant', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    const flat = JSON.stringify((await exportUserData()).data!.tables);
    expect(flat).not.toContain('outsider-notes');
    expect(flat).not.toContain(ids.outsider);
    expect(flat).not.toContain(ids.tenantB);
  });

  test('never includes OAuth secrets', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    const flat = JSON.stringify((await exportUserData()).data!);
    for (const secret of [
      'SECRET_REFRESH_TOKEN_VALUE',
      'SECRET_ACCESS_TOKEN_VALUE',
      'SECRET_ID_TOKEN_VALUE',
    ]) {
      expect(flat).not.toContain(secret);
    }
    // The provider linkage itself is still disclosed, as art.15 requires.
    expect(flat).toContain(`google-${RUN}`);
  });

  test('names the tenant and carries the bilingual Evaluator Lens disclaimer', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    const data = (await exportUserData()).data!;
    expect(data.tenant).toBe(`A ${RUN}`);
    expect(data.notice.tr).toMatch(/ön değerlendirme/i);
    expect(data.notice.en).toMatch(/pre-assessment/i);
  });
});

describe.skipIf(!HAS_DB)('GDPR erasure request — live', () => {
  test('rejects an unauthenticated caller', async () => {
    currentSession = null;
    expect((await requestAccountDeletion()).error).toBe('Unauthorized');
    expect((await cancelAccountDeletion()).error).toBe('Unauthorized');
    expect(await getDeletionStatus()).toEqual({ pending: false });
  });

  test('marks the account soft-deleted and destroys nothing', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    const result = await requestAccountDeletion();
    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');

    const row = await db.user.findUnique({ where: { id: ids.subject } });
    expect(row).not.toBeNull();
    expect(row!.deletionRequestedAt).toBeInstanceOf(Date);
    expect(row!.deletedAt).toBeInstanceOf(Date);
    expect(row!.deletionReason).toBe('subject_request');

    // The grace period is worthless if the rows are already gone.
    expect(await db.effort.count({ where: { userId: ids.subject } })).toBe(1);
    expect(await db.membership.count({ where: { userId: ids.subject } })).toBe(1);
    expect(await db.aiUsageLog.count({ where: { userId: ids.subject } })).toBe(1);
  });

  test('warns that the subject is the sole owner of their tenant', async () => {
    // tenantA has two owners, so the subject is not sole owner there; the
    // outsider is the only owner of tenantB and must be warned.
    currentSession = { user: { id: ids.outsider }, tenantId: ids.tenantB };
    const result = await requestAccountDeletion();
    expect(result.soleOwnerOf).toEqual([ids.tenantB]);
    await cancelAccountDeletion();
  });

  test('is idempotent — a second request keeps the original deadline', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    const first = await getDeletionStatus();
    const second = await requestAccountDeletion();
    expect(second.deletedAt).toBe(first.purgeAt);
  });

  test('cancel restores the account inside the grace period', async () => {
    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    expect((await cancelAccountDeletion()).success).toBe(true);

    const row = await db.user.findUnique({ where: { id: ids.subject } });
    expect(row!.deletionRequestedAt).toBeNull();
    expect(row!.deletedAt).toBeNull();
    expect(row!.deletionReason).toBeNull();
    expect(await getDeletionStatus()).toEqual({ pending: false });
  });
});

describe.skipIf(!HAS_DB)('GDPR accountability audit — live', () => {
  const subjectRef = createHash('sha256').update(ids.subject).digest('hex');

  test('an export writes a record that counts rows but copies none of them', async () => {
    await db.auditEvent.deleteMany({ where: { target: requireId(subjectRef, 'subjectRef'), type: 'user.data.exported' } });

    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    await exportUserData();

    const events = await db.auditEvent.findMany({
      where: { target: subjectRef, type: 'user.data.exported' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.tenantId).toBe(ids.tenantA);

    const payload = JSON.stringify(events[0]!.data);
    // The trail records that the export happened, never a second copy of the data.
    expect(payload).toContain('rowCounts');
    expect(payload).not.toContain('subject-notes');
    expect(payload).not.toContain(`subject-${RUN}@t.invalid`);
    // And it must not re-create the identifier the later purge will erase.
    expect(payload).not.toContain(ids.subject);
    expect(events[0]!.actorId).toBeNull();
  });

  test('a request and its cancellation are both recorded', async () => {
    // The erasure block above already exercised this subject, so start from a
    // clean slate: this test asserts one record per action, not a running total.
    await db.auditEvent.deleteMany({
      where: { target: requireId(subjectRef, 'subjectRef'), type: { in: ['user.erasure.requested', 'user.erasure.cancelled'] } },
    });

    currentSession = { user: { id: ids.subject }, tenantId: ids.tenantA };
    await requestAccountDeletion();
    await cancelAccountDeletion();

    const requested = await db.auditEvent.findMany({
      where: { target: subjectRef, type: 'user.erasure.requested' },
    });
    const cancelled = await db.auditEvent.findMany({
      where: { target: subjectRef, type: 'user.erasure.cancelled' },
    });

    expect(requested).toHaveLength(1);
    expect(cancelled).toHaveLength(1);
    expect(requested[0]!.tenantId).toBe(ids.tenantA);
    expect(JSON.stringify(requested[0]!.data)).not.toContain(ids.subject);
  });
});

describe.skipIf(!HAS_DB)('GDPR purge — live', () => {
  test('erases the due subject for real and leaves every other tenant intact', async () => {
    // Age the request past the window.
    const longAgo = new Date();
    longAgo.setUTCDate(longAgo.getUTCDate() - 40);
    await db.user.update({
      where: { id: ids.subject },
      data: { deletionRequestedAt: longAgo, deletedAt: longAgo, deletionReason: 'subject_request' },
    });

    // Guard: this job scans the whole database. It must never run here while a
    // row it did not seed is also due, or the test would destroy real data.
    // "Due" is the purge's own filter (purgeDueUsers(30): requested 30+ days
    // ago). A fresh request another live file seeds in parallel — e.g.
    // stale-relationship-reminder's `U.gone`, requested today — is not touched
    // by this run and must not fail it (İNCELEME-54 Y-2).
    const dueCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const due = await db.user.findMany({
      where: { deletionRequestedAt: { not: null, lte: dueCutoff } },
      select: { id: true },
    });
    expect(due.map((u: { id: string }) => u.id)).toEqual([ids.subject]);

    const out = await purgeDueUsers(30);
    expect(out.purgedCount).toBe(1);
    expect(out.failedCount).toBe(0);

    // Gone for real, not merely flagged.
    expect(await db.user.findUnique({ where: { id: ids.subject } })).toBeNull();
    expect(await db.membership.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await db.account.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await db.effort.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await db.approvalRequest.count({ where: { requesterId: ids.subject } })).toBe(0);

    // Billing history survives, anonymised — not deleted, not still attributed.
    expect(await db.aiUsageLog.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await db.aiUsageLog.count({ where: { tenantId: ids.tenantA, userId: null } })).toBe(1);

    // Evaluations survive with the author detached (onDelete: SetNull).
    const evaluation = await db.evaluation.findFirst({ where: { opportunityId: ids.oppSubject } });
    expect(evaluation).not.toBeNull();
    expect(evaluation!.userId).toBeNull();

    // The co-tenant and the other tenant are untouched.
    expect(await db.user.findUnique({ where: { id: ids.neighbour } })).not.toBeNull();
    expect(await db.user.findUnique({ where: { id: ids.outsider } })).not.toBeNull();
    expect(await db.effort.count({ where: { userId: ids.neighbour } })).toBe(1);
    expect(await db.opportunity.count({ where: { tenantId: ids.tenantB } })).toBe(1);
    expect(storeDelete).not.toHaveBeenCalled();
  });

  test('leaves no row still carrying the erased id in a column the database does not cascade', async () => {
    // Ten columns hold a `User.id` with no foreign key, so `DELETE FROM "User"`
    // cannot reach any of them. Each one the purge does not name by hand is a
    // record of an erased person that survives their erasure.
    const residue = {
      calendarConnection: await db.calendarConnection.count({ where: { userId: ids.subject } }),
      savedSearch: await db.savedSearch.count({ where: { userId: ids.subject } }),
      feedback: await db.feedback.count({ where: { userId: ids.subject } }),
      auditActor: await db.auditEvent.count({ where: { actorId: ids.subject } }),
      opportunityOwner: await db.opportunity.count({ where: { ownerId: ids.subject } }),
      relationshipOwner: await db.relationship.count({ where: { ownerUserId: ids.subject } }),
    };
    expect(residue).toEqual({
      calendarConnection: 0,
      savedSearch: 0,
      feedback: 0,
      auditActor: 0,
      opportunityOwner: 0,
      relationshipOwner: 0,
    });
  });

  test('the erased focal point is detached from the relationship, and the neighbour keeps theirs', async () => {
    // A4 option C: `Relationship.ownerUserId` is a work assignment, so it has no
    // retention basis once the person is erased — but the relationship itself is
    // the tenant's record and stays, with the external partner still on it.
    const rel = await db.relationship.findUnique({ where: { id: ids.relSubject } });
    expect(rel).not.toBeNull();
    expect(rel!.ownerUserId).toBeNull();
    expect(rel!.counterpartName).toBe(`Partner Contact ${RUN}`);
    expect(rel!.counterpartEmail).toBe(`partner-${RUN}@t.invalid`);
    expect(rel!.warmth).toBe('warm');

    // The detach is scoped to the subject: an `updateMany` with the wrong where
    // clause would unassign every relationship in the tenant and this is what
    // would catch it.
    const neighbourRel = await db.relationship.findUnique({ where: { id: ids.relNeighbour } });
    expect(neighbourRel).not.toBeNull();
    expect(neighbourRel!.ownerUserId).toBe(ids.neighbour);
  });

  test('no column anywhere still carries the erased person by name', async () => {
    // The id is not the whole subject: a purge that only nulls ids can leave the
    // person readable in a name column next door. `Relationship` is clean by
    // construction — the only name it holds is the external counterpart — but
    // that is a property worth measuring rather than assuming.
    const named = await db.relationship.findMany({
      where: { tenantId: ids.tenantA },
      select: { counterpartName: true, counterpartEmail: true, notes: true },
    });
    const blob = JSON.stringify(named);
    expect(blob).not.toContain(ids.subject);
    expect(blob).not.toContain('Subject');
    expect(blob).not.toContain(`subject-${RUN}@t.invalid`);
  });

  test('detaches rather than destroys: the tenant keeps the work, minus the person', async () => {
    // Erasure must not take the tenant's own records with it. The opportunity,
    // the feedback report and the audit trail stay; only the link to the erased
    // person is gone.
    const opp = await db.opportunity.findUnique({ where: { id: ids.oppSubject } });
    expect(opp).not.toBeNull();
    expect(opp!.ownerId).toBeNull();

    const feedback = await db.feedback.findFirst({ where: { title: `Subject report ${RUN}` } });
    expect(feedback).not.toBeNull();
    expect(feedback!.userId).toBeNull();

    const audit = await db.auditEvent.findFirst({ where: { target: `m8-${RUN}` } });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBeNull();
  });

  test('the neighbour keeps every row of the same kind', async () => {
    // The counterweight to the test above: a purge that simply emptied these
    // tables would satisfy it. These rows belong to a user who asked for
    // nothing and must be untouched.
    expect(await db.calendarConnection.count({ where: { userId: ids.neighbour } })).toBe(1);
    expect(await db.savedSearch.count({ where: { userId: ids.neighbour } })).toBe(1);
    expect(await db.feedback.count({ where: { userId: ids.neighbour } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorId: ids.neighbour } })).toBe(1);
    expect(await db.opportunity.count({ where: { ownerId: ids.neighbour } })).toBe(1);
  });

  test('no OAuth calendar credential of the erased subject survives', async () => {
    // CalendarConnection stores a Google/Outlook refresh token in clear text
    // (its own schema comment marks the encryption as still to do). A token
    // that outlives the account is a live credential for a third-party mailbox
    // belonging to someone the platform has promised to forget.
    const rows = await db.calendarConnection.findMany({
      where: { tenantId: ids.tenantA },
      select: { userId: true, accessToken: true, refreshToken: true },
    });
    const secrets = JSON.stringify(rows);
    expect(secrets).not.toContain('SECRET_CALENDAR_ACCESS_TOKEN');
    expect(secrets).not.toContain('SECRET_CALENDAR_REFRESH_TOKEN');
  });

  test('writes an audit record that does not re-create the erased identifier', async () => {
    const subjectRef = createHash('sha256').update(ids.subject).digest('hex');
    const events = await db.auditEvent.findMany({
      where: { type: 'user.erased', target: subjectRef },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.tenantId).toBe(ids.tenantA);
    expect(JSON.stringify(events[0]!.data)).not.toContain(ids.subject);
  });
});
