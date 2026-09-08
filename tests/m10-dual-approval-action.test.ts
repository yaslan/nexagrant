import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTR60M5ESB5PZ — the server-action boundary, not just the pure engine.
 *
 * `submitDualApprovalAction(docId, actorName)` used to take the actor name as a
 * second argument with a real person's name as its default, so a POST that named
 * nobody signed the audit record as that person. The action must read the actor
 * from the session alone, and refuse when there is no session.
 *
 * TASK-MTSAIWF4ENUSL — and the record must survive the request that made it.
 * The intermediate steps used to live in React state, so the whole flow was gone
 * on the next reload. The actions now read and write rows; the fake transaction
 * below is those rows, so the four-eyes rules and the persistence are exercised
 * here without a database. (The database enforces the same two rules with unique
 * indexes — see prisma/migrations/add-m10-dual-approval-persistence.)
 */

const { authMock, requireTenantActionMock, withTenantMock, store } = vi.hoisted(() => {
  interface Step {
    id: string;
    department: string;
    actorUserId: string;
    actorName: string;
    note: string | null;
    decidedAt: Date;
  }
  interface Doc {
    id: string;
    tenantId: string;
    approvalSubmittedAt: Date | null;
    approvalSubmittedById: string | null;
    approvalSubmittedByName: string | null;
    signedAt: Date | null;
    approvalSteps: Step[];
  }

  const docs = new Map<string, Doc>();

  const store = {
    docs,
    seed(id: string, tenantId = 'demo-tenant') {
      docs.set(id, {
        id,
        tenantId,
        approvalSubmittedAt: null,
        approvalSubmittedById: null,
        approvalSubmittedByName: null,
        signedAt: null,
        approvalSteps: [],
      });
    },
    reset() {
      docs.clear();
    },
  };

  /**
   * A transaction over the map above. It keeps the two four-eyes unique indexes,
   * so a test that gets past them here would get past them in Postgres too.
   */
  const tx = {
    followupDoc: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        const d = docs.get(where.id);
        return d && d.tenantId === where.tenantId ? structuredClone(d) : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; tenantId: string };
        data: Partial<Doc>;
      }) => {
        const d = docs.get(where.id);
        if (!d || d.tenantId !== where.tenantId) return { count: 0 };
        Object.assign(d, data);
        return { count: 1 };
      },
    },
    dualApprovalStep: {
      create: async ({ data }: { data: Step & { followupDocId: string; tenantId: string } }) => {
        const d = docs.get(data.followupDocId);
        if (!d) throw new Error('no such document');
        if (d.approvalSteps.some((s) => s.department === data.department)) {
          throw Object.assign(new Error('unique'), {
            code: 'P2002',
            meta: { target: ['followupDocId', 'department'] },
          });
        }
        if (d.approvalSteps.some((s) => s.actorUserId === data.actorUserId)) {
          throw Object.assign(new Error('unique'), {
            code: 'P2002',
            meta: { target: ['followupDocId', 'actorUserId'] },
          });
        }
        const step: Step = {
          id: `step-${d.approvalSteps.length + 1}`,
          department: data.department,
          actorUserId: data.actorUserId,
          actorName: data.actorName,
          note: data.note ?? null,
          decidedAt: data.decidedAt ?? new Date(),
        };
        d.approvalSteps.push(step);
        return step;
      },
      deleteMany: async ({ where }: { where: { followupDocId: string } }) => {
        const d = docs.get(where.followupDocId);
        const count = d?.approvalSteps.length ?? 0;
        if (d) d.approvalSteps = [];
        return { count };
      },
    },
  };

  return {
    authMock: vi.fn(),
    requireTenantActionMock: vi.fn(),
    withTenantMock: vi.fn(
      async (_tenantId: string, cb: (t: typeof tx) => Promise<unknown>) => cb(tx)
    ),
    store,
  };
});

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: requireTenantActionMock,
  TenantScopeError: class TenantScopeError extends Error {},
}));
vi.mock('@/lib/db', () => ({ withTenant: withTenantMock, prisma: {} }));
vi.mock('@/lib/llm', () => ({ generateText: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { submitDualApprovalAction, departmentApproveAction } = await import(
  '@/modules/m10/server/actions'
);

/** What `requireTenantAction()` throws when the request carries no session. */
class NoSession extends Error {
  readonly code = 'TENANT_SCOPE_REQUIRED';
}

beforeEach(() => {
  authMock.mockReset();
  requireTenantActionMock.mockReset();
  store.reset();
});

function signedInAs(user: { id: string; name?: string | null; email?: string | null }) {
  requireTenantActionMock.mockResolvedValue({
    tenantId: 'demo-tenant',
    userId: user.id,
    role: 'PIPELINE_MANAGER',
    workspaceIds: [],
    isPlatformAdmin: false,
  });
  authMock.mockResolvedValue({ user: { id: user.id, name: user.name, email: user.email } });
}

function signedOut() {
  requireTenantActionMock.mockRejectedValue(new NoSession('no tenant scope'));
  authMock.mockResolvedValue(null);
}

const ALICE = { id: 'demo-user-alice', name: 'Alice', email: 'alice@fabrika.test' };
const BOB = { id: 'demo-user-bob', name: 'Bob', email: 'bob@fabrika.test' };
const CAROL = { id: 'demo-user-carol', name: 'Carol', email: 'carol@fabrika.test' };

describe('submitDualApprovalAction', () => {
  test('stamps the audit record with the signed-in user, name and id', async () => {
    store.seed('doc-501');
    signedInAs(ALICE);

    const res = await submitDualApprovalAction('doc-501');

    expect(res.success).toBe(true);
    expect(res.approvalState!.submittedBy).toBe('Alice');
    expect(res.approvalState!.submittedByUserId).toBe('demo-user-alice');
    expect(res.approvalState!.auditTrail[0]?.actorName).toBe('Alice');
    expect(res.approvalState!.auditTrail[0]?.actorUserId).toBe('demo-user-alice');
  });

  test('the submission is written to the document, not held in memory', async () => {
    store.seed('doc-501b');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-501b');

    // The row is what a later request — a reload — will read back.
    const row = store.docs.get('doc-501b')!;
    expect(row.approvalSubmittedAt).toBeInstanceOf(Date);
    expect(row.approvalSubmittedById).toBe('demo-user-alice');
    expect(row.approvalSubmittedByName).toBe('Alice');
  });

  test('a nameless session falls back to its own e-mail, not to somebody else', async () => {
    store.seed('doc-502');
    signedInAs({ id: 'demo-user-nameless', name: null, email: 'nameless@fabrika.test' });

    const { approvalState } = await submitDualApprovalAction('doc-502');

    expect(approvalState!.submittedBy).toBe('nameless');
    expect(approvalState!.submittedByUserId).toBe('demo-user-nameless');
    expect(JSON.stringify(approvalState)).not.toContain(['Dr.', 'Mehmet', 'Yılmaz'].join(' '));
  });

  test('an anonymous call is refused and produces no audit record', async () => {
    store.seed('doc-503');
    signedOut();

    await expect(submitDualApprovalAction('doc-503')).rejects.toThrow(/no tenant scope/);
    expect(store.docs.get('doc-503')!.approvalSubmittedAt).toBeNull();
  });

  test('a document from another tenant is not opened into a flow', async () => {
    store.seed('doc-503b', 'other-tenant');
    signedInAs(ALICE);

    const res = await submitDualApprovalAction('doc-503b');

    expect(res.success).toBe(false);
    expect(store.docs.get('doc-503b')!.approvalSubmittedAt).toBeNull();
  });

  test('re-submitting keeps the original submitter — an audit line is not re-signed', async () => {
    store.seed('doc-503c');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-503c');

    signedInAs(BOB);
    const { approvalState } = await submitDualApprovalAction('doc-503c');

    expect(approvalState!.submittedBy).toBe('Alice');
    expect(approvalState!.submittedByUserId).toBe('demo-user-alice');
  });

  test('the actor cannot be supplied by the caller any more', () => {
    // One parameter: `docId`. The old signature's second argument is gone, so a
    // client cannot name the signer at all.
    expect(submitDualApprovalAction.length).toBe(1);
  });
});

describe('departmentApproveAction', () => {
  test('signs the department step with the session user and stores it', async () => {
    store.seed('doc-504');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-504');

    signedInAs(BOB);
    const approved = await departmentApproveAction('doc-504', 'FINANCE', 'Bütçe uygun');

    expect(approved.success).toBe(true);
    expect(approved.approvalState!.financeApprover).toBe('Bob');
    expect(approved.approvalState!.financeApproverUserId).toBe('demo-user-bob');
    expect(store.docs.get('doc-504')!.approvalSteps).toHaveLength(1);
  });

  test('the state is read from the database, not from the caller', () => {
    // `(docId, department, note)` — the whole workflow object used to be argument
    // one, and a server action argument is request body: the caller could describe
    // any flow it liked and have it signed.
    expect(departmentApproveAction.length).toBe(3);
  });

  test('the same person cannot approve both departments', async () => {
    store.seed('doc-506');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-506');

    signedInAs(BOB);
    await departmentApproveAction('doc-506', 'FINANCE');
    const second = await departmentApproveAction('doc-506', 'LEGAL');

    expect(second.success).toBe(false);
    expect(second).toMatchObject({ refusal: 'SAME_ACTOR_BOTH_DEPARTMENTS' });
    // And nothing was written: the flow is still waiting on legal.
    expect(store.docs.get('doc-506')!.approvalSteps).toHaveLength(1);
    expect(store.docs.get('doc-506')!.signedAt).toBeNull();
  });

  test('a department cannot approve the same document twice', async () => {
    store.seed('doc-507');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-507');

    signedInAs(BOB);
    await departmentApproveAction('doc-507', 'FINANCE');

    signedInAs(CAROL);
    const again = await departmentApproveAction('doc-507', 'FINANCE');

    expect(again).toMatchObject({ success: false, refusal: 'DEPARTMENT_ALREADY_APPROVED' });
    expect(store.docs.get('doc-507')!.approvalSteps).toHaveLength(1);
  });

  test('two people complete the flow, and the completion is the signature', async () => {
    store.seed('doc-508');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-508');

    signedInAs(BOB);
    await departmentApproveAction('doc-508', 'FINANCE');

    signedInAs(CAROL);
    const done = await departmentApproveAction('doc-508', 'LEGAL');

    expect(done.approvalState!.stage).toBe('APPROVED_AND_SIGNED');
    // Step 4 is an outcome, not a claim.
    expect(store.docs.get('doc-508')!.signedAt).toBeInstanceOf(Date);
    expect(done.success && done.signedAt).toBeTruthy();
    // Three audit lines: the submission, then one per department, each its own actor.
    expect(done.approvalState!.auditTrail.map((l) => l.actorName)).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ]);
  });

  test('legal cannot sign before finance', async () => {
    store.seed('doc-509');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-509');

    signedInAs(BOB);
    const early = await departmentApproveAction('doc-509', 'LEGAL');

    expect(early).toMatchObject({ success: false, refusal: 'WRONG_STAGE' });
    expect(store.docs.get('doc-509')!.approvalSteps).toHaveLength(0);
  });

  test('a document that was never submitted has no department to approve', async () => {
    store.seed('doc-510');
    signedInAs(BOB);

    const res = await departmentApproveAction('doc-510', 'FINANCE');

    expect(res).toMatchObject({ success: false, refusal: 'NOT_IN_FLOW' });
  });

  test('an anonymous department approval is refused', async () => {
    store.seed('doc-505');
    signedInAs(ALICE);
    await submitDualApprovalAction('doc-505');

    signedOut();
    await expect(departmentApproveAction('doc-505', 'FINANCE')).rejects.toThrow(
      /no tenant scope/
    );
    expect(store.docs.get('doc-505')!.approvalSteps).toHaveLength(0);
  });
});
