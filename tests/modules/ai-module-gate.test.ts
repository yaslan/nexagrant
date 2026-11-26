import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTVBL9HBML1ZH — the module gate in front of every LLM call.
 *
 * CLAUDE.md §4: a module is usable only when the plan covers it *and* the tenant
 * has switched it on. M6 and M9 already call `assertModuleAccess()` as the first
 * statement of every AI action, with the reason written next to it: "refuse
 * before any side effect — an LLM call writes AiUsageLog and debits
 * CreditLedger". M2, M7 and M10 did not, so a module that was `off`, or that the
 * tenant's plan never sold, still reached the provider and still moved the
 * ledger.
 *
 * These tests are deliberately *not* mocked at `@/lib/llm`. Asserting that
 * `generateText` was not called would only restate the fix; the claim that has
 * to hold is about money, so the real adapter runs and the two rows it writes —
 * `AiUsageLog` and `CreditLedger` — are what the refusal cases assert on. Only
 * the session, the database and `fetch` are replaced.
 */

const h = vi.hoisted(() => {
  const session = {
    user: { id: 'user-1' },
    tenantId: 'tenant-1',
    role: 'TENANT_OWNER',
    workspaceIds: ['ws-1'],
    isPlatformAdmin: false,
  };

  return {
    session,
    /** What the fake session/database say for the test currently running. */
    state: {
      moduleStatus: 'ON' as string | null,
      /** Modules the tenant's plan grants. The refusal case removes one. */
      allowedModules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'],
    },
    auth: vi.fn(),
    moduleStateFindMany: vi.fn(),
    getEntitlements: vi.fn(),
    // The two rows a generation writes — the subject of the refusal assertions.
    aiUsageLogCreate: vi.fn(),
    creditLedgerCreate: vi.fn(),
    creditLedgerAggregate: vi.fn(),
    opportunityFindFirst: vi.fn(),
    conceptTemplateFindFirst: vi.fn(),
    topicFindUnique: vi.fn(),
    conceptNoteCreate: vi.fn(),
    conceptNoteFindFirst: vi.fn(),
    conceptNoteUpdate: vi.fn(),
    followupDocCreate: vi.fn(),
    fetchMock: vi.fn(),
  };
});

/**
 * `@/lib/tenant` imports `next/navigation` and `next/server`, neither of which
 * resolves under the vitest node environment, so it is replaced — by a stub that
 * reads the *same* session `@/lib/modules/access` does, so the gate and the
 * action can never disagree about who is calling.
 */
// NG-250: the NexaGrant AI allowance has its own tests (usage.test.ts, ng250-plan-gate.live,
// llm.ng-quota.test.ts); here it is a pass, so this file's fake tx needs no NexaGrant tables.
vi.mock('@/lib/billing/nexagrant/usage', () => ({ assertNgAiQuota: async () => undefined }));
vi.mock('@/lib/tenant', () => {
  class TenantScopeError extends Error {
    readonly code = 'TENANT_SCOPE_REQUIRED';
    constructor() {
      super('Request has no tenant scope; refusing to query tenant data.');
      this.name = 'TenantScopeError';
    }
  }
  const scopeOf = (s: { user?: { id?: string } | null; tenantId?: string } | null | undefined) =>
    s?.user?.id && s.tenantId
      ? {
          tenantId: s.tenantId,
          userId: s.user.id,
          role: 'TENANT_OWNER',
          workspaceIds: ['ws-1'],
          isPlatformAdmin: false,
        }
      : null;
  return {
    TenantScopeError,
    tenantScopeOf: scopeOf,
    requireTenantAction: async () => {
      const scope = scopeOf(await h.auth());
      if (!scope) throw new TenantScopeError();
      return scope;
    },
  };
});

vi.mock('@/lib/auth', () => ({ auth: h.auth }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
  // The real `assertTenantScope`: `findAccessibleTemplate` calls it, and this
  // file's whole point is that a refusal happens before any side effect.
  assertTenantScope: actual.assertTenantScope,
  MissingTenantScopeError: actual.MissingTenantScopeError,
  prisma: {
    moduleState: { findMany: h.moduleStateFindMany },
    // `findFirst`: the template lookup carries a tenant arm (TASK-MTVTU103F11XJ).
    conceptTemplate: { findFirst: h.conceptTemplateFindFirst },
    topic: { findUnique: h.topicFindUnique },
  },
  // `as never` hands the fake client to callbacks typed against the real
  // TenantTx without widening either side to `any`.
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb({
      // `checkModuleAccess` reads the tenant's ModuleState rows inside a tenant
      // scope as of TASK-MTVR9T834EPUC (all rows since TASK-MVBEM10PJYU0E) —
      // same spy as the `prisma` entry above, so a test that stubs one sees it
      // whichever way the gate reaches the rows.
      $executeRaw: async () => 0,
      moduleState: { findMany: h.moduleStateFindMany },
      aiUsageLog: { create: h.aiUsageLogCreate },
      creditLedger: { create: h.creditLedgerCreate, aggregate: h.creditLedgerAggregate },
      opportunity: { findFirst: h.opportunityFindFirst },
      conceptNote: {
        create: h.conceptNoteCreate,
        findFirst: h.conceptNoteFindFirst,
        update: h.conceptNoteUpdate,
      },
      followupDoc: { create: h.followupDocCreate },
    } as never),
  };
});

vi.mock('@/lib/billing', () => ({ getEntitlements: h.getEntitlements }));

vi.mock('@/lib/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key', OPENAI_API_KEY: undefined },
}));

