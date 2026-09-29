import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import {
  buildAgencyFunnel,
  NO_PROVINCE,
  ORG_TYPES,
  SMALL_CELL_THRESHOLD,
  type AgencyFunnel,
  type FunnelCell,
} from './funnel';
import type { TrProvince } from '@/lib/readiness/provinces';

/**
 * TASK-MULZATEX4G92H (FB KAMU B2 sızıntı-2) — the gate for the small-cell rule
 * of docs/legal/agency-channel-notice-addendum.md §3.1.
 *
 * The earlier property tests looked at one line at a time. crw-fb's LP
 * (docs/agent-results/TASK-MULYGTXCZNCOP-crw-fb.md, Kart 1 B-1) joined every
 * published number and read masked cells back. This file is that attacker in
 * TypeScript: integer interval propagation over every number any view of the
 * dashboard publishes, until nothing tightens.
 *
 * The attacker knows:
 *   - every visible number of every view (all views are one request away):
 *     a multiple of 5 that the true count, 5 or more, rounds to (HUKUK-5);
 *   - that counts are integers ≥ 0 and add up (type × province cells to their
 *     totals, a province's types to the province, …);
 *   - the subset relations between steps (every step ⊆ registered, concept note
 *     ⊆ pipeline, accepted / rejected ⊆ submitted — organisations, not
 *     applications);
 *   - which provinces hold organisations at all (stronger than the page tells:
 *     a province nobody gave is shown as "<5" like any other).
 *
 * It must not learn, for any hidden count whose true value is 1..4 — a masked
 * number, a type × province cell that is never published, the organisations
 * with no province, or a difference between two steps — that it lies in 1..4
 * (its exact value included).
 */

const STEPS = ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'] as const;
type Step = (typeof STEPS)[number];
type Counts = Record<Step, number>;
type Table = Map<string, Record<OrgType, Counts>>;

/** parent ⊇ child, per organisation. */
const SUBSETS: readonly [Step, Step][] = [
  ['registered', 'savedSearch'],
  ['registered', 'pipeline'],
  ['registered', 'conceptNote'],
  ['registered', 'submitted'],
  ['registered', 'accepted'],
  ['registered', 'rejected'],
  ['pipeline', 'conceptNote'],
  ['submitted', 'accepted'],
  ['submitted', 'rejected'],
];

const ALL = '*';
const id = (s: string, t: string, p: string) => `${s}|${t}|${p}`;

/** Every number the dashboard can publish for `table`: id → value, or null when masked. */
type Published = Map<string, number | null>;

function record(out: Published, key: string, c: FunnelCell): void {
  if (c.state === 'unmeasured') return;
  const v = c.state === 'count' ? c.value : null;
  const prev = out.get(key);
  // The same number must look the same in every view that shows it.
  if (prev !== undefined && prev !== v) throw new Error(`${key} is ${prev} in one view and ${v} in another`);
  out.set(key, v);
}

function recordView(out: Published, f: AgencyFunnel['all'], t: string, p: string): void {
  for (const s of STEPS) record(out, id(s, t, p), f[s]);
}

/**
 * Every view the dashboard offers: no breakdown, by type, and each province
 * that occurs (any other province is all "<5"). Before TASK-MULZATEX4G92H
 * this was every province × every type —
 * `for (p of [null, ...provinces]) { f = buildProvinceFunnel(table, p); all + byOrgType }` —
 * and both crw-fb examples below, and 162-171 of each 300 random tables, leaked.
 */
