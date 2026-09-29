import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import {
  buildFunnel,
  buildProvinceFunnel,
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

/** One step across types, as the dashboard shows it: every step of a type holds the same count. */
function maskStep(values: Record<OrgType, number>): { total: FunnelCell; byType: Record<OrgType, FunnelCell> } {
  const steps = ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'];
  const raw = Object.fromEntries(
    ORG_TYPES.map((t) => [t, Object.fromEntries(steps.map((s) => [s, s === 'accepted' || s === 'rejected' ? 0 : values[t]]))])
  ) as Parameters<typeof buildFunnel>[0];
  const f = buildFunnel(raw);
  return {
    total: f.all.registered,
    byType: Object.fromEntries(ORG_TYPES.map((t) => [t, f.byOrgType[t].registered])) as Record<OrgType, FunnelCell>,
  };
}

const shown = (c: FunnelCell) => (c.state === 'count' ? c.value : c.state);

/** What a reader can compute: total minus every visible type cell. */
function recoverable(total: FunnelCell, byType: Record<OrgType, FunnelCell>): number | null {
  if (total.state !== 'count') return null;
  return ORG_TYPES.reduce((n, t) => n - (byType[t].state === 'count' ? (byType[t] as { value: number }).value : 0), total.value);
}

describe('across types (one step)', () => {
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
    const f = buildFunnel(raw({ SME: { registered: 12 } }));
    expect(f.all.readiness).toEqual({ state: 'unmeasured' });
    expect(f.byOrgType.SME.readiness).toEqual({ state: 'unmeasured' });
  });

  test('a group under 5 shows "<5" on every step', () => {
    const f = buildFunnel(raw({ SME: { registered: 9, pipeline: 6 }, NGO: { registered: 3, pipeline: 3 } }));
    for (const step of ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted'] as const) {
      expect(f.byOrgType.NGO[step]).toEqual({ state: 'small' });
    }
  });

  test('an agency with fewer than 5 organisations sees no number at all', () => {
    const f = buildFunnel(raw({ SME: { registered: 4, savedSearch: 4, submitted: 7 } }));
    for (const step of ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'] as const) {
      expect(f.all[step]).toEqual({ state: 'small' });
    }
  });

  test('numbers of 5 and more come through', () => {
    // 11 − 6 and 11 − 5 are groups of 5+, so no step hides another (TASK-MULXF0AVMD8MN).
    const f = buildFunnel(raw({ SME: { registered: 11, savedSearch: 6, pipeline: 5, submitted: 5 } }));
    expect(f.all.registered).toEqual({ state: 'count', value: 11 });
    expect(f.all.savedSearch).toEqual({ state: 'count', value: 6 });
    expect(f.all.pipeline).toEqual({ state: 'count', value: 5 });
    expect(f.all.submitted).toEqual({ state: 'count', value: 5 });
    expect(f.all.conceptNote).toEqual({ state: 'small' });
  });

  test('the serialised funnel carries no id or name, only states and numbers', () => {
    const f = buildFunnel(raw({ SME: { registered: 8 } }));
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/"(id|name|slug|tenantId|title)"/);
  });
});

/** Step minus the steps it contains (funnel.ts NESTED_STEPS), as a reader of one view can subtract. */
function stepLines(v: AgencyFunnel['all']): { total: number | null; parts: (number | null)[] }[] {
  const val = (c: FunnelCell) => (c.state === 'count' ? c.value : null);
  return [
    { total: val(v.registered), parts: [val(v.savedSearch)] },
    { total: val(v.registered), parts: [val(v.pipeline)] },
    { total: val(v.registered), parts: [val(v.conceptNote)] },
    { total: val(v.pipeline), parts: [val(v.conceptNote)] },
    { total: val(v.submitted), parts: [val(v.accepted), val(v.rejected)] },
  ];
}

