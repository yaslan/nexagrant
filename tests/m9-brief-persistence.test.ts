import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTQUX5IZ9I5VP — "the M9 brief is never saved".
 *
 * The end-to-end proof lives in tests/e2e/m9-brief-persistence.spec.ts: a real
 * click writes a real `MeetingBrief` row and the brief is still there after a
 * reload. What a browser cannot force is the *failure* half of the contract, and
 * that is what is checked here:
 *
 *   - the row is written under the tenant of the session, which is the only
 *     tenant the action can be made to write to;
 *   - a write that throws returns `success: false` with a code, never a cheerful
 *     `success: true` over a row that does not exist (the shape that made the
 *     original bug invisible: the screen said "done" and the table was empty);
 *   - a brief that belongs to another tenant is not adopted by `interactionId`,
 *     which is globally unique.
 */

const { requireTenantActionMock, withTenantMock, generateTextMock, assertModuleAccessMock } =
  vi.hoisted(() => ({
    requireTenantActionMock: vi.fn(),
    withTenantMock: vi.fn(),
    generateTextMock: vi.fn(),
    assertModuleAccessMock: vi.fn(),
  }));

vi.mock('@/lib/tenant', () => ({ requireTenantAction: requireTenantActionMock }));
vi.mock('@/lib/db', () => ({ withTenant: withTenantMock, prisma: {} }));
vi.mock('@/lib/llm', () => ({ generateText: generateTextMock }));
vi.mock('@/lib/modules/access', () => ({ assertModuleAccess: assertModuleAccessMock }));
vi.mock('@/lib/calendar/sync', () => ({ syncMeetingBriefToCalendar: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { generateMeetingBrief } = await import('@/modules/m9/server/actions');
const { isTemplateDraft, stripTemplateMarker, templateBrief, TEMPLATE_BRIEF_MARKER } = await import(
  '@/modules/m9/brief-template'
);

const SESSION_TENANT = 'tenant-of-the-session';

interface CreateArgs {
  data: Record<string, unknown>;
}
interface FindFirstArgs {
  where: Record<string, unknown>;
}

/**
 * A stand-in for the transaction `withTenant` hands the callback. `existing`
 * decides what `findFirst` answers, so both branches of the upsert are
 * reachable; every call is recorded for the assertions.
 */
function fakeTx(existing: { id: string } | null) {
  const calls = {
    findFirst: [] as FindFirstArgs[],
    create: [] as CreateArgs[],
    update: [] as { where: unknown; data: Record<string, unknown> }[],
    credit: [] as CreateArgs[],
  };
  const tx = {
    creditLedger: {
      create: async (args: CreateArgs) => {
        calls.credit.push(args);
        return args.data;
      },
    },
    meetingBrief: {
      findFirst: async (args: FindFirstArgs) => {
        calls.findFirst.push(args);
        return existing;
      },
      create: async (args: CreateArgs) => {
        calls.create.push(args);
        return { id: 'brief-new', ...args.data };
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        calls.update.push(args);
        return { id: (args.where as { id: string }).id, ...args.data };
      },
    },
  };
  return { tx, calls };
}

beforeEach(() => {
  requireTenantActionMock.mockReset();
  withTenantMock.mockReset();
  generateTextMock.mockReset();
  assertModuleAccessMock.mockReset();

  requireTenantActionMock.mockResolvedValue({
    tenantId: SESSION_TENANT,
    userId: 'user-1',
    role: 'PIPELINE_MANAGER',
    workspaceIds: [],
    isPlatformAdmin: false,
  });
  assertModuleAccessMock.mockResolvedValue(undefined);
  generateTextMock.mockResolvedValue('### 1. Partner Background\n- Generated body.');
});

const INPUT = {
  interactionId: 'int-1',
  partnerName: 'Fraunhofer Institute',
  callTopic: 'District renovation pilot',
  meetingScheduledAt: new Date('2026-10-24T12:00:00.000Z'),
};

describe('generateMeetingBrief — persistence', () => {
  test('writes the brief under the tenant of the session and returns the saved row', async () => {
    const { tx, calls } = fakeTx(null);
    withTenantMock.mockImplementation(
      async (tenantId: string, fn: (t: unknown) => Promise<unknown>) => {
        expect(tenantId).toBe(SESSION_TENANT);
        return fn(tx);
      },
    );

    const result = await generateMeetingBrief(INPUT);

    expect(result.success).toBe(true);
    expect(calls.create).toHaveLength(1);
    const written = calls.create[0]!.data;
    // The tenant comes from the session; the action takes no tenantId argument,
    // so a POST cannot aim the write at somebody else's tenant.
    expect(written.tenantId).toBe(SESSION_TENANT);
    expect(written.interactionId).toBe('int-1');
    expect(written.partnerName).toBe('Fraunhofer Institute');
    expect(written.meetingScheduledAt).toEqual(INPUT.meetingScheduledAt);
    expect(written.meetingScheduledTz).toBe('Europe/Brussels');
    expect(String(written.content).length).toBeGreaterThan(20);
    expect(result.brief?.id).toBe('brief-new');
  });

  test('a failed write is reported as a failure, never as a saved brief', async () => {
    withTenantMock.mockRejectedValue(new Error('insert failed: RLS'));

    const result = await generateMeetingBrief(INPUT);

    expect(result.success).toBe(false);
    expect(result.brief).toBeNull();
    expect(result).toMatchObject({ error: 'BRIEF_NOT_PERSISTED' });
  });

  test('an existing brief is matched on interactionId *and* tenantId', async () => {
    const { tx, calls } = fakeTx({ id: 'brief-existing' });
    withTenantMock.mockImplementation(
      async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await generateMeetingBrief(INPUT);

    expect(result.success).toBe(true);
    // `interactionId` is globally unique. Looking it up on its own would let one
    // tenant's generate overwrite another tenant's brief.
    expect(calls.findFirst[0]!.where).toEqual({ interactionId: 'int-1', tenantId: SESSION_TENANT });
    expect(calls.update).toHaveLength(1);
    expect(calls.create).toHaveLength(0);
    expect(calls.update[0]!.where).toEqual({ id: 'brief-existing' });
  });

  test('a template draft costs no credit and says, in the stored content, that it is one', async () => {
    // The model is unreachable (401 on this machine, every time). What gets
    // saved must not read as an AI brief, and must not be charged for.
    generateTextMock.mockRejectedValue(new Error('401 invalid x-api-key'));
    const { tx, calls } = fakeTx(null);
    withTenantMock.mockImplementation(
      async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await generateMeetingBrief(INPUT);

    expect(result.success).toBe(true);
    expect(result).toMatchObject({ aiGenerated: false });
    expect(calls.credit).toHaveLength(0);

    const written = String(calls.create[0]!.data.content);
    expect(isTemplateDraft(written)).toBe(true);
    // None of the claims the old fallback made about a partner nobody measured.
    for (const invented of [
      'Recognized participant in EU Framework Programmes',
      'strong technical capacity',
      'High synergy between partner core capabilities',
      '12 - 18 Person-Months',
      'Work Package Leader',
    ]) {
      expect(written).not.toContain(invented);
    }
  });

  test('the marker is machine text: it never reaches a reader', () => {
    const body = templateBrief({ partnerName: 'Fraunhofer', callTopic: 'Topic' });
    expect(isTemplateDraft(body)).toBe(true);
    expect(stripTemplateMarker(body).startsWith('###')).toBe(true);
    expect(stripTemplateMarker(body)).not.toContain(TEMPLATE_BRIEF_MARKER);
    // A generated brief is left exactly as the model wrote it.
    expect(stripTemplateMarker('### Real brief')).toBe('### Real brief');
    expect(isTemplateDraft('### Real brief')).toBe(false);
  });

  test('the credit is debited in the same transaction as the write, not before it', async () => {
    // A debit outside the transaction survives a failed insert: the tenant pays
    // for a brief that was never saved.
    const { tx, calls } = fakeTx(null);
    let creditsAtWrite = -1;
    withTenantMock.mockImplementation(
      async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => {
        const out = await fn(tx);
        creditsAtWrite = calls.credit.length;
        return out;
      },
    );

    await generateMeetingBrief(INPUT);

    expect(creditsAtWrite).toBe(1);
    expect(calls.credit[0]!.data).toMatchObject({ tenantId: SESSION_TENANT, delta: -1 });
  });
});
