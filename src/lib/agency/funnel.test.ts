import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import {
  ALL,
  buildAgencyFunnel,
  buildFunnel,
  cellId,
  NO_PROVINCE,
  normalizeProvinces,
  ORG_TYPES,
  FUNNEL_ROUND_STEP,
  roundForDisplay,
  SMALL_CELL_THRESHOLD,
  suppressedCells,
  type AgencyFunnel,
  type FunnelView,
} from './funnel';

/**
 * TASK-MULRQSJFB8RWJ — small-cell rule of docs/legal/agency-channel-notice-addendum.md §3.1.
 *
 * The suppression rules are tested here on {@link suppressedCells}, with raw numbers: what a
 * reader could subtract if the numbers shown were exact. What is shown is rounded to a
 * multiple of 5 on top (HUKUK-5, TASK-MULZATEX4G92H). The joined-lines attacker that is the
 * gate for both lives in funnel.attack.test.ts.
 */

const STEPS = [
  'registered',
  'readiness',
  'savedSearch',
  'pipeline',
  'conceptNote',
  'submitted',
  'accepted',
  'rejected',
] as const;
type Step = (typeof STEPS)[number];
type Counts = Record<Step, number>;
const zero = (): Counts => Object.fromEntries(STEPS.map((s) => [s, 0])) as Counts;

/** `{ SME: 8 }` → every step of SME = 8; `{ SME: { registered: 8 } }` → that step only. */
function types(v: Partial<Record<OrgType, number | Partial<Counts>>>): Record<OrgType, Counts> {
  return Object.fromEntries(
    ORG_TYPES.map((t) => {
      const x = v[t];
      return [t, typeof x === 'number' ? (Object.fromEntries(STEPS.map((s) => [s, x])) as Counts) : { ...zero(), ...x }];
    })
  ) as Record<OrgType, Counts>;
}

function table(v: Record<string, Partial<Record<OrgType, number | Partial<Counts>>>>) {
  return new Map(Object.entries(v).map(([p, t]) => [p, types(t)]));
}

const byType = (f: AgencyFunnel): Record<OrgType, FunnelView> => {
  if (f.breakdown.dimension !== 'orgType') throw new Error('not a type breakdown');
  return f.breakdown.byOrgType;
};

describe('display', () => {
  test('threshold is 5, and shown numbers are multiples of 10 (FO-398; 5 before)', () => {
    expect(SMALL_CELL_THRESHOLD).toBe(5);
    expect(FUNNEL_ROUND_STEP).toBe(10);
    // A shown 10 is 5..14, a shown 20 is 15..24: -5..+4, and never under the threshold.
    expect([5, 6, 7, 8, 12, 13, 14, 15, 22].map((v) => roundForDisplay(v))).toEqual([10, 10, 10, 10, 10, 10, 10, 20, 20]);
    expect([5, 6, 7, 8, 12, 13, 22].map((v) => roundForDisplay(v, 5))).toEqual([5, 5, 5, 10, 10, 15, 20]);
  });

  test('readiness is a measured step since B6 (TASK-MULRR8P7HIII4): counted, rounded and masked like the others', () => {
    const f = buildFunnel(types({ SME: { registered: 12, readiness: 7 }, MUNICIPALITY: { registered: 9, readiness: 9 } }));
    expect(f.all.readiness).toEqual({ state: 'count', value: 20 }); // 7 + 9 = 16
    expect(byType(f).SME.readiness).toEqual({ state: 'count', value: 10 }); // 7
    // 9 − 9 = 0 without a result: nothing to hide.
    expect(byType(f).MUNICIPALITY.readiness).toEqual({ state: 'count', value: 10 });
    const small = buildFunnel(types({ SME: { registered: 12, readiness: 3 } }));
    expect(small.all.readiness).toEqual({ state: 'small' });
  });

  test('readiness: registered − readiness of 1..4 masks readiness (nested line)', () => {
    // 12 registered, 10 with a result: showing both would give away the 2 without one.
    const f = buildFunnel(types({ SME: { registered: 12, readiness: 10 } }));
    expect(f.all.registered).toEqual({ state: 'count', value: 10 });
    expect(f.all.readiness).toEqual({ state: 'small' });
  });

  test('numbers of 5 and more come through, rounded; under 5 (0 included) are "<5"', () => {
    const f = buildFunnel(types({ SME: 7, MUNICIPALITY: 13 }));
    expect(f.all.registered).toEqual({ state: 'count', value: 20 });
    expect(byType(f).SME.registered).toEqual({ state: 'count', value: 10 }); // 7, a shown 10 is 5..14
    expect(byType(f).MUNICIPALITY.registered).toEqual({ state: 'count', value: 10 }); // 13
    expect(byType(f).NGO.registered).toEqual({ state: 'small' });
  });

  test('an agency with fewer than 5 organisations sees no number at all', () => {
    const f = buildFunnel(types({ SME: { registered: 4, savedSearch: 4, submitted: 4 } }));
    for (const s of STEPS) expect(f.all[s]).toEqual({ state: 'small' });
  });

  test('the serialised funnel carries no id or name, only states and numbers', () => {
    const json = JSON.stringify(buildFunnel(types({ SME: 8 })));
    expect(json).not.toMatch(/"(id|name|slug|tenantId|title)"/);
  });
});