describe('across steps (TASK-MULXF0AVMD8MN)', () => {
  test('property: in every view, a step minus the steps it contains is 0 or at least 5', () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const raw = Object.fromEntries(
        ORG_TYPES.map((t) => {
          const registered = rand() < 0.5 ? 0 : Math.floor(rand() * 15);
          const pipeline = Math.floor(registered * rand());
          const submitted = Math.floor(rand() * 15);
          const accepted = Math.floor(submitted * rand());
          return [
            t,
            {
              registered,
              savedSearch: Math.floor(registered * rand()),
              pipeline,
              conceptNote: Math.floor(pipeline * rand()),
              submitted,
              accepted,
              rejected: Math.floor((submitted - accepted) * rand()),
            },
          ];
        })
      ) as Parameters<typeof buildFunnel>[0];
      const f = buildFunnel(raw);
      for (const v of [f.all, ...ORG_TYPES.map((t) => f.byOrgType[t])]) {
        for (const l of stepLines(v)) {
          if (l.total === null) continue;
          const left = l.total - l.parts.reduce<number>((n, x) => n + (x ?? 0), 0);
          expect(left === 0 || left >= SMALL_CELL_THRESHOLD, `${l.total} − ${l.parts.join(', ')}`).toBe(true);
        }
      }
    }
  });

  test('a step is never shown when the group it belongs to is masked', () => {
    const zero = { registered: 0, savedSearch: 0, pipeline: 0, conceptNote: 0, submitted: 0, accepted: 0, rejected: 0 };
    const raw = Object.fromEntries(ORG_TYPES.map((t) => [t, { ...zero }])) as Parameters<typeof buildFunnel>[0];
    raw.SME = { registered: 20, savedSearch: 20, pipeline: 20, conceptNote: 20, submitted: 20, accepted: 10, rejected: 10 };
    raw.NGO = { registered: 3, savedSearch: 0, pipeline: 0, conceptNote: 0, submitted: 9, accepted: 9, rejected: 0 };
    const f = buildFunnel(raw);
    for (const s of ['submitted', 'accepted'] as const) expect(f.byOrgType.NGO[s]).toEqual({ state: 'small' });
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
    const f = buildProvinceFunnel(t, 'Samsun');
    expect(f.province).toBe('Samsun');
    expect(f.all.registered).toEqual({ state: 'count', value: 8 });
    expect(f.byOrgType.SME.registered).toEqual({ state: 'count', value: 8 });
    expect(f.all.readiness).toEqual({ state: 'unmeasured' });
    const all = buildFunnel(sumProvinces(t));
    expect(all.all.registered).toEqual({ state: 'count', value: 19 });
    expect(all.province).toBeNull();
  });

  test('a province with fewer than 5 organisations shows "<5" on every step, 0 included', () => {
    const t = table({ Samsun: { SME: 8 }, Amasya: { SME: 3 }, [NO_PROVINCE]: { SME: 9 } });
    for (const p of ['Amasya', 'Çorum'] as const) {
      const f = buildProvinceFunnel(t, p);
      for (const s of STEPS) expect(f.all[s]).toEqual({ state: 'small' });
    }
  });

  test('a small province cannot be recovered as total minus the visible provinces', () => {
    // 20 organisations: 15 in Samsun, 5 in Tokat, 0 without a province… except Amasya has 2
    // hidden. Visible Samsun 15 + Tokat 5 = 20 of 22 would give Amasya's 2 away.
    const t = table({ Samsun: { SME: 15 }, Tokat: { SME: 5 }, Amasya: { SME: 2 } });
    const all = buildFunnel(sumProvinces(t)).all.registered;
    expect(all).toEqual({ state: 'count', value: 22 });
    const tokat = buildProvinceFunnel(t, 'Tokat').all.registered;
    expect(tokat).toEqual({ state: 'small' });
    expect(buildProvinceFunnel(t, 'Samsun').all.registered).toEqual({ state: 'count', value: 15 });
  });

  test('il × adım (TASK-MULXF0AVMD8MN): a province step cannot be subtracted from the province total', () => {
    // Samsun: 8 organisations, 6 with a saved search → "2 without" must not be readable.
    const t = table({
      Samsun: { SME: { registered: 8, savedSearch: 6 } },
      Tokat: { SME: { registered: 7, savedSearch: 7 } },
    });
    const f = buildProvinceFunnel(t, 'Samsun');
    expect(f.all.registered).toEqual({ state: 'count', value: 8 });
    expect(f.all.savedSearch).toEqual({ state: 'small' });
    // …nor through the all-province view: 13 of 15 with a saved search would give the 2 away.
    const all = buildFunnel(sumProvinces(t));
    expect(all.all.registered).toEqual({ state: 'count', value: 15 });
    expect(all.all.savedSearch).toEqual({ state: 'small' });
    // Tokat's 7 − 7 = 0 is no group: Tokat keeps its number only if nothing else gives it away.
    const tokat = buildProvinceFunnel(t, 'Tokat');
    expect(tokat.all.registered).toEqual({ state: 'count', value: 7 });
  });

  test('a small type cell inside a province is not left recoverable from the province total', () => {
    const t = table({ Samsun: { SME: 6, MUNICIPALITY: 2 }, Tokat: { SME: 9, MUNICIPALITY: 7 } });
    const f = buildProvinceFunnel(t, 'Samsun');
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
          const pipeline = Math.floor(reg * rand());
          const submitted = Math.floor(rand() * 12);
          const accepted = Math.floor(submitted * rand());
          spec[p]![ty] = {
            registered: reg,
            savedSearch: Math.floor(reg * rand()),
            pipeline,
            conceptNote: Math.floor(pipeline * rand()),
            submitted,
            accepted,
            rejected: Math.floor((submitted - accepted) * rand()),
          };
        }
      }
      const t = table(spec);
      const overall = buildFunnel(sumProvinces(t));
      // The other 77 provinces hold nobody: every cell of theirs is "<5" and adds 0 to a sum.
      const views = new Map<string, AgencyFunnel>(
        provinces.filter((p) => p !== NO_PROVINCE).map((p) => [p, buildProvinceFunnel(t, p as TrProvince)])
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
        if (s === STEPS[0]) {
          // Across steps (TASK-MULXF0AVMD8MN): in every view, a step minus the steps it contains.
          for (const v of [overall, ...views.values()]) {
            for (const f of [v.all, ...ORG_TYPES.map((ty) => v.byOrgType[ty])]) lines.push(...stepLines(f));
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

/**
 * TASK-MULXF0AVMD8MN (FB KAMU B2 sızıntı) — the leaks crw-fb found in
 * docs/agent-results/TASK-MULWCLZHRTRK5-crw-fb.md §3.2: Ö-1 (two windows,
 * subtract one from the other) and K-6 (subtract one step from another).
 */
describe('no count is recoverable by subtracting one published number from another', () => {
  type Org = { type: OrgType; daysAgo: number; savedSearch?: boolean; pipeline?: boolean; conceptNote?: boolean };
  const zero = { registered: 0, savedSearch: 0, pipeline: 0, conceptNote: 0, submitted: 0, accepted: 0, rejected: 0 };
  const rawOf = (orgs: Org[]) => {
    const r = Object.fromEntries(ORG_TYPES.map((t) => [t, { ...zero }])) as Record<OrgType, typeof zero>;
    for (const o of orgs) {
      r[o.type].registered++;
      if (o.savedSearch) r[o.type].savedSearch++;
      if (o.pipeline) r[o.type].pipeline++;
      if (o.conceptNote) r[o.type].conceptNote++;
    }
    return r;
  };
  const many = (n: number, o: Org): Org[] => Array.from({ length: n }, () => ({ ...o }));

  /**
   * Every view the dashboard offers for the same (all-province) filter. Before
   * TASK-MULXF0AVMD8MN that was one per window —
   * `[30, 90].map((w) => buildFunnel(w, rawOf(orgs.filter((o) => o.daysAgo <= w))))` —
   * and this test failed with "registered: 12 vs 13". Now there is one cohort,
   * whatever the registration date.
   */
  const offeredViews = (orgs: Org[]): AgencyFunnel[] => [buildFunnel(rawOf(orgs))];

  test('Ö-1 (crw-fb): the 30- and 90-day views together do not give away the one municipality of days 31-90', () => {
    // crw-fb's example: MUNICIPALITY registered 5/6, pipeline 5/6, conceptNote 5/5;
    // all registered 12/13, pipeline 11/12, conceptNote 5/5. Every cell is ≥5.
    const orgs: Org[] = [
      ...many(5, { type: 'MUNICIPALITY', daysAgo: 10, pipeline: true, conceptNote: true }),
      { type: 'MUNICIPALITY', daysAgo: 60, pipeline: true },
      ...many(6, { type: 'SME', daysAgo: 10, pipeline: true }),
      { type: 'SME', daysAgo: 10 },
    ];
    const views = offeredViews(orgs);
    for (const a of views) {
      for (const b of views) {
        for (const s of ['registered', 'savedSearch', 'pipeline', 'conceptNote'] as const) {
          for (const [x, y] of [[a.all[s], b.all[s]], ...ORG_TYPES.map((t) => [a.byOrgType[t][s], b.byOrgType[t][s]])]) {
            if (x!.state !== 'count' || y!.state !== 'count') continue;
            const d = Math.abs(x!.value - y!.value);
            expect(d === 0 || d >= SMALL_CELL_THRESHOLD, `${s}: ${x!.value} vs ${y!.value}`).toBe(true);
          }
        }
      }
    }
  });

  test('K-6 (crw-fb): submitted 6, accepted 5 must not leave rejected bounded to {0, 1}', () => {
    const f = buildFunnel(
      Object.fromEntries(
        ORG_TYPES.map((t) => [
          t,
          t === 'SME'
            ? { registered: 6, savedSearch: 6, pipeline: 6, conceptNote: 6, submitted: 6, accepted: 5, rejected: 0 }
            : { ...zero },
        ])
      ) as Record<OrgType, typeof zero>
    );
    const v = (c: FunnelCell) => (c.state === 'count' ? c.value : null);
    const submitted = v(f.all.submitted);
    if (submitted !== null) {
      const left = submitted - (v(f.all.accepted) ?? 0) - (v(f.all.rejected) ?? 0);
      // What is not shown of "submitted" is accepted-or-rejected-or-pending: 0 or a group of 5+.
      expect(left === 0 || left >= SMALL_CELL_THRESHOLD, `left ${left}`).toBe(true);
    }
    expect(f.all.submitted).toEqual({ state: 'count', value: 6 });
    expect(f.all.accepted).toEqual({ state: 'small' });
    expect(f.all.rejected).toEqual({ state: 'small' });
  });

  test('registered 8, saved search 6: the 2 organisations without one are not given away', () => {
    const f = buildFunnel(rawOf([...many(6, { type: 'SME', daysAgo: 1, savedSearch: true }), ...many(2, { type: 'SME', daysAgo: 1 })]));
    const reg = f.all.registered;
    const ss = f.all.savedSearch;
    if (reg.state === 'count' && ss.state === 'count') {
      const left = reg.value - ss.value;
      expect(left === 0 || left >= SMALL_CELL_THRESHOLD, `${reg.value} − ${ss.value}`).toBe(true);
    }
    expect(f.all.registered).toEqual({ state: 'count', value: 8 });
    expect(f.all.savedSearch).toEqual({ state: 'small' });
  });
});
