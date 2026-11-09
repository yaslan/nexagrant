import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * İNCELEME-24 N-1 (TASK-MUMT3HQI1ILAR) — the eight pipeline write actions
 * resolve their tenant from the session themselves (no `requireTenantAction`),
 * so each one calls `assertTenantActionWritable` by hand. That call is what
 * stamps `digest = 'PILOT_EXPIRED'`, the only thing the browser receives in
 * production; the plain `assertTenantWritable` refuses the same write but
 * without the digest, and the board falls back to "… Lütfen tekrar deneyin."
 * (src/lib/pilot-expired.ts). Nothing pinned that choice until this file: a
 * mutant turning `createOpportunity` back to `assertTenantWritable` passed the
 * whole suite (devop-fb, mutant MB).
 *
 * Every action is the real one, called with a session and an expired pilot.
 */

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/billing/pilot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/pilot')>();
  return {
    ...actual,
    assertTenantWritable: vi.fn(async (tenantId: string) => {
      throw new actual.PilotExpiredError(tenantId, new Date('2026-09-29T09:00:00Z'));
    }),
  };
});
// İNCELEME-30 B-1: the matcher deletes and rewrites a seat's candidates. Reaching
// it at all on an expired pilot is the bug, so it throws a different error.
vi.mock('@/modules/m8/server/matching', () => ({
  generateSeatCandidates: vi.fn(async () => {
    throw new Error('the matcher must not run for a refused write');
  }),
}));
// TASK-MUN3W76B4XEJE: the consortium "Aday Bul" deletes and rewrites a seat's
// candidates too. K-579560=A made it the M8 matcher (generateSeatCandidates, mocked
// above), so the pilot refusal is asserted on that path.
vi.mock('@/lib/scoring/consortium', () => ({
  detectConflicts: vi.fn(async () => []),
}));
vi.mock('@/lib/db', () => {
  const unreachable = () => {
    throw new Error('the database must not be reached for a refused write');
  };
  return { prisma: new Proxy({}, { get: unreachable }), withTenant: vi.fn(async () => unreachable()) };
});

import { PilotExpiredError } from '@/lib/billing/pilot';
import { PILOT_EXPIRED_DIGEST } from '@/lib/pilot-expired';
import {
  addOpportunityNote,
  archiveOpportunity,
  assignOpportunityOwner,
  createOpportunity,
  declareApplication,
  evaluateOpportunityGate,
  logEffort,
  moveOpportunityStage,
} from '@/app/[locale]/(app)/[workspace]/pipeline/actions';
import {
  computeSeatCandidates,
  confirmSeatAssignment,
  inviteCandidateToSeat,
  computeSeatCandidatesForm,
} from '@/modules/m8/server/actions';
import { generateSeatCandidates } from '@/modules/m8/server/matching';
import {
  addSeat,
  assignSeat,
  findCandidates,
} from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
beforeEach(() => {
  session.current = { user: { id: 'u-1' }, tenantId: 't-1', role: 'TENANT_OWNER' };
});

const WRITES: Array<[string, () => Promise<unknown>]> = [
  ['createOpportunity', () => createOpportunity({ workspaceSlug: 'w', title: 'Fırsat' })],
  ['assignOpportunityOwner', () => assignOpportunityOwner({ opportunityId: 'o-1', ownerId: 'u-1', ownerName: 'A' })],
  ['addOpportunityNote', () => addOpportunityNote({ opportunityId: 'o-1', text: 'not', authorName: 'A', authorAvatar: 'A' })],
  ['moveOpportunityStage', () => moveOpportunityStage('o-1', 'G1')],
  ['evaluateOpportunityGate', () => evaluateOpportunityGate({ opportunityId: 'o-1', gate: 'G1' })],
  ['archiveOpportunity', () => archiveOpportunity({ opportunityId: 'o-1' })],
  ['logEffort', () => logEffort({ opportunityId: 'o-1', date: '2026-09-29', hours: 2 })],
  ['declareApplication', () => declareApplication({ opportunityId: 'o-1', declaration: 'submitted' })],
];

describe('pipeline write actions: an expired pilot leaves with the PILOT_EXPIRED digest', () => {
  test.each(WRITES)('%s', async (_name, call) => {
    const err = await call().then(
      (value) => ({ resolved: value }),
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(PilotExpiredError);
    expect((err as { digest?: string }).digest).toBe(PILOT_EXPIRED_DIGEST);
  });
});

/**
 * İNCELEME-30 B-1/B-2 (TASK-MUN39FIAKFY2R) — the M8 matching writes. "Aday Bul"
 * was marked `readOnly`, so an expired pilot skipped the gate and the matcher
 * deleted and rewrote the seat's candidates. The gate must run before any read.
 */
const M8_WRITES: Array<[string, () => Promise<unknown>]> = [
  ['computeSeatCandidates', () => computeSeatCandidates('o-1', 's-1')],
  ['inviteCandidateToSeat', () => inviteCandidateToSeat('s-1', '999', 'o-1')],
  ['confirmSeatAssignment', () => confirmSeatAssignment('s-1', 'o-1')],
];

describe('M8 matching write actions: an expired pilot is refused before anything runs', () => {
  test.each(M8_WRITES)('%s', async (_name, call) => {
    const err = await call().then(
      (value) => ({ resolved: value }),
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(PilotExpiredError);
    expect((err as { digest?: string }).digest).toBe(PILOT_EXPIRED_DIGEST);
    expect(vi.mocked(generateSeatCandidates)).not.toHaveBeenCalled();
  });

  test('computeSeatCandidatesForm answers the pilot code, not an error message', async () => {
    const fd = new FormData();
    fd.set('opportunityId', 'o-1');
    fd.set('seatId', 's-1');
    await expect(computeSeatCandidatesForm({ status: 'idle' }, fd)).resolves.toEqual({
      status: 'error',
      code: 'pilotExpired',
    });
    expect(vi.mocked(generateSeatCandidates)).not.toHaveBeenCalled();
  });
});

/**
 * TASK-MUN3W76B4XEJE — the consortium page (pipeline/[id]/consortium). Its
 * "Aday Bul" (`findCandidates`) was `readOnly` like M8's was, and the scorer
 * deletes and rewrites the seat's SeatCandidate rows. The live proof against a
 * real pilot row is tests/consortium-find-candidates-pilot.live.test.ts.
 */
const CONSORTIUM_WRITES: Array<[string, () => Promise<unknown>]> = [
  ['addSeat', () => addSeat('o-1', 'research')],
  ['findCandidates', () => findCandidates('s-1')],
  ['assignSeat', () => assignSeat('s-1', '999')],
];

describe('consortium write actions: an expired pilot is refused before anything runs', () => {
  test.each(CONSORTIUM_WRITES)('%s', async (_name, call) => {
    const err = await call().then(
      (value) => ({ resolved: value }),
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(PilotExpiredError);
    expect((err as { digest?: string }).digest).toBe(PILOT_EXPIRED_DIGEST);
    expect(vi.mocked(generateSeatCandidates)).not.toHaveBeenCalled();
  });
});
