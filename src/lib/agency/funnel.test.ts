import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import {
  buildFunnel,
  buildProvinceFunnel,
  maskStep,
  NO_PROVINCE,
  ORG_TYPES,
  SMALL_CELL_THRESHOLD,
  sumProvinces,
  type AgencyFunnel,
  type FunnelCell,
} from './funnel';
import type { TrProvince } from '@/lib/readiness/provinces';

/** TASK-MULRQSJFB8RWJ — small-cell rule of docs/legal/agency-channel-notice-addendum.md §3.1. */

function perType(values: Partial<Record<OrgType, number>>): Record<OrgType, number> {
  return Object.fromEntries(ORG_TYPES.map((t) => [t, values[t] ?? 0])) as Record<OrgType, number>;
}

const shown = (c: FunnelCell) => (c.state === 'count' ? c.value : c.state);

/** What a reader can compute: total minus every visible type cell. */
function recoverable(total: FunnelCell, byType: Record<OrgType, FunnelCell>): number | null {
  if (total.state !== 'count') return null;
  return ORG_TYPES.reduce((n, t) => n - (byType[t].state === 'count' ? (byType[t] as { value: number }).value : 0), total.value);
}

describe('maskStep', () => {
  test('threshold is 5', () => expect(SMALL_CELL_THRESHOLD).toBe(5));

  test('cells of 5 and more are shown, under 5 (0 included) are "<5"', () => {
    const { total, byType } = maskStep(perType({ SME: 7, MUNICIPALITY: 5 }));
    expect(shown(byType.SME)).toBe(7);
    expect(shown(byType.MUNICIPALITY)).toBe(5);
    expect(shown(byType.NGO)).toBe('small');
    expect(shown(total)).toBe(12);
  });

  test('4 is masked', () => {
    expect(shown(maskStep(perType({ SME: 4 })).byType.SME)).toBe('small');
    expect(shown(maskStep(perType({ SME: 4 })).total)).toBe('small');
  });

  test('secondary suppression: a lone small cell cannot be recovered from the total', () => {
    // 20 SMEs + 2 municipalities: showing SME=20 and total=22 would give away "2".
    const { total, byType } = maskStep(perType({ SME: 20, MUNICIPALITY: 2 }));
    expect(shown(byType.MUNICIPALITY)).toBe('small');
    expect(shown(byType.SME)).toBe('small');
    expect(shown(total)).toBe(22);
    const left = recoverable(total, byType)!;
    expect(left).toBeGreaterThanOrEqual(SMALL_CELL_THRESHOLD);
  });

  test('secondary suppression takes the smallest visible cell and keeps the rest', () => {
    const { byType } = maskStep(perType({ SME: 30, UNIVERSITY: 6, MUNICIPALITY: 1 }));
    expect(shown(byType.MUNICIPALITY)).toBe('small');
    expect(shown(byType.UNIVERSITY)).toBe('small');
    expect(shown(byType.SME)).toBe(30);
  });

  test('two small cells that already sum to 5+ need no second mask', () => {
    const { total, byType } = maskStep(perType({ SME: 10, MUNICIPALITY: 3, NGO: 3 }));
    expect(shown(byType.SME)).toBe(10);
    expect(shown(total)).toBe(16);
    expect(recoverable(total, byType)).toBe(6);
  });

  test('property: whatever the counts, what is recoverable is 0 or at least 5', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const values = perType(
        Object.fromEntries(ORG_TYPES.map((t) => [t, rand() < 0.5 ? 0 : Math.floor(rand() * 12)]))
      );
      const { total, byType } = maskStep(values);
      for (const t of ORG_TYPES) {
        const c = byType[t];
        if (c.state === 'count') expect(c.value).toBeGreaterThanOrEqual(SMALL_CELL_THRESHOLD);
      }
      const left = recoverable(total, byType);
      if (left !== null) expect(left === 0 || left >= SMALL_CELL_THRESHOLD).toBe(true);
    }
  });
});

