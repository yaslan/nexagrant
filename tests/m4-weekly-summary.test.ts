import { describe, test, expect } from 'vitest';
import { groupPendingActionsByFocalPoint } from '../src/lib/jobs/tasks/m4-weekly-summary';

/**
 * A relationship can be unassigned since `Relationship.ownerUserId` became
 * nullable so the KVKK/GDPR purge can detach an erased focal point
 * (TASK-MTT1XL9NP2QYU, A4 option C). The weekly summary groups due actions by
 * `tenantId:ownerUserId`, so a NULL owner used to be a plausible bug waiting to
 * happen: the key `tenant:null` would collect unrelated rows from unrelated
 * relationships under one imaginary recipient and report them as notified.
 *
 * These tests pin the grouping rule itself, which is why it is a function and
 * not a closure inside the Inngest handler — the same reason `purgeDueUsers()`
 * is exported separately from its trigger.
 */
type Action = Parameters<typeof groupPendingActionsByFocalPoint>[0][number];

function action(over: Partial<Action> = {}): Action {
  return {
    id: `r-${Math.random().toString(36).slice(2)}`,
    tenantId: 't1',
    ownerUserId: 'u1',
    counterpartName: 'Partner',
    nextStep: 'call',
    nextStepDue: new Date('2026-09-10T09:00:00Z'),
    warmth: 'warm',
    ...over,
  } as Action;
}

describe('m4 weekly summary — grouping due actions', () => {
  test('groups by tenant and focal point', () => {
    const { grouped, unassignedCount } = groupPendingActionsByFocalPoint([
      action({ tenantId: 't1', ownerUserId: 'u1' }),
      action({ tenantId: 't1', ownerUserId: 'u1' }),
      action({ tenantId: 't1', ownerUserId: 'u2' }),
      action({ tenantId: 't2', ownerUserId: 'u1' }),
    ]);

    expect([...grouped.keys()].sort()).toEqual(['t1:u1', 't1:u2', 't2:u1']);
    expect(grouped.get('t1:u1')).toHaveLength(2);
    expect(unassignedCount).toBe(0);
  });

  test('an unassigned relationship is counted, never grouped', () => {
    const { grouped, unassignedCount } = groupPendingActionsByFocalPoint([
      action({ tenantId: 't1', ownerUserId: null }),
      action({ tenantId: 't1', ownerUserId: 'u1' }),
    ]);

    expect(unassignedCount).toBe(1);
    expect([...grouped.keys()]).toEqual(['t1:u1']);
  });

  test('unassigned rows from unrelated tenants never share one recipient', () => {
    // The failure this guards against: a `tenant:null` key would fold rows the
    // erasure left behind in two different tenants into a single group and
    // report a notification that has no addressee — and, worse, one that
    // crosses a tenant boundary.
    const { grouped, unassignedCount } = groupPendingActionsByFocalPoint([
      action({ tenantId: 't1', ownerUserId: null }),
      action({ tenantId: 't2', ownerUserId: null }),
    ]);

    expect(unassignedCount).toBe(2);
    expect(grouped.size).toBe(0);
    expect([...grouped.keys()].some((k) => k.includes('null'))).toBe(false);
  });

  test('an owner id that is undefined rather than null is still not a recipient', () => {
    // Prisma returns `null`, but a partial select or a hand-built row can carry
    // `undefined`; `=== null` alone would let that one through into a
    // `t1:undefined` group.
    const { grouped, unassignedCount } = groupPendingActionsByFocalPoint([
      action({ ownerUserId: undefined as unknown as null }),
    ]);

    expect(unassignedCount).toBe(1);
    expect(grouped.size).toBe(0);
  });
});
