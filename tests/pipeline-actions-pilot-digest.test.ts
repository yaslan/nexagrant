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