function publish(table: Table): Published {
  const out: Published = new Map();
  const provinces = [...table.keys()].filter((p) => p !== NO_PROVINCE) as TrProvince[];
  recordView(out, buildAgencyFunnel(table, { dimension: 'none' }).all, ALL, ALL);
  const byType = buildAgencyFunnel(table, { dimension: 'orgType' });
  recordView(out, byType.all, ALL, ALL);
  if (byType.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
  for (const t of ORG_TYPES) recordView(out, byType.breakdown.byOrgType[t], t, ALL);
  for (const p of provinces) {
    const f = buildAgencyFunnel(table, { dimension: 'province', province: p });
    recordView(out, f.all, ALL, ALL);
    if (f.breakdown.dimension !== 'province') throw new Error('no province breakdown');
    recordView(out, f.breakdown.view, ALL, p);
    // The response carries one breakdown only: no type in it.
    expect(JSON.stringify(f)).not.toMatch(/byOrgType|MUNICIPALITY|SME/);
  }
  return out;
}

interface Leak {
  target: string;
  truth: number;
  lo: number;
  hi: number;
}

/**
 * Integer interval propagation. Variables: every step × (type | all) ×
 * (province | no province | all), plus `parent − child` for every subset
 * relation at every level. Equations: every total = Σ its parts.
 */
function attack(table: Table, published: Published, { rounded = true } = {}): Leak[] {
  const provinces = [...table.keys()];
  const types: string[] = [...ORG_TYPES, ALL];
  const places = [...provinces, ALL];
  const vars = new Map<string, number>();
  const truth: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  const v = (key: string) => {
    let i = vars.get(key);
    if (i === undefined) {
      i = truth.length;
      vars.set(key, i);
      truth.push(NaN);
      lo.push(0);
      hi.push(Infinity);
    }
    return i;
  };
  const trueCount = (s: Step, t: string, p: string): number => {
    let n = 0;
    for (const pp of p === ALL ? provinces : [p]) {
      for (const tt of t === ALL ? ORG_TYPES : [t as OrgType]) n += table.get(pp)![tt][s];
    }
    return n;
  };

  /** [total, ...parts]: total = Σ parts. */
  const eqs: number[][] = [];
  const remainder = (i: number) => `~${SUBSETS[i]![0]}-${SUBSETS[i]![1]}`;
  const lineNames: string[] = [...STEPS, ...SUBSETS.map((_, i) => remainder(i))];
  for (const s of STEPS) for (const t of types) for (const p of places) truth[v(id(s, t, p))] = trueCount(s, t, p);
  SUBSETS.forEach(([parent, child], i) => {
    for (const t of types) {
      for (const p of places) {
        const r = v(id(remainder(i), t, p));
        truth[r] = trueCount(parent, t, p) - trueCount(child, t, p);
        eqs.push([v(id(parent, t, p)), v(id(child, t, p)), r]);
      }
    }
  });
  for (const s of lineNames) {
    for (const t of types) eqs.push([v(id(s, t, ALL)), ...provinces.map((p) => v(id(s, t, p)))]);
    for (const p of places) eqs.push([v(id(s, ALL, p)), ...ORG_TYPES.map((t) => v(id(s, t, p)))]);
  }
  for (const [key, value] of published) {
    if (value === null) continue;
    const i = vars.get(key);
    if (i === undefined) continue; // a province nobody gave: every number of it is masked anyway
    // A shown number is rounded to a multiple of 5 (HUKUK-5) and never under the threshold:
    // shown 10 is 8..12, shown 5 is 5..7.
    lo[i] = rounded ? Math.max(SMALL_CELL_THRESHOLD, value - 2) : value;
    hi[i] = rounded ? value + 2 : value;
  }

  let changed = true;
  while (changed) {
    changed = false;
    const tighten = (i: number, l: number, h: number) => {
      const nl = Math.max(lo[i]!, Math.ceil(l));
      const nh = Math.min(hi[i]!, Math.floor(h));
      if (nl > nh) throw new Error(`infeasible at ${[...vars].find(([, j]) => j === i)?.[0]}`);
      if (nl !== lo[i] || nh !== hi[i]) {
        lo[i] = nl;
        hi[i] = nh;
        changed = true;
      }
    };
    for (const [total, ...parts] of eqs) {
      const sumLo = parts.reduce((n, j) => n + lo[j]!, 0);
      // Σ hi over the finite parts, and how many are unbounded (∞ − ∞ is NaN).
      const finiteHi = parts.reduce((n, j) => n + (hi[j] === Infinity ? 0 : hi[j]!), 0);
      const unbounded = parts.filter((j) => hi[j] === Infinity).length;
      tighten(total!, sumLo, unbounded ? Infinity : finiteHi);
      for (const j of parts) {
        const othersHi = unbounded - (hi[j] === Infinity ? 1 : 0) ? Infinity : finiteHi - (hi[j] === Infinity ? 0 : hi[j]!);
        tighten(j, lo[total!]! - othersHi, hi[total!]! - (sumLo - lo[j]!));
      }
    }
  }

  const leaks: Leak[] = [];
  for (const [key, i] of vars) {
    if (published.get(key) != null) continue; // visible: shown as ≥ 5 by the primary rule
    const t = truth[i]!;
    if (t >= 1 && t <= 4 && lo[i]! >= 1 && hi[i]! <= 4) leaks.push({ target: key, truth: t, lo: lo[i]!, hi: hi[i]! });
  }
  return leaks;
}

function zero(): Counts {
  return Object.fromEntries(STEPS.map((s) => [s, 0])) as Counts;
}

function tableOf(spec: Record<string, Partial<Record<OrgType, number[]>>>): Table {
  return new Map(
    Object.entries(spec).map(([p, types]) => [
      p,
      Object.fromEntries(
        ORG_TYPES.map((t) => {
          const row = types[t];
          return [t, row ? (Object.fromEntries(STEPS.map((s, i) => [s, row[i] ?? 0])) as Counts) : zero()];
        })
      ) as Record<OrgType, Counts>,
    ])
  );
}

describe('the attacker (TASK-MULZATEX4G92H)', () => {
  test('finds a lone small cell left next to a visible total (sanity: it is not a blind attacker)', () => {
    const t = tableOf({ Samsun: { SME: [9, 9, 9, 9, 0, 0, 0] } });
    // Publishing SME = 9 and "without a saved search" 9 − 9 = 0 leaks nothing …
    expect(attack(t, publish(t))).toEqual([]);
    // … but a hand-made, unrounded publication of registered 9, saved search 7 is read back as 2.
    const hand: Published = new Map([
      [id('registered', ALL, ALL), 9],
      [id('savedSearch', ALL, ALL), 7],
    ]);
    const t2 = tableOf({ Samsun: { SME: [9, 7, 9, 9, 0, 0, 0] } });
    expect(attack(t2, hand, { rounded: false }).map((l) => [l.target, l.lo, l.hi])).toContainEqual([
      id('~registered-savedSearch', ALL, ALL),
      2,
      2,
    ]);
  });
});

describe('crw-fb examples (TASK-MULYGTXCZNCOP-crw-fb.md Kart 1 B-1)', () => {
  test('Samsun: 22 = 13 MUNICIPALITY + 9 PUBLIC proves the other types empty; PUBLIC concept note 15 − 7 = 8 → 9 − 8 = 1', () => {
    // crw-fb's poc.ts: saved search and pipeline equal registered; no applications.
    const row = (reg: number, cn: number) => [reg, reg, reg, cn, 0, 0, 0];
    const t = tableOf({
      Samsun: { MUNICIPALITY: row(13, 7), PUBLIC: row(9, 8) },
      Tokat: { MUNICIPALITY: row(10, 10), PUBLIC: row(10, 10) },
    });
    expect(attack(t, publish(t))).toEqual([]);
  });

  test('registered|LARGE|<no province> = 3: 24 − 6 − 13 = 5 LARGE in Samsun, 8 − 5 = 3 without a province', () => {
    // crw-fb d1.json instance 87 (seed 1). Outcome steps are organisations now: submitted
    // ≤ registered and concept note ≤ pipeline, clamped where the random table had more.
    const t = tableOf({
      Samsun: {
        MUNICIPALITY: [6, 2, 1, 0, 3, 0, 2],
        PUBLIC: [13, 1, 7, 3, 4, 3, 0],
        LARGE: [5, 2, 3, 3, 4, 1, 1],
      },
      [NO_PROVINCE]: {
        MUNICIPALITY: [5, 3, 2, 1, 5, 5, 1],
        LARGE: [3, 1, 2, 1, 1, 1, 0],
      },
    });
    expect(attack(t, publish(t))).toEqual([]);
  });
});

describe('property: no hidden group of 1..4 is ever read back (TASK-MULZATEX4G92H gate)', () => {
  const PROVINCES = ['Samsun', 'Tokat', 'Amasya', 'Çorum'];

  function randomTable(rand: () => number): Table {
    const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
    const provinces = PROVINCES.slice(0, ri(1, 4));
    if (rand() < 0.7) provinces.push(NO_PROVINCE);
    const types = [...ORG_TYPES].sort(() => rand() - 0.5).slice(0, ri(1, 4));
    const spec: Record<string, Partial<Record<OrgType, number[]>>> = {};
    for (const p of provinces) {
      spec[p] = {};
      for (const ty of types) {
        if (rand() >= 0.8) continue;
        const reg = ri(0, rand() < 0.5 ? 6 : 14);
        const pipeline = ri(0, reg);
        const submitted = ri(0, reg);
        spec[p]![ty] = [reg, ri(0, reg), pipeline, ri(0, pipeline), submitted, ri(0, submitted), ri(0, submitted)];
      }
    }
    return tableOf(spec);
  }

  for (const seed of [1, 7, 42]) {
    test(`seed ${seed}: 300 random small tables, every view joined`, () => {
      // mulberry32: independent streams per seed (an LCG mod 2^31 repeated tables across seeds).
      let s = seed >>> 0;
      const rand = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let x = Math.imul(s ^ (s >>> 15), 1 | s);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
      };
      const found: string[] = [];
      let tablesWithLeak = 0;
      for (let k = 0; k < 300; k++) {
        const t = randomTable(rand);
        const leaks = attack(t, publish(t));
        if (leaks.length) tablesWithLeak++;
        for (const l of leaks.slice(0, 2)) found.push(`#${k} ${l.target}=${l.truth} ∈ [${l.lo}, ${l.hi}]`);
      }
      expect(found, `${tablesWithLeak}/300 tables leak`).toEqual([]);
    });
  }
});
