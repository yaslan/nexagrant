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
 * reader could subtract if the numbers shown were exact. The threshold is 10 since NG-339
 * (HUKUK-5 5c; 5 before). What is shown is rounded to a multiple of 10 on top
 * (FO-398). The joined-lines attacker that is the gate for both lives in funnel.attack.test.ts.
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
  test('threshold is 10, and shown numbers are multiples of 10 (NG-339; FO-398 step; 5 before)', () => {
    expect(SMALL_CELL_THRESHOLD).toBe(10);
    expect(FUNNEL_ROUND_STEP).toBe(10);
    // A shown 10 is 10..14, a shown 20 is 15..24: never under the threshold.
    expect([10, 11, 12, 13, 14, 15, 22].map((v) => roundForDisplay(v))).toEqual([10, 10, 10, 10, 10, 20, 20]);
  });

  test('readiness is a measured step since B6 (TASK-MULRR8P7HIII4): counted, rounded and masked like the others', () => {
    // Each type's readiness equals its registered (nothing hidden between them): 25 + 19 = 44.
    const f = buildFunnel(types({ SME: { registered: 25, readiness: 25 }, MUNICIPALITY: { registered: 19, readiness: 19 } }));
    expect(f.all.readiness).toEqual({ state: 'count', value: 40 }); // 44
    expect(byType(f).SME.readiness).toEqual({ state: 'count', value: 30 }); // 25
    expect(byType(f).MUNICIPALITY.readiness).toEqual({ state: 'count', value: 20 }); // 19
    const small = buildFunnel(types({ SME: { registered: 12, readiness: 3 } }));
    expect(small.all.readiness).toEqual({ state: 'small' });
  });

  test('readiness: registered − readiness of 1..9 masks readiness (nested line)', () => {
    // 12 registered, 10 with a result: showing both would give away the 2 without one.
    const f = buildFunnel(types({ SME: { registered: 12, readiness: 10 } }));
    expect(f.all.registered).toEqual({ state: 'count', value: 10 });
    expect(f.all.readiness).toEqual({ state: 'small' });
  });

  test('numbers of 10 and more come through, rounded; under 10 (0 included) are "<10"', () => {
    const f = buildFunnel(types({ SME: 25, MUNICIPALITY: 13 }));
    expect(f.all.registered).toEqual({ state: 'count', value: 40 }); // 38
    expect(byType(f).SME.registered).toEqual({ state: 'count', value: 30 }); // 25
    expect(byType(f).MUNICIPALITY.registered).toEqual({ state: 'count', value: 10 }); // 13, a shown 10 is 10..14
    expect(byType(f).NGO.registered).toEqual({ state: 'small' }); // 0 is masked too
  });

  test('a visible type beside a lone hidden one is masked too: the total would give the hidden one away', () => {
    // SME 7 is hidden on its own; total 20 − MUNICIPALITY 13 would give SME 7 exactly, so MUNICIPALITY goes too.
    const f = buildFunnel(types({ SME: 7, MUNICIPALITY: 13 }));
    expect(f.all.registered).toEqual({ state: 'count', value: 20 });
    expect(byType(f).SME.registered).toEqual({ state: 'small' });
    expect(byType(f).MUNICIPALITY.registered).toEqual({ state: 'small' });
  });

  test('an agency with fewer than 10 organisations sees no number at all', () => {
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
  const t = table({ Samsun: { SME: 18, MUNICIPALITY: 17 }, Tokat: { SME: 16, MUNICIPALITY: 19 } });

  test('none: the totals only', () => {
    const f = buildAgencyFunnel(t, { dimension: 'none' });
    expect(f.breakdown).toEqual({ dimension: 'none' });
    expect(f.all.registered).toEqual({ state: 'count', value: 70 });
  });

  test('province: that province over every type, and no type at all', () => {
    const f = buildAgencyFunnel(t, { dimension: 'province', province: 'Samsun' });
    if (f.breakdown.dimension !== 'province') throw new Error('no province');
    expect(f.breakdown.province).toBe('Samsun');
    expect(f.breakdown.view.registered).toEqual({ state: 'count', value: 40 }); // 18 + 17 = 35 rounds up
    expect(JSON.stringify(f)).not.toMatch(/byOrgType|SME|MUNICIPALITY/);
  });

  test('type: every type over every province, and no province at all', () => {
    const f = buildAgencyFunnel(t, { dimension: 'orgType' });
    expect(byType(f).SME.registered).toEqual({ state: 'count', value: 30 }); // 18 + 16 = 34
    expect(byType(f).MUNICIPALITY.registered).toEqual({ state: 'count', value: 40 }); // 17 + 19 = 36
    expect(JSON.stringify(f)).not.toMatch(/Samsun|Tokat/);
  });

  test('a province with fewer than 10 organisations, or none, is "<10" on every step', () => {
    const small = table({ Samsun: { SME: 18 }, Amasya: { SME: 9 }, [NO_PROVINCE]: { SME: 19 } });
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
    const t = table({ Samsun: { SME: 20 }, Samsunn: { SME: 2 } });
    expect([...normalizeProvinces(t).keys()].sort()).toEqual([NO_PROVINCE, 'Samsun'].sort());
    // Dropped, Samsun 20 of 22 would sit next to a hidden mass it does not see; counted, the
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
  test('primary: under 10 is masked, 0 included', () => {
    // 9 + 9 hidden together (18 ≥ 10) cover each other; the visible 25 is not derivable.
    const v = exact(table({ [NO_PROVINCE]: { SME: 25, MUNICIPALITY: 9, NGO: 9 } }));
    expect(v('registered', 'SME', ALL)).toBe(25);
    expect(v('registered', 'MUNICIPALITY', ALL)).toBeNull();
    expect(v('registered', 'NGO', ALL)).toBeNull();
    expect(v('registered', 'UNIVERSITY', ALL)).toBeNull(); // 0 is masked too
    expect(v('registered', ALL, ALL)).toBe(43);
  });

  test('a lone small type cannot be recovered from the total', () => {
    // 20 SMEs + 2 municipalities: SME = 20 beside total 22 would give "2" away.
    const v = exact(table({ [NO_PROVINCE]: { SME: 20, MUNICIPALITY: 2 } }));
    expect(v('registered', 'MUNICIPALITY', ALL)).toBeNull();
    expect(v('registered', 'SME', ALL)).toBeNull();
    expect(v('registered', ALL, ALL)).toBe(22);
  });

  test('B-1: one hidden part above 0 is no cover, even when it is 10 or more', () => {
    // 30 SMEs, 12 universities, 1 municipality: the municipality is hidden alone, so the
    // university would be total − SME − 1 = 12 exactly; it is masked with it, and SME is
    // the cover that is left to show. Two hidden parts together (1 + 12 = 13 ≥ 10) do cover.
    const one = exact(table({ [NO_PROVINCE]: { SME: 30, UNIVERSITY: 12, MUNICIPALITY: 1 } }));
    expect(one('registered', 'MUNICIPALITY', ALL)).toBeNull();
    expect(one('registered', 'UNIVERSITY', ALL)).toBeNull();
    expect(one('registered', 'SME', ALL)).toBe(30);
  });

  test('B-1: two hidden parts that sum under the threshold cover nothing: the visible one is masked', () => {
    // 6 + 3 = 9 < 10 hidden: total − SME would give 9 exactly, so SME is masked as well.
    const v = exact(table({ [NO_PROVINCE]: { SME: 30, MUNICIPALITY: 6, NGO: 3 } }));
    expect(v('registered', 'SME', ALL)).toBeNull();
    expect(v('registered', 'MUNICIPALITY', ALL)).toBeNull();
    expect(v('registered', 'NGO', ALL)).toBeNull();
  });

  test('B-1: two hidden parts that sum to the threshold or more cover each other', () => {
    const two = exact(table({ [NO_PROVINCE]: { SME: 30, MUNICIPALITY: 6, NGO: 6 } }));
    expect(two('registered', 'SME', ALL)).toBe(30);
    expect(two('registered', ALL, ALL)).toBe(42);
  });

  test('B-1: the organisations without a province are never left alone behind the province line', () => {
    // 24 in Samsun, 8 without a province: Samsun 24 beside total 32 would give the 8 away.
    const v = exact(table({ Samsun: { SME: 24 }, [NO_PROVINCE]: { SME: 8 } }));
    expect(v('registered', ALL, ALL)).toBe(32);
    expect(v('registered', ALL, 'Samsun')).toBeNull();
  });

  test('across steps: registered 18, saved search 16 does not leave "2 without one"', () => {
    const v = exact(table({ [NO_PROVINCE]: { SME: { registered: 18, savedSearch: 16 } } }));
    expect(v('registered', ALL, ALL)).toBe(18);
    expect(v('savedSearch', ALL, ALL)).toBeNull();
  });

  test('Ö-1: outcomes are organisations and each is a subset of registered', () => {
    // 18 organisations, 16 applied, 15 with an accepted application: 18 − 16 = 2 and 16 − 15 = 1.
    const v = exact(table({ [NO_PROVINCE]: { SME: { registered: 18, submitted: 16, accepted: 15 } } }));
    expect(v('registered', ALL, ALL)).toBe(18);
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
          SME: 30,
          NGO: { registered: 3, submitted: 3, accepted: 3 },
          MUNICIPALITY: 12,
        },
      })
    );
    for (const s of STEPS) expect(v(s, 'NGO', ALL)).toBeNull();
  });
});