vi.mock('@/lib/rag', () => ({
  retrieveChunks: vi.fn(async () => []),
  buildRagContext: vi.fn(async () => 'RAG context'),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn() }));

import { ModuleAccessError } from '@/lib/modules/access';
import { generateConceptNoteDraft } from '@/modules/m2/server/actions';
import { generateSectionDraft } from '@/app/[locale]/(app)/[workspace]/concept-notes/actions';
import { generateIpChecklist } from '@/modules/m7/server/actions';
import { generateStandardDoc } from '@/modules/m10/server/actions';

/**
 * Every production server action that reaches `@/lib/llm`, outside M6 and M9
 * which were already gated. Found with
 * `grep -rn "generateText\|generateCompletion" src/` — the audit that raised
 * this listed three; the concept-notes screen is the fourth, and it is the one
 * that calls `generateCompletion` directly rather than through `generateText`.
 */
const CALL_SITES: ReadonlyArray<{
  name: string;
  moduleId: string;
  run: () => Promise<unknown>;
}> = [
  {
    name: 'M2 generateConceptNoteDraft (src/modules/m2/server/actions.ts)',
    moduleId: 'M2',
    run: () => generateConceptNoteDraft('opp-1', 'tpl-1', {}),
  },
  {
    name: 'M2 generateSectionDraft (concept-notes screen)',
    moduleId: 'M2',
    run: () => generateSectionDraft('note-1', 'summary', 'Summary', 100, 'Smart Grids'),
  },
  {
    name: 'M7 generateIpChecklist',
    moduleId: 'M7',
    run: () => generateIpChecklist({ title: 'Battery sensor', trl: 5, patentStatus: 'granted' }),
  },
  {
    name: 'M10 generateStandardDoc',
    moduleId: 'M10',
    run: () => generateStandardDoc('opp-1', 'NDA'),
  },
];

/** An Anthropic response shaped like the real one, so `callProvider` parses it. */
function anthropicResponse() {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: 'generated body' }],
      usage: { input_tokens: 1200, output_tokens: 800 },
    }),
    text: async () => '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.moduleStatus = 'ON';
  h.state.allowedModules = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];

  h.auth.mockImplementation(async () => h.session);
  // Every module at the test's status; `null` is a tenant with no rows.
  h.moduleStateFindMany.mockImplementation(async () =>
    h.state.moduleStatus === null
      ? []
      : ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'].map((moduleId) => ({
          moduleId,
          status: h.state.moduleStatus,
        }))
  );
  h.getEntitlements.mockImplementation(async () => ({
    allowedModules: h.state.allowedModules,
    seats: 6,
    workspaces: 1,
    aiCreditsMonthly: 500,
  }));

  // The tenant has credits, so an unbilled call cannot be excused as "no balance".
  h.creditLedgerAggregate.mockResolvedValue({ _sum: { delta: 500 } });
  h.aiUsageLogCreate.mockResolvedValue({ id: 'usage-1' });
  h.creditLedgerCreate.mockResolvedValue({ id: 'ledger-1' });

  h.opportunityFindFirst.mockResolvedValue({ id: 'opp-1', title: 'Smart Grids', topicId: null });
  h.conceptTemplateFindFirst.mockResolvedValue({
    id: 'tpl-1',
    schema: [{ key: 'summary', labelKey: 'Summary', maxWords: 100, promptKey: 'Write a summary' }],
    sections: [{ key: 'summary', labelKey: 'Summary', maxWords: 100, promptKey: 'x' }],
  });
  h.conceptNoteCreate.mockResolvedValue({ id: 'note-1' });
  h.conceptNoteFindFirst.mockResolvedValue({ id: 'note-1', content: {}, version: 1 });
  h.conceptNoteUpdate.mockResolvedValue({ id: 'note-1' });
  h.followupDocCreate.mockResolvedValue({
    id: 'doc-1',
    tenantId: 'tenant-1',
    opportunityId: 'opp-1',
    kind: 'NDA',
    version: 1,
    contentUrl: 'https://example.invalid/doc.pdf',
  });

  h.fetchMock.mockResolvedValue(anthropicResponse());
  vi.stubGlobal('fetch', h.fetchMock);
});

describe('AI actions are gated before any side effect (CLAUDE.md §4)', () => {
  describe.each(CALL_SITES)('$name', ({ moduleId, run }) => {
    it('refuses when the module is OFF, and writes no AiUsageLog and no CreditLedger row', async () => {
      h.state.moduleStatus = 'OFF';

      await expect(run()).rejects.toBeInstanceOf(ModuleAccessError);

      // The money assertions: nothing reached the provider, nothing was logged,
      // nothing was debited.
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.aiUsageLogCreate).not.toHaveBeenCalled();
      expect(h.creditLedgerCreate).not.toHaveBeenCalled();
    });

    it('refuses when the module is ON but the plan does not cover it', async () => {
      h.state.moduleStatus = 'ON';
      h.state.allowedModules = h.state.allowedModules.filter((m) => m !== moduleId);

      const error = await run().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ModuleAccessError);
      expect((error as ModuleAccessError).reason).toBe('PLAN_UPGRADE_REQUIRED');
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.aiUsageLogCreate).not.toHaveBeenCalled();
      expect(h.creditLedgerCreate).not.toHaveBeenCalled();
    });

    it('still runs, logs and debits when the module is ON and the plan covers it', async () => {
      await expect(run()).resolves.toBeDefined();

      expect(h.fetchMock).toHaveBeenCalled();
      expect(h.aiUsageLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', module: moduleId }),
        })
      );
      expect(h.creditLedgerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', reason: `usage:${moduleId}` }),
        })
      );
    });
  });
});
