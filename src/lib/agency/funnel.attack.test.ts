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
import { inviteCodeRow } from './codes';

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
 *   - (TASK-MUM17YBJVAHRR, crw-fb Ö-1) the invite-code panel of the same page,
 *     exactly as `inviteCodeRow` sends it, and how codes relate to the funnel:
 *     every organisation of the cohort registered with one use of one code, so
 *     R (registered, all) ≤ Σ used. Uses whose organisation was since deleted
 *     are the slack: Σ used = R + D. Codes have no use limit any more
 *     (TASK-MUM4WVYLSH9IT), so nothing bounds a code's uses from above; it reads
 *     whether the panel can say "exhausted" off `inviteCodeRow` itself, see
 *     {@link PANEL_SAYS_EXHAUSTED}.
 *
 *   - (TASK-MUM4WVYLSH9IT, crw-fb TASK-MUM3TMP8HU76G Ö-1) the registration form:
 *     the agency tries each of its own codes there and sees accepted or refused
 *     ({@link formAccepts}). Under a use limit, "refused" on a code it had
 *     neither revoked nor let expire meant used = limit.
 *
 *   - (TASK-MUM2RMN3YIBGC, crw-fb TASK-MUM1OTRM75QS2 Ö-1) optionally, that no
 *     organisation was ever deleted: D = 0. Deleting an organisation takes a KVKK
 *     request and a waiting period, so in a pilot's first months it is the usual
 *     case, and the agency, which invited every one of them, can know it.
 *
 * It must not learn, for any hidden count whose true value is 1..4 — a masked
 * number, a type × province cell that is never published, the organisations
 * with no province, a difference between two steps, or the uses of one code —
 * that it lies in 1..4 (its exact value included).
 */

// `readiness` last (B6, TASK-MULRR8P7HIII4), so the positional rows of the fixed
// examples below keep their meaning; a row without it has no stored result.
const STEPS = [
  'registered',
  'savedSearch',
  'pipeline',
  'conceptNote',
  'submitted',
  'accepted',
  'rejected',
  'readiness',
] as const;
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
  ['registered', 'readiness'],
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

/** One invite code as the database holds it. */
interface TrueCode {
  /** A retired column (TASK-MUM4WVYLSH9IT): set on codes made while codes had a limit, enforced by nothing. */
  maxUses?: number;
  used: number;
  revoked?: boolean;
  expired?: boolean;
}

/** A code as the attacker has it: the true uses (for scoring only) and what the panel lets it bound them to. */
interface CodeKnowledge {
  truth: number;
  lo: number;
  hi: number;
}

const NOW = Date.UTC(2026, 8, 29, 12);
/** The uses whose organisation was deleted since (Σ used − R). Not a funnel group: see the open test below. */
const DELETED = 'codes|deleted';

/**
 * Whether the panel has an "exhausted" status at all, read off the function that
 * builds it: a much-used code. Before TASK-MUM2RMN3YIBGC it had.
 */
const PANEL_SAYS_EXHAUSTED =
  inviteCodeRow(
    {
      id: 'probe',
      hint: 'ABCD',
      label: null,
      usedCount: 10_000,
      expiresAt: new Date(NOW + 86_400_000),
      revokedAt: null,
      createdAt: new Date(NOW - 86_400_000),
    },
    NOW
  ).status === ('exhausted' as string);

/**
 * A registration rule as the attacker knows it: what the form answers for a
 * code, and how many uses the rule lets a code reach.
 */
interface FormRule {
  accepts(c: TrueCode): boolean;
  cap(c: TrueCode): number;
}

/**
 * What the registration form answers when the agency tries one of its own codes:
 * redeem_agency_invite() as agency-invite-no-max-uses.sql defines it — usable
 * unless revoked or expired, however often it was used. The live test
 * "probing" in tests/agency-invite.live.test.ts asserts the same on the real
 * function under fabrika_app.
 */
const FORM_NOW: FormRule = {
  accepts: (c) => !c.revoked && !c.expired,
  cap: () => Infinity,
};