describe('one breakdown per response (TASK-MULZATEX4G92H)', () => {
  // Everyone gave a province: a lone hidden "no province" mass would mask one province (B-1).
  const t = table({ Samsun: { SME: 8, MUNICIPALITY: 7 }, Tokat: { SME: 6, MUNICIPALITY: 9 } });

  test('none: the totals only', () => {
    const f = buildAgencyFunnel(t, { dimension: 'none' });
    expect(f.breakdown).toEqual({ dimension: 'none' });
    expect(f.all.registered).toEqual({ state: 'count', value: 30 });
  });

  test('province: that province over every type, and no type at all', () => {
    const f = buildAgencyFunnel(t, { dimension: 'province', province: 'Samsun' });
    if (f.breakdown.dimension !== 'province') throw new Error('no province');
    expect(f.breakdown.province).toBe('Samsun');
    expect(f.breakdown.view.registered).toEqual({ state: 'count', value: 20 }); // 8 + 7 = 15 rounds up
    expect(JSON.stringify(f)).not.toMatch(/byOrgType|SME|MUNICIPALITY/);
  });

  test('type: every type over every province, and no province at all', () => {
    const f = buildAgencyFunnel(t, { dimension: 'orgType' });
    expect(byType(f).SME.registered).toEqual({ state: 'count', value: 10 }); // 8 + 6 = 14
    expect(byType(f).MUNICIPALITY.registered).toEqual({ state: 'count', value: 20 }); // 7 + 9 = 16
    expect(JSON.stringify(f)).not.toMatch(/Samsun|Tokat/);
  });

  test('a province with fewer than 5 organisations, or none, is "<5" on every step', () => {
    const small = table({ Samsun: { SME: 8 }, Amasya: { SME: 3 }, [NO_PROVINCE]: { SME: 9 } });
    for (const p of ['Amasya', 'Çorum'] as const) {
      const f = buildAgencyFunnel(small, { dimension: 'province', province: p });
      if (f.breakdown.dimension !== 'province') throw new Error('no province');
      for (const s of STEPS) expect(f.breakdown.view[s]).toEqual({ state: 'small' });
    }
  });

  test('the grand total is masked the same way whichever breakdown is asked for', () => {
    const views = [
      buildAgencyFunnel(t, { dimension: 'none' }),
      buildAgencyFunnel(t, { dimension: 'orgType' }),
      buildAgencyFunnel(t, { dimension: 'province', province: 'Tokat' }),
    ];
    for (const s of STEPS) for (const f of views) expect(f.all[s]).toEqual(views[0]!.all[s]);
  });
});

describe('K-2 (crw-fb): a key outside TR_PROVINCES', () => {
  test('is counted as "no province", not dropped', () => {
    const t = table({ Samsun: { SME: 10 }, Samsunn: { SME: 2 } });
    expect([...normalizeProvinces(t).keys()].sort()).toEqual([NO_PROVINCE, 'Samsun'].sort());
    // Dropped, Samsun 10 of 12 would sit next to a hidden mass it does not see; counted, the
    // 2 are a lone hidden part and Samsun is masked with them.
    const hidden = suppressedCells(t);
    expect(hidden.has(cellId('registered', ALL, 'Samsun'))).toBe(true);
    expect(hidden.has(cellId('registered', ALL, ALL))).toBe(false);
  });
});

/** Raw, unrounded: the value of a published id, or null when {@link suppressedCells} masks it. */
function exact(t: ReturnType<typeof table>) {
  const hidden = suppressedCells(t);
  const all = new Map<string, number>();
  for (const [p, tab] of normalizeProvinces(t)) {
    for (const ty of ORG_TYPES) {
      for (const s of STEPS) {
        for (const key of [cellId(s, ALL, ALL), cellId(s, ty, ALL), cellId(s, ALL, p)]) {
          all.set(key, (all.get(key) ?? 0) + tab[ty][s]);
        }
      }
    }
  }
  // cellId(s, ALL, p) and (s, ALL, ALL) were added once per type above: that is the sum over types.
  return (s: Step, ty: OrgType | typeof ALL, p: string): number | null =>
    hidden.has(cellId(s, ty, p)) ? null : (all.get(cellId(s, ty, p)) ?? 0);
}

