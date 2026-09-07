import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTR60M5ESB5PZ — the server-action boundary, not just the pure engine.
 *
 * `submitDualApprovalAction(docId, actorName)` used to take the actor name as a
 * second argument with a real person's name as its default, so a POST that named
 * nobody signed the audit record as that person. The action must now read the
 * actor from the session alone, and refuse when there is no session.
 */

const { authMock, requireTenantActionMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  requireTenantActionMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: requireTenantActionMock,
  TenantScopeError: class TenantScopeError extends Error {},
}));
// Pulled in by the module under test; none of these run on the approval path.
vi.mock('@/lib/db', () => ({ withTenant: vi.fn(), prisma: {} }));
vi.mock('@/lib/ai/llm', () => ({ generateText: vi.fn() }));
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

describe('submitDualApprovalAction', () => {
  test('stamps the audit record with the signed-in user, name and id', async () => {
    signedInAs({ id: 'demo-user-alice', name: 'Alice', email: 'alice@fabrika.test' });

    const { approvalState } = await submitDualApprovalAction('doc-501');

    expect(approvalState.submittedBy).toBe('Alice');
    expect(approvalState.submittedByUserId).toBe('demo-user-alice');
    expect(approvalState.auditTrail[0]?.actorName).toBe('Alice');
    expect(approvalState.auditTrail[0]?.actorUserId).toBe('demo-user-alice');
  });

  test('a nameless session falls back to its own e-mail, not to somebody else', async () => {
    signedInAs({ id: 'demo-user-nameless', name: null, email: 'nameless@fabrika.test' });

    const { approvalState } = await submitDualApprovalAction('doc-502');

    expect(approvalState.submittedBy).toBe('nameless');
    expect(approvalState.submittedByUserId).toBe('demo-user-nameless');
    expect(JSON.stringify(approvalState)).not.toContain(['Dr.', 'Mehmet', 'Yılmaz'].join(' '));
  });

  test('an anonymous call is refused and produces no audit record', async () => {
    signedOut();

    await expect(submitDualApprovalAction('doc-503')).rejects.toThrow(/no tenant scope/);
  });

  test('the actor cannot be supplied by the caller any more', () => {
    // One parameter: `docId`. The old signature's second argument is gone, so a
    // client cannot name the signer at all.
    expect(submitDualApprovalAction.length).toBe(1);
  });
});

describe('departmentApproveAction', () => {
  test('signs the department step with the session user', async () => {
    signedInAs({ id: 'demo-user-alice', name: 'Alice', email: 'alice@fabrika.test' });
    const { approvalState } = await submitDualApprovalAction('doc-504');

    signedInAs({ id: 'demo-user-bob', name: 'Bob', email: 'bob@fabrika.test' });
    const approved = await departmentApproveAction(approvalState, 'FINANCE', 'Bütçe uygun');

    expect(approved.approvalState.financeApprover).toBe('Bob');
    expect(approved.approvalState.financeApproverUserId).toBe('demo-user-bob');
  });

  test('an anonymous department approval is refused', async () => {
    signedInAs({ id: 'demo-user-alice', name: 'Alice', email: 'alice@fabrika.test' });
    const { approvalState } = await submitDualApprovalAction('doc-505');

    signedOut();
    await expect(departmentApproveAction(approvalState, 'FINANCE')).rejects.toThrow(
      /no tenant scope/
    );
  });
});