/** The form before TASK-MUM4WVYLSH9IT (add-agency-invite-code.sql): refused at used = maxUses too. Positive control only. */
const FORM_WITH_LIMIT: FormRule = {
  accepts: (c) => FORM_NOW.accepts(c) && c.used < (c.maxUses ?? Infinity),
  cap: (c) => c.maxUses ?? Infinity,
};

/** How far the attacker scans an unbounded code's uses for ones consistent with the form's answer. */
const PROBE_SCAN = 200;

/** Organisations per code in the property gate's `sequential` mode (crw-fb's org-global-zero-six). */
const SEQUENTIAL_BATCH = 6;

/**
 * The uses consistent with what the form answered, within [lo, hi]: every u for
 * which the rule gives the answer the attacker saw. Both rules are monotone in
 * u, so the consistent uses form one interval.
 */
function probe(c: TrueCode, rule: FormRule, lo: number, hi: number): [number, number] {
  hi = Math.min(hi, rule.cap(c));
  const seen = rule.accepts(c);
  const top = Math.min(hi, lo + PROBE_SCAN);
  let first = -1;
  let last = -1;
  for (let u = lo; u <= top; u++) {
    if (rule.accepts({ ...c, used: u }) !== seen) continue;
    if (first < 0) first = u;
    last = u;
  }
  if (first < 0) throw new Error('the true uses are not consistent with the form answer');
  return [first, last === top && top < hi ? hi : last];
}

/**
 * The invite-code panel: every code of the agency through `inviteCodeRow`, the
 * one function whose output reaches the page props and the list actions, then
 * through JSON as the browser receives it. The attacker reads whatever is there,
 * and, with `form`, tries every code on the registration form as well.
 */
function publishCodes(codes: TrueCode[], form?: FormRule): CodeKnowledge[] {
  return codes.map((c, i) => {
    const row = JSON.parse(
      JSON.stringify(
        inviteCodeRow(
          {
            id: `code-${i}`,
            hint: 'ABCD',
            label: null,
            usedCount: c.used,
            expiresAt: new Date(NOW + (c.expired ? -1 : 30) * 86_400_000),
            revokedAt: c.revoked ? new Date(NOW - 60_000) : null,
            createdAt: new Date(NOW - 86_400_000),
          },
          NOW
        )
      )
    ) as Record<string, unknown>;
    // A limit the panel still sent would cap the uses; none is sent, and none is enforced.
    const max = typeof row.maxUses === 'number' ? row.maxUses : Infinity;
    let lo = 0;
    let hi = max;
    if (typeof row.usedCount === 'number') lo = hi = row.usedCount;
    else if (row.usedCount === null) hi = Math.min(hi, SMALL_CELL_THRESHOLD - 1); // "<5"
    const status =
      (row.status as string | undefined) ??
      (row.revokedAt ? 'revoked' : Date.parse(row.expiresAt as string) <= NOW ? 'expired' : row.exhausted ? 'exhausted' : 'active');
    if (status === 'exhausted') lo = Math.max(lo, max);
    if (form) [lo, hi] = probe(c, form, lo, hi);
    return { truth: c.used, lo, hi };
  });
}

/**
 * Integer interval propagation. Variables: every step × (type | all) ×
 * (province | no province | all), plus `parent − child` for every subset
 * relation at every level. Equations: every total = Σ its parts.
 */