describe('rules, on raw numbers', () => {
  test('primary: under 5 is masked, 0 included', () => {
    const v = exact(table({ [NO_PROVINCE]: { SME: 7, MUNICIPALITY: 5 } }));
    expect(v('registered', 'SME', ALL)).toBe(7);
    expect(v('registered', 'MUNICIPALITY', ALL)).toBe(5);
    expect(v('registered', 'NGO', ALL)).toBeNull();
    expect(v('registered', ALL, ALL)).toBe(12);
  });

  test('a lone small type cannot be recovered from the total', () => {
    // 20 SMEs + 2 municipalities: SME = 20 beside total 22 would give "2" away.
    const v = exact(table({ [NO_PROVINCE]: { SME: 20, MUNICIPALITY: 2 } }));
    expect(v('registered', 'MUNICIPALITY', ALL)).toBeNull();
    expect(v('registered', 'SME', ALL)).toBeNull();
    expect(v('registered', ALL, ALL)).toBe(22);
  });

  test('B-1: one hidden part above 0 is no cover, even when it is 5 or more', () => {
    // 30 SMEs, 6 universities, 0 else: University hidden alone would be 36 − 30 = 6 exactly,
    // and zeros beside it prove nothing. Two small parts together (3 + 3) do cover.
    const one = exact(table({ [NO_PROVINCE]: { SME: 30, UNIVERSITY: 6, MUNICIPALITY: 1 } }));
    expect(one('registered', 'MUNICIPALITY', ALL)).toBeNull();
    expect(one('registered', 'UNIVERSITY', ALL)).toBeNull();
    expect(one('registered', 'SME', ALL)).toBe(30);
    const two = exact(table({ [NO_PROVINCE]: { SME: 10, MUNICIPALITY: 3, NGO: 3 } }));
    expect(two('registered', 'SME', ALL)).toBe(10);
    expect(two('registered', ALL, ALL)).toBe(16);
  });

  test('B-1: the organisations without a province are never left alone behind the province line', () => {
    // 24 in Samsun, 8 without a province: Samsun 24 beside total 32 would give the 8 away, and
    // with them "LARGE without a province = 3" (crw-fb's second example).
    const v = exact(table({ Samsun: { SME: 24 }, [NO_PROVINCE]: { SME: 8 } }));
    expect(v('registered', ALL, ALL)).toBe(32);
    expect(v('registered', ALL, 'Samsun')).toBeNull();
  });

  test('across steps: registered 8, saved search 6 does not leave "2 without one"', () => {
    const v = exact(table({ [NO_PROVINCE]: { SME: { registered: 8, savedSearch: 6 } } }));
    expect(v('registered', ALL, ALL)).toBe(8);
    expect(v('savedSearch', ALL, ALL)).toBeNull();
  });

  test('Ö-1: outcomes are organisations and each is a subset of registered', () => {
    // 8 organisations, 6 applied, 5 with an accepted application: 8 − 6 = 2 and 6 − 5 = 1.
    const v = exact(table({ [NO_PROVINCE]: { SME: { registered: 8, submitted: 6, accepted: 5 } } }));
    expect(v('registered', ALL, ALL)).toBe(8);
    expect(v('submitted', ALL, ALL)).toBeNull();
    expect(v('accepted', ALL, ALL)).toBeNull();
  });

  test('accepted and rejected are each their own line under submitted (they may overlap)', () => {
    const v = exact(table({ [NO_PROVINCE]: { SME: { registered: 20, submitted: 20, accepted: 10, rejected: 18 } } }));
    expect(v('submitted', ALL, ALL)).toBe(20);
    expect(v('accepted', ALL, ALL)).toBe(10);
    expect(v('rejected', ALL, ALL)).toBeNull();
  });

  test('a step is never shown when its group is masked', () => {
    const v = exact(
      table({
        [NO_PROVINCE]: {
          SME: 20,
          NGO: { registered: 3, submitted: 3, accepted: 3 },
          MUNICIPALITY: 6,
        },
      })
    );
    for (const s of STEPS) expect(v(s, 'NGO', ALL)).toBeNull();
  });
});