describe('buildFunnel', () => {
  const zero = { registered: 0, savedSearch: 0, pipeline: 0, conceptNote: 0, submitted: 0, accepted: 0, rejected: 0 };
  const raw = (v: Partial<Record<OrgType, Partial<typeof zero>>>) =>
    Object.fromEntries(ORG_TYPES.map((t) => [t, { ...zero, ...(v[t] ?? {}) }])) as Record<OrgType, typeof zero>;

  test('readiness is reported as not measured, never as a number', () => {
    const f = buildFunnel(30, raw({ SME: { registered: 12 } }));
    expect(f.all.readiness).toEqual({ state: 'unmeasured' });
    expect(f.byOrgType.SME.readiness).toEqual({ state: 'unmeasured' });
  });

  test('a group under 5 shows "<5" on every step', () => {
    const f = buildFunnel(30, raw({ SME: { registered: 9, pipeline: 6 }, NGO: { registered: 3, pipeline: 3 } }));
    for (const step of ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted'] as const) {
      expect(f.byOrgType.NGO[step]).toEqual({ state: 'small' });
    }
  });

  test('an agency with fewer than 5 organisations sees no number at all', () => {
    const f = buildFunnel(90, raw({ SME: { registered: 4, savedSearch: 4, submitted: 7 } }));
    for (const step of ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'] as const) {
      expect(f.all[step]).toEqual({ state: 'small' });
    }
  });

  test('numbers of 5 and more come through', () => {
    const f = buildFunnel(30, raw({ SME: { registered: 8, savedSearch: 6, pipeline: 5, submitted: 5 } }));
    expect(f.all.registered).toEqual({ state: 'count', value: 8 });
    expect(f.all.savedSearch).toEqual({ state: 'count', value: 6 });
    expect(f.all.pipeline).toEqual({ state: 'count', value: 5 });
    expect(f.all.submitted).toEqual({ state: 'count', value: 5 });
    expect(f.all.conceptNote).toEqual({ state: 'small' });
  });

  test('the serialised funnel carries no id or name, only states and numbers', () => {
    const f = buildFunnel(30, raw({ SME: { registered: 8 } }));
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/"(id|name|slug|tenantId|title)"/);
  });
});

