import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateMeetingBrief, savePostMeetingNotes } from '../../src/modules/m9/server/actions';

/**
 * The tenant is no longer a parameter of these actions — it is read from the
 * session — so the fake tenant scope lives here and the tests assert the
 * queries are keyed on it.
 *
 * `@/lib/tenant` is replaced rather than partially mocked: importing it for
 * real pulls in next-auth, which does not resolve under the vitest node
 * environment. The stub keeps the same contract (a scope, or a throw).
 */
const h = vi.hoisted(() => {
  const scope = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'TENANT_OWNER',
    workspaceIds: [] as string[],
    isPlatformAdmin: false,
  };

  class TenantScopeError extends Error {
    readonly code = 'TENANT_SCOPE_REQUIRED';
    constructor() {
      super('Request has no tenant scope; refusing to query tenant data.');
      this.name = 'TenantScopeError';
    }
  }

  class ModuleAccessError extends Error {
    readonly code = 'MODULE_ACCESS_DENIED';
    constructor(readonly moduleId: string, readonly status: string, readonly reason: string) {
      super(`Module ${moduleId} is not available (${status}/${reason}).`);
      this.name = 'ModuleAccessError';
    }
  }

  return {
    scope,
    TenantScopeError,
    ModuleAccessError,
    state: { currentScope: scope as typeof scope | null, moduleOpen: true },
    meetingBriefFindFirst: vi.fn(),
    meetingBriefCreate: vi.fn(),
    meetingBriefUpdate: vi.fn(),
    creditLedgerCreate: vi.fn(),
  };
});

const {
  scope,
  TenantScopeError,
  state,
  meetingBriefFindFirst,
  meetingBriefCreate,
  meetingBriefUpdate,
  creditLedgerCreate,
} = h;

/**
 * The module gate. `assertModuleAccess` is the first statement of every action in this
 * file, and importing it for real pulls in next-auth (which does not resolve under the
 * vitest node environment) — so it is replaced here, with `moduleOpen` steering it, and
 * the closed case is asserted below.
 */
vi.mock('../../src/lib/modules/access', () => ({
  ModuleAccessError: h.ModuleAccessError,
  assertModuleAccess: vi.fn(async (moduleId: string) => {
    if (!h.state.moduleOpen) throw new h.ModuleAccessError(moduleId, 'OFF', 'MODULE_OFF');
  }),
}));

vi.mock('../../src/lib/tenant', () => ({
  TenantScopeError: h.TenantScopeError,
  requireTenantAction: vi.fn(async () => {
    if (!h.state.currentScope) throw new h.TenantScopeError();
    return h.state.currentScope;
  }),
}));

vi.mock('../../src/lib/db', () => ({
  prisma: {},
  // The fake client is built inline below; `as never` hands it to a callback
  // typed against the real TenantTx without widening either side to `any`.
  withTenant: vi.fn(async <T,>(_tenantId: string, cb: (t: never) => Promise<T>) =>
    cb({
      creditLedger: { create: h.creditLedgerCreate },
      meetingBrief: {
        findFirst: h.meetingBriefFindFirst,
        create: h.meetingBriefCreate,
        update: h.meetingBriefUpdate,
      },
    } as never)
  ),
}));

vi.mock('../../src/lib/llm', () => ({
  generateText: vi.fn().mockResolvedValue(`### 1. Partner Background & EU Track Record
- Mock partner background output.
### 4. 3 Strategic Questions to Ask in Meeting
1. Strategic Question 1`),
}));

describe('M9 Meeting Briefs Module', () => {
  beforeEach(() => {
    state.currentScope = scope;
    state.moduleOpen = true;
    vi.clearAllMocks();
    creditLedgerCreate.mockResolvedValue({ id: 'ledger-1' });
    meetingBriefFindFirst.mockResolvedValue(null);
    meetingBriefCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'brief-123',
      tenantId: data.tenantId,
      interactionId: data.interactionId,
      content: data.content,
      createdAt: new Date(),
    }));
    meetingBriefUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'brief-123',
      content: data.content,
    }));
  });

  test('generateMeetingBrief returns formatted brief content', async () => {
    const result = await generateMeetingBrief({
      interactionId: 'int-123',
      partnerName: 'Fraunhofer Institute',
      callTopic: 'HORIZON-CL5-2026-D3-01',
    });

    expect(result.success).toBe(true);
    expect(result.brief).toBeDefined();
    expect(result.brief?.content).toContain('Partner Background');
  });

  test('generateMeetingBrief writes the session tenant, not a caller-supplied one', async () => {
    await generateMeetingBrief({
      interactionId: 'int-123',
      partnerName: 'Fraunhofer Institute',
      callTopic: 'HORIZON-CL5-2026-D3-01',
    });

    // The existing-brief lookup and the insert are both keyed on the session tenant.
    expect(meetingBriefFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { interactionId: 'int-123', tenantId: 'tenant-1' } })
    );
    expect(meetingBriefCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
  });

  test('savePostMeetingNotes formats and appends post-meeting decisions and action items', async () => {
    meetingBriefFindFirst.mockResolvedValue({
      id: 'brief-123',
      content: '### Initial Brief Content',
    });

    const result = await savePostMeetingNotes({
      briefId: 'brief-123',
      partnerName: 'Fraunhofer Institute',
      notes: 'Agreed on WP3 leadership and 16 PM effort.',
      decisions: 'NDA will be signed next week.',
      actionItems: ['Prepare NDA draft by Friday', 'Send WP3 effort matrix'],
      nextMeetingDate: '2026-09-15',
    });

    expect(result.success).toBe(true);
    expect(result.formattedPostNotes).toContain('Toplantı Sonrası Notlar & Alınan Kararlar');
    expect(result.formattedPostNotes).toContain('Prepare NDA draft by Friday');
    expect(result.formattedPostNotes).toContain('2026-09-15');
  });

  test('savePostMeetingNotes refuses a brief id that belongs to another tenant', async () => {
    // The scoped findFirst returns nothing for a foreign brief id.
    meetingBriefFindFirst.mockResolvedValue(null);

    const result = await savePostMeetingNotes({
      briefId: 'brief-from-other-tenant',
      partnerName: 'Fraunhofer Institute',
      notes: 'x',
      decisions: 'y',
      actionItems: [],
    });

    expect(result.success).toBe(false);
    expect(meetingBriefUpdate).not.toHaveBeenCalled();
  });

  test('a session with no tenant is refused instead of falling back to demo-tenant', async () => {
    state.currentScope = null;

    await expect(
      generateMeetingBrief({
        interactionId: 'int-999',
        partnerName: 'Fraunhofer Institute',
        callTopic: 'HORIZON-CL5-2026-D3-01',
      })
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  /**
   * The gate that TASK-MTQW8188AWOAT added. A closed module has to refuse *before*
   * `generateText`, which writes AiUsageLog and debits CreditLedger the moment it is
   * reached — and this action debits a credit even when the LLM call fails, so a late
   * check would have charged the tenant for a module it cannot use.
   */
  test('a closed module refuses the brief and writes no credit row', async () => {
    state.moduleOpen = false;

    await expect(
      generateMeetingBrief({
        interactionId: 'int-closed',
        partnerName: 'Fraunhofer Institute',
        callTopic: 'HORIZON-CL5-2026-D3-01',
      })
    ).rejects.toThrow(/Module M9 is not available/);

    expect(creditLedgerCreate).not.toHaveBeenCalled();
    expect(meetingBriefCreate).not.toHaveBeenCalled();
    expect(meetingBriefUpdate).not.toHaveBeenCalled();
  });
});
