import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * TASK-MUNZ7N9IT8VPY (İNCELEME-75 follow-up) — "Aday Bul" answers a code, never
 * the text of what it caught.
 *
 * `computeSeatCandidatesForm` returned `{ message: errorMessage(e) }`, and the
 * state of a `useActionState` form is serialised to the browser as it is: a
 * Prisma error arrived there with its table and column names. A seat that is
 * not in the workspace keeps its own answer (`seatNotFound`); everything else
 * is `computeFailed`, with the detail in the server log.
 */

const m = vi.hoisted(() => ({
  seat: { id: 's-1' } as { id: string } | null,
  match: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn(async () => ({ tenantId: 't-1', userId: 'u-1', role: 'TENANT_OWNER' })),
}));
vi.mock('@/lib/db', () => ({
  withTenant: vi.fn(async (_t: string, cb: (tx: unknown) => unknown) =>
    cb({ consortiumSeat: { findFirst: async () => m.seat } })
  ),
}));
vi.mock('@/modules/m8/server/matching', () => ({ generateSeatCandidates: m.match }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { computeSeatCandidatesForm } from '@/modules/m8/server/actions';
import { SeatNotFoundError } from '@/modules/m8/server/errors';

/** What Prisma put in a real failure's message (tests/workspace-scoped-writes.test.ts). */
const PRISMA_TEXT =
  'Invalid `tx.seatCandidate.deleteMany()` invocation: The table `public.SeatCandidate` does not exist in the current database.';

function form(fields: Record<string, string> = { opportunityId: 'o-1', seatId: 's-1' }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  m.seat = { id: 's-1' };
  m.match.mockReset();
});

describe('computeSeatCandidatesForm error answers', () => {
  test('a Prisma error becomes computeFailed; its text stays in the server log', async () => {
    m.match.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(PRISMA_TEXT, { code: 'P2021', clientVersion: 'test' })
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await computeSeatCandidatesForm({ status: 'idle' }, form());

    expect(state).toEqual({ status: 'error', code: 'computeFailed' });
    expect(JSON.stringify(state)).not.toMatch(/SeatCandidate|invocation|P2021/);
    expect(log).toHaveBeenCalledWith(
      '[m8] computeSeatCandidatesForm failed',
      expect.objectContaining({ message: PRISMA_TEXT })
    );
    log.mockRestore();
  });

  test('a plain Error is not mistaken for a domain error', async () => {
    m.match.mockRejectedValueOnce(new Error('Seat s-1 not found in this workspace.'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    await expect(computeSeatCandidatesForm({ status: 'idle' }, form())).resolves.toEqual({
      status: 'error',
      code: 'computeFailed',
    });
  });

  test('a seat outside the workspace answers seatNotFound', async () => {
    m.seat = null;
    await expect(computeSeatCandidatesForm({ status: 'idle' }, form())).resolves.toEqual({
      status: 'error',
      code: 'seatNotFound',
    });
    expect(m.match).not.toHaveBeenCalled();
  });

  test("the matcher's own not-found (opportunity gone mid-run) answers seatNotFound", async () => {
    m.match.mockRejectedValueOnce(new SeatNotFoundError('Opportunity o-1 not found in this workspace.'));
    await expect(computeSeatCandidatesForm({ status: 'idle' }, form())).resolves.toEqual({
      status: 'error',
      code: 'seatNotFound',
    });
  });

  test.each([
    ['no seat id', { opportunityId: 'o-1' }],
    ['no opportunity id', { seatId: 's-1' }],
  ])('%s answers seatNotFound without reaching the matcher', async (_name, fields) => {
    await expect(computeSeatCandidatesForm({ status: 'idle' }, form(fields))).resolves.toEqual({
      status: 'error',
      code: 'seatNotFound',
    });
    expect(m.match).not.toHaveBeenCalled();
  });

  test('success still reports the count', async () => {
    m.match.mockResolvedValueOnce([{}, {}, {}]);
    await expect(computeSeatCandidatesForm({ status: 'idle' }, form())).resolves.toEqual({
      status: 'ok',
      count: 3,
    });
  });
});