describe('buildProvinceFunnel (TASK-MULV3JXS1AW5X)', () => {
  const STEPS = ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'] as const;
  type Counts = Record<(typeof STEPS)[number], number>;
  const zero = (): Counts => Object.fromEntries(STEPS.map((s) => [s, 0])) as Counts;
  /** `{ Samsun: { SME: 8 } }` → every step of that cell = 8 (or a partial step map). */
  const table = (v: Record<string, Partial<Record<OrgType, number | Partial<Counts>>>>) =>
    new Map(
      Object.entries(v).map(([p, types]) => [
        p,
        Object.fromEntries(
          ORG_TYPES.map((t) => {
            const x = types[t];
            const c = typeof x === 'number' ? Object.fromEntries(STEPS.map((s) => [s, x])) : { ...zero(), ...(x ?? {}) };
            return [t, c];
          })
        ) as Record<OrgType, Counts>,
      ])
    );

  test('the province view counts that province only, and the all-province view is unchanged', () => {
    const t = table({ Samsun: { SME: 8 }, Tokat: { SME: 6 }, [NO_PROVINCE]: { SME: 5 } });
    const f = buildProvinceFunnel(30, t, 'Samsun');
    expect(f.province).toBe('Samsun');
    expect(f.all.registered).toEqual({ state: 'count', value: 8 });
    expect(f.byOrgType.SME.registered).toEqual({ state: 'count', value: 8 });
    expect(f.all.readiness).toEqual({ state: 'unmeasured' });
    const all = buildFunnel(30, sumProvinces(t));
    expect(all.all.registered).toEqual({ state: 'count', value: 19 });
    expect(all.province).toBeNull();
  });

  test('a province with fewer than 5 organisations shows "<5" on every step, 0 included', () => {
    const t = table({ Samsun: { SME: 8 }, Amasya: { SME: 3 }, [NO_PROVINCE]: { SME: 9 } });
    for (const p of ['Amasya', 'Çorum'] as const) {
      const f = buildProvinceFunnel(30, t, p);
      for (const s of STEPS) expect(f.all[s]).toEqual({ state: 'small' });
    }
  });

  test('a small province cannot be recovered as total minus the visible provinces', () => {
    // 20 organisations: 15 in Samsun, 5 in Tokat, 0 without a province… except Amasya has 2
    // hidden. Visible Samsun 15 + Tokat 5 = 20 of 22 would give Amasya's 2 away.
    const t = table({ Samsun: { SME: 15 }, Tokat: { SME: 5 }, Amasya: { SME: 2 } });
    const all = buildFunnel(30, sumProvinces(t)).all.registered;
    expect(all).toEqual({ state: 'count', value: 22 });
    const tokat = buildProvinceFunnel(30, t, 'Tokat').all.registered;
    expect(tokat).toEqual({ state: 'small' });
    expect(buildProvinceFunnel(30, t, 'Samsun').all.registered).toEqual({ state: 'count', value: 15 });
  });

  test('a small type cell inside a province is not left recoverable from the province total', () => {
    const t = table({ Samsun: { SME: 6, MUNICIPALITY: 2 }, Tokat: { SME: 9, MUNICIPALITY: 7 } });
    const f = buildProvinceFunnel(30, t, 'Samsun');
    expect(f.all.registered).toEqual({ state: 'count', value: 8 });
    expect(f.byOrgType.MUNICIPALITY.registered).toEqual({ state: 'small' });
    expect(f.byOrgType.SME.registered).toEqual({ state: 'small' });
  });

  test('property: nothing a reader can subtract across all views is 1..4', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const provinces: string[] = ['Samsun', 'Tokat', 'Amasya', 'Çorum', NO_PROVINCE];
    const types: OrgType[] = ['SME', 'MUNICIPALITY', 'NGO'];
    const val = (c: FunnelCell) => (c.state === 'count' ? c.value : null);
    for (let i = 0; i < 400; i++) {
      const spec: Record<string, Partial<Record<OrgType, Partial<Counts>>>> = {};
      for (const p of provinces) {
        spec[p] = {};
        for (const ty of types) {
          const reg = rand() < 0.4 ? 0 : Math.floor(rand() * 10);
          spec[p]![ty] = { registered: reg, savedSearch: Math.floor(reg * rand()), submitted: Math.floor(rand() * 12) };
        }
      }
      const t = table(spec);
      const overall = buildFunnel(30, sumProvinces(t));
      // The other 77 provinces hold nobody: every cell of theirs is "<5" and adds 0 to a sum.
      const views = new Map<string, AgencyFunnel>(
        provinces.filter((p) => p !== NO_PROVINCE).map((p) => [p, buildProvinceFunnel(30, t, p as TrProvince)])
      );
      for (const s of STEPS) {
        const lines: { total: number | null; parts: (number | null)[] }[] = [];
        // Across provinces: grand total vs. every province total (no-province mass is hidden).
        const colTotals = [...views.values()].map((v) => val(v.all[s]));
        lines.push({ total: val(overall.all[s]), parts: colTotals});
        for (const ty of ORG_TYPES) {
          // Along a type: type total vs. that type in every province.
          lines.push({ total: val(overall.byOrgType[ty][s]), parts: [...views.values()].map((v) => val(v.byOrgType[ty][s]))});
        }
        for (const v of views.values()) {
          // Down a province: province total vs. its types.
          lines.push({ total: val(v.all[s]), parts: ORG_TYPES.map((ty) => val(v.byOrgType[ty][s]))});
        }
        for (const v of [overall, ...views.values()]) {
          for (const c of [v.all[s], ...ORG_TYPES.map((ty) => v.byOrgType[ty][s])]) {
            const n = val(c);
            if (n !== null) expect(n).toBeGreaterThanOrEqual(SMALL_CELL_THRESHOLD);
          }
        }
        for (const l of lines) {
          if (l.total === null) continue;
          const left = l.total - l.parts.reduce<number>((n, x) => n + (x ?? 0), 0);
          expect(left === 0 || left >= SMALL_CELL_THRESHOLD).toBe(true);
        }
      }
    }
  });
});