function attack(
  table: Table,
  published: Published,
  {
    rounded = true,
    codes,
    noneDeleted = false,
  }: { rounded?: boolean; codes?: CodeKnowledge[]; /** D = 0: Σ used = R. */ noneDeleted?: boolean } = {}
): Leak[] {
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
  if (codes) {
    // Σ used = R + D: R ≤ Σ used, D the uses of organisations deleted since.
    const sum = v('codes|Σused');
    const deleted = v(DELETED);
    const parts = codes.map((c, k) => {
      const i = v(`code#${k}`);
      truth[i] = c.truth;
      lo[i] = c.lo;
      hi[i] = c.hi;
      return i;
    });
    const registered = v(id('registered', ALL, ALL));
    truth[sum] = codes.reduce((n, c) => n + c.truth, 0);
    truth[deleted] = truth[sum]! - truth[registered]!;
    if (truth[deleted]! < 0) throw new Error('more organisations than code uses');
    if (noneDeleted) {
      if (truth[deleted] !== 0) throw new Error('noneDeleted, but some uses have no organisation');
      hi[deleted] = 0;
    }
    eqs.push([sum, ...parts], [sum, registered, deleted]);
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

describe('invite-code panel (TASK-MUM0M211WDIW5-crw-fb.md Kart 1 B-1, Ö-1)', () => {
  test('A = 7, B = "<5", funnel total "10" (R 8..12): B is not read back as 1..4', () => {
    // Before TASK-MUM17YBJVAHRR the panel sent A's 7: B ≥ 8 − 7 = 1 and "<5" says B ≤ 4.
    const t = tableOf({ Samsun: { SME: [10, 10, 10, 10, 0, 0, 0] } });
    const codes = publishCodes([{ used: 7 }, { used: 3 }], FORM_NOW);
    expect(attack(t, publish(t), { codes })).toEqual([]);
  });

  test('one much-used code: the panel reads "active", never how many (K-1)', () => {
    const t = tableOf({ Samsun: { SME: [8, 6, 8, 3, 2, 1, 0] } });
    expect(attack(t, publish(t), { codes: publishCodes([{ used: 8 }], FORM_NOW) })).toEqual([]);
  });

  test('"active" bounds nothing: no code has a use limit, so a funnel of 5 over two codes gives neither a floor', () => {
    const t = tableOf({ Samsun: { SME: [5, 5, 5, 5, 0, 0, 0] } });
    const codes = publishCodes([{ used: 3 }, { used: 2 }], FORM_NOW);
    expect(codes.every((c) => c.hi === Infinity)).toBe(true);
    expect(attack(t, publish(t), { codes })).toEqual([]);
    expect(attack(t, publish(t), { codes, noneDeleted: true })).toEqual([]);
  });

  test('the deleted organisations (R-2) are not read back: nothing gives Σ used a lower bound', () => {
    // One code, 8 uses; 2 of its 8 organisations deleted since: R = 6, shown "5" (5..7).
    // While the panel said "exhausted", Σ used = 8 exactly and D = 8 − R ∈ [1, 3]
    // (TASK-MUM17YBJVAHRR left this open). Without that status Σ used is only ≥ R.
    const t = tableOf({ Samsun: { SME: [6, 6, 6, 6, 0, 0, 0] } });
    const leaks = attack(t, publish(t), { codes: publishCodes([{ maxUses: 8, used: 8 }], FORM_NOW) });
    expect(leaks).toEqual([]);
  });

  test('the panel never says "exhausted": a much-used code reads "active" (TASK-MUM2RMN3YIBGC)', () => {
    expect(PANEL_SAYS_EXHAUSTED).toBe(false);
  });

  describe('probing the registration form (TASK-MUM3TMP8HU76G-crw-fb.md Kart 1 Ö-1, TASK-MUM4WVYLSH9IT)', () => {
    // crw-fb's #17 (TASK-MUM1OTRM75QS2-crw-fb.md Kart 1 B-1), org-global-zero-six: 27
    // organisations, none deleted, over five codes handed out one after another. Types are
    // disjoint, so R ≥ 13 + 13 = 26; "25" gives R ≤ 27.
    const t = tableOf({
      [NO_PROVINCE]: { MUNICIPALITY: [3, 2, 3, 0, 0, 0, 0], UNIVERSITY: [3, 2, 3, 1, 0, 0, 0] },
      Samsun: { MUNICIPALITY: [6, 4, 6, 2, 1, 0, 0], UNIVERSITY: [5, 2, 5, 1, 1, 1, 0] },
      Tokat: { MUNICIPALITY: [4, 3, 4, 3, 0, 0, 0], UNIVERSITY: [6, 4, 6, 0, 3, 2, 0] },
    });
    // The first four were made with a limit of 6 (the retired column keeps it) and used 6 times.
    const trueCodes: TrueCode[] = [6, 6, 6, 6, 3].map((used) => ({ maxUses: 6, used }));

    test('positive control: under a use limit the form says "refused" ×4, and the fifth code is read back as 2..3', () => {
      const codes = publishCodes(trueCodes, FORM_WITH_LIMIT);
      expect(codes.slice(0, 4).map((c) => [c.lo, c.hi])).toEqual([[6, 6], [6, 6], [6, 6], [6, 6]]);
      const leaks = attack(t, publish(t), { codes, noneDeleted: true });
      expect(leaks).toContainEqual({ target: 'code#4', truth: 3, lo: 2, hi: 3 });
    });

    test('no use limit: every live code is accepted, so the form tells nothing the panel does not (D = 0 and D ≥ 0)', () => {
      const codes = publishCodes(trueCodes, FORM_NOW);
      expect(trueCodes.map(FORM_NOW.accepts)).toEqual([true, true, true, true, true]);
      expect(codes.map((c) => [c.lo, c.hi])).toEqual(trueCodes.map(() => [0, Infinity]));
      expect(attack(t, publish(t), { codes, noneDeleted: true })).toEqual([]);
      expect(attack(t, publish(t), { codes })).toEqual([]);
    });

    test('"no information": the form answer is a function of the status the panel already shows, at any use count', () => {
      for (const used of [0, 1, 4, 5, 6, 7, 25, 10_000]) {
        for (const maxUses of [undefined, 1, 4, 6, 25]) {
          for (const [revoked, expired] of [[false, false], [true, false], [false, true]] as const) {
            const c: TrueCode = { maxUses, used, revoked, expired };
            const [shown] = publishCodes([c]);
            const [probed] = publishCodes([c], FORM_NOW);
            expect(probed).toEqual(shown);
          }
        }
      }
    });
  });

  test('former residual closed: codes made with a limit under 5 no longer bound their uses to 1..4', () => {
    // Before TASK-MUM4WVYLSH9IT two 4-use codes and a funnel of 5 gave each ≥ 1 (the agency
    // knew the limit it set). The retired column still holds 4, but no rule enforces it.
    const t = tableOf({ Samsun: { SME: [5, 5, 5, 5, 0, 0, 0] } });
    const codes = publishCodes(
      [
        { maxUses: 4, used: 3, revoked: true },
        { maxUses: 4, used: 2 },
      ],
      FORM_NOW
    );
    expect(attack(t, publish(t), { codes })).toEqual([]);
    expect(attack(t, publish(t), { codes, noneDeleted: true })).toEqual([]);
  });
});

describe('property: no hidden group of 1..4 is ever read back (TASK-MULZATEX4G92H gate)', () => {
  const PROVINCES = ['Samsun', 'Tokat', 'Amasya', 'Çorum'];

  const ri2 = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

  function randomTable(rand: () => number, readinessRand?: () => number): Table {
    const ri = (a: number, b: number) => ri2(rand, a, b);
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
        const row = [reg, ri(0, reg), pipeline, ri(0, pipeline), submitted, ri(0, submitted), ri(0, submitted)];
        // B6: organisations with a stored scorecard result, a subset of registered. Drawn
        // from its own stream so the other steps are the tables the earlier gate saw.
        row.push(readinessRand ? (reg === 0 ? 0 : ri2(readinessRand, 0, reg)) : 0);
        spec[p]![ty] = row;
      }
    }
    return tableOf(spec);
  }

  /** mulberry32: independent streams per seed (an LCG mod 2^31 repeated tables across seeds). */
  function stream(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
    };
  }

  /**
   * The agency's codes behind `table`: its R organisations spread over 1..3 codes, plus
   * 0..3 uses whose organisation was deleted (none when `noneDeleted`). Codes have no use
   * limit (TASK-MUM4WVYLSH9IT); some carry an old one in the retired column, and some
   * are used past it. Some are revoked or expired.
   *
   * `sequential`: codes handed out one after another, six organisations each — crw-fb's
   * org-global-zero-six (TASK-MUM1OTRM75QS2), where "exhausted" leaked the last code's uses
   * under D = 0 (21 of 3,000 tables; 0 with the random spread).
   */
  function randomCodes(table: Table, rand: () => number, noneDeleted: boolean, sequential: boolean): TrueCode[] {
    const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
    let registered = 0;
    for (const byType of table.values()) for (const ty of ORG_TYPES) registered += byType[ty].registered;
    const total = registered + (noneDeleted ? 0 : ri(0, 3));
    if (sequential) {
      const codes: TrueCode[] = [];
      for (let n = total; n > 0 || !codes.length; n -= SEQUENTIAL_BATCH) {
        codes.push({ maxUses: SEQUENTIAL_BATCH, used: Math.max(0, Math.min(SEQUENTIAL_BATCH, n)) });
      }
      return codes;
    }
    const used = Array.from({ length: ri(1, 3) }, () => 0);
    for (let n = total; n > 0; n--) used[ri(0, used.length - 1)]!++;
    return used.map((u) => {
      const r = rand();
      const legacy = rand();
      return {
        maxUses: legacy < 0.3 ? Math.max(1, u - ri(0, 3)) : legacy < 0.5 ? u + ri(0, 12) : undefined,
        used: u,
        revoked: r < 0.1,
        expired: r >= 0.1 && r < 0.2,
      };
    });
  }

  /**
   * İNCELEME-12 K-5 (TASK-MUM74FUB1DRCM): each seed takes 0.6-0.7 s on an idle
   * machine but 5.4-6.1 s under load, past vitest's 5 s default, so a busy CI
   * runner reported a leak gate as red with no leak. The bound is generous on
   * purpose: a genuine hang still fails, a slow runner does not.
   */
  const PROPERTY_TIMEOUT_MS = 30_000;

  // D ≥ 0: the attacker does not know how many organisations left. D = 0 (TASK-MUM2RMN3YIBGC,
  // crw-fb Ö-1): it knows none did — the pilot's usual case. Every seed runs in both, with
  // codes spread at random and with codes handed out one after another.
  for (const noneDeleted of [false, true]) {
    for (const sequential of [false, true]) {
      for (const seed of [1, 7, 42]) {
        const mode = `${noneDeleted ? 'D = 0' : 'D ≥ 0'}, ${sequential ? 'sequential codes of 6' : 'random codes'}`;
        test(`seed ${seed}, ${mode}: 300 random small tables, every view and the code panel joined`, () => {
          const rand = stream(seed);
          // A stream of its own, so the tables are the same ones the funnel-only gate saw.
          const codeRand = stream(seed + 1000);
          // B6: the readiness step on its own stream, same reason.
          const readinessRand = stream(seed + 2000);
          const found: string[] = [];
          let tablesWithLeak = 0;
          for (let k = 0; k < 300; k++) {
            const t = randomTable(rand, readinessRand);
            // Every funnel group, every code's uses, and the deleted organisations are gated.
            // The attacker also tries every code on the registration form (TASK-MUM4WVYLSH9IT).
            const leaks = attack(t, publish(t), {
              codes: publishCodes(randomCodes(t, codeRand, noneDeleted, sequential), FORM_NOW),
              noneDeleted,
            });
            if (leaks.length) tablesWithLeak++;
            for (const l of leaks.slice(0, 2)) found.push(`#${k} ${l.target}=${l.truth} ∈ [${l.lo}, ${l.hi}]`);
          }
          expect(found, `${tablesWithLeak}/300 tables leak`).toEqual([]);
        }, PROPERTY_TIMEOUT_MS);
      }
    }
  }
});
