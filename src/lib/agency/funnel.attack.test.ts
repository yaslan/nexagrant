import { appendFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import {
  buildAgencyFunnel,
  NO_PROVINCE,
  ORG_TYPES,
  SMALL_CELL_THRESHOLD,
  type AgencyFunnel,
  type FunnelCell,
  FUNNEL_ROUND_STEP,
} from './funnel';
import type { TrProvince } from '@/lib/readiness/provinces';
import { inviteCodeRow } from './codes';
import {
  INVITE_CODE_MAX_USE_LIMIT,
  INVITE_CODE_MIN_USE_LIMIT,
  INVITE_CODE_USE_LIMIT_SPREAD,
  newInviteCodeUseLimit,
} from './invite-policy';

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
 *     a multiple of the rounding step (10 since FO-398, 5 before; HUKUK-5) that the true
 *     count, 5 or more, rounds to;
 *   - that counts are integers ≥ 0 and add up (type × province cells to their
 *     totals, a province's types to the province, …);
 *   - the subset relations between steps (every step ⊆ registered, concept note
 *     ⊆ pipeline, accepted / rejected ⊆ submitted — organisations, not
 *     applications);
 *   - which provinces hold organisations at all (stronger than the page tells:
 *     a province nobody gave is shown masked like any other).
 *
 *   - (TASK-MUM17YBJVAHRR, crw-fb Ö-1) the invite-code panel of the same page,
 *     exactly as `inviteCodeRow` sends it, and how codes relate to the funnel:
 *     every organisation of the cohort registered with one use of one code, so
 *     R (registered, all) ≤ Σ used. Uses whose organisation was since deleted
 *     are the slack: Σ used = R + D. A code from before FO-392 has no use limit, so
 *     nothing bounds its uses from above; it reads whether the panel can say
 *     "exhausted" off `inviteCodeRow` itself, see {@link PANEL_SAYS_EXHAUSTED}.
 *     A code made since FO-392 has a real limit of 500..524 that is hidden
 *     (K-577268): the attacker knows the range ({@link POLICY_KNOWLEDGE}, read off
 *     the exports of invite-policy.ts, so removing the spread gives it the exact
 *     number), not the code's own value.
 *
 *   - (TASK-MUM4WVYLSH9IT, crw-fb TASK-MUM3TMP8HU76G Ö-1) the registration form:
 *     the agency tries each of its own codes there and sees accepted or refused
 *     ({@link formUseLimit}). Under a use limit, "refused" on a code it had
 *     neither revoked nor let expire meant used = limit. Since K-577268 the
 *     limit is not known exactly, so "refused" means used in [500, 524].
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
 * that occurs (any other province is all masked). Before TASK-MULZATEX4G92H
 * this was every province × every type —
 * `for (p of [null, ...provinces]) { f = buildProvinceFunnel(table, p); all + byOrgType }` —
 * and both crw-fb examples below, and 162-171 of each 300 random tables, leaked.
 */
/**
 * FO-398: the rounding unit the funnel under test runs with. Default = the shipped one
 * ({@link FUNNEL_ROUND_STEP}); the positive controls set 5, the unit before FO-398.
 */
let activeStep: number = FUNNEL_ROUND_STEP;
function withStep<T>(step: number, fn: () => T): T {
  const prev = activeStep;
  activeStep = step;
  try {
    return fn();
  } finally {
    activeStep = prev;
  }
}

function publish(table: Table): Published {
  const out: Published = new Map();
  const provinces = [...table.keys()].filter((p) => p !== NO_PROVINCE) as TrProvince[];
  recordView(out, buildAgencyFunnel(table, { dimension: 'none' }, activeStep).all, ALL, ALL);
  const byType = buildAgencyFunnel(table, { dimension: 'orgType' }, activeStep);
  recordView(out, byType.all, ALL, ALL);
  if (byType.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
  for (const t of ORG_TYPES) recordView(out, byType.breakdown.byOrgType[t], t, ALL);
  for (const p of provinces) {
    const f = buildAgencyFunnel(table, { dimension: 'province', province: p }, activeStep);
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
  /** FO-392: the live, hidden limit. Undefined = a code from before it, unlimited. */
  useLimit?: number;
  used: number;
  revoked?: boolean;
  expired?: boolean;
}

/**
 * What the attacker knows about the hidden limit of a code made since FO-392: only its range.
 * Read off the policy exports on purpose: if the spread is removed (min = max), the attacker
 * knows the number and the saturated-cohort gate below goes red (mutant "no spread").
 */
interface LimitKnowledge {
  min: number;
  max: number;
}
const POLICY_KNOWLEDGE: LimitKnowledge = { min: INVITE_CODE_MIN_USE_LIMIT, max: INVITE_CODE_MAX_USE_LIMIT };
/** The pre-K-577268 design: one fixed limit that the agency was told. Positive control only. */
const FIXED_LIMIT = (n: number): LimitKnowledge => ({ min: n, max: n });

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
 * Whether the panel has an "exhausted" status for a code WITHOUT a limit, read off the
 * function that builds it: a much-used code. Before TASK-MUM2RMN3YIBGC it had. Since FO-392
 * only a code with a useLimit can be exhausted ({@link PANEL_SAYS_EXHAUSTED_WITH_LIMIT}).
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

/** FO-392: the same probe on a code that has reached its useLimit. */
const PANEL_SAYS_EXHAUSTED_WITH_LIMIT =
  inviteCodeRow(
    {
      id: 'probe',
      hint: 'ABCD',
      label: null,
      usedCount: 6,
      useLimit: 6,
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
  /**
   * Is a use count `u` consistent with the answer `seen`, for an attacker that does not know
   * the code's real limit? Defaults to asking `accepts` about a code with `u` uses.
   */
  consistent?(seen: boolean, c: TrueCode, u: number): boolean;
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

/**
 * FO-392: redeem_agency_invite() as agency-invite-use-limit.sql defines it - refused at
 * used = useLimit; a code with no limit (NULL) is never refused for its uses.
 *
 * `know` is what the attacker knows of the real limit. The answer itself comes from the true
 * code (`accepts`); which use counts are consistent with it is judged against `know`: with
 * [500, 524] "accepted" means used < 524, "refused" (on a live code) means used in [500, 524].
 * With a fixed `know` both collapse to the old exact reading.
 */
function formUseLimit(know: LimitKnowledge): FormRule {
  return {
    accepts: (c) => FORM_NOW.accepts(c) && c.used < (c.useLimit ?? Infinity),
    cap: (c) => (c.useLimit === undefined ? Infinity : know.max),
    consistent(seen, c, u) {
      if (!FORM_NOW.accepts(c)) return !seen; // revoked or expired: refused at any count
      if (c.useLimit === undefined) return seen; // no limit: always accepted
      return seen ? u < know.max : u >= know.min;
    },
  };
}
const FORM_USELIMIT = formUseLimit(POLICY_KNOWLEDGE);

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
    if (!(rule.consistent ? rule.consistent(seen, c, u) : rule.accepts({ ...c, used: u }) === seen)) continue;
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
function publishCodes(
  codes: TrueCode[],
  form?: FormRule,
  know: LimitKnowledge = POLICY_KNOWLEDGE,
  /**
   * FO-392 B-3 (patron decision A): the agency filled its own codes itself, from a known 0 uses,
   * and watched the status flip to "exhausted" (panel) or the form refuse. The flip happens at
   * exactly useLimit, so a code it filled itself is known to the exact count. The price is those
   * ~500 real registrations per code. Off = the agency only sees the public range 500..524.
   */
  selfBurn = false
): CodeKnowledge[] {
  return codes.map((c, i) => {
    const row = JSON.parse(
      JSON.stringify(
        inviteCodeRow(
          {
            id: `code-${i}`,
            hint: 'ABCD',
            label: null,
            usedCount: c.used,
            useLimit: c.useLimit ?? null,
            expiresAt: new Date(NOW + (c.expired ? -1 : 30) * 86_400_000),
            revokedAt: c.revoked ? new Date(NOW - 60_000) : null,
            createdAt: new Date(NOW - 86_400_000),
          },
          NOW
        )
      )
    ) as Record<string, unknown>;
    // A limit the panel still sent would cap the uses. The retired maxUses is not sent. Since
    // K-577268 the real limit is not sent either; if some change put it back (`useLimit` as a
    // number), the attacker reads it, and the saturated-cohort gate goes red.
    const max = typeof row.maxUses === 'number' ? row.maxUses : Infinity;
    let lo = 0;
    let hi = max;
    if (typeof row.useLimit === 'number') hi = Math.min(hi, row.useLimit);
    else if (row.limited === true) hi = Math.min(hi, know.max); // the range is public
    if (typeof row.usedCount === 'number') lo = hi = row.usedCount;
    else if (row.usedCount === null) hi = Math.min(hi, SMALL_CELL_THRESHOLD - 1); // masked: below the threshold
    const status =
      (row.status as string | undefined) ??
      (row.revokedAt ? 'revoked' : Date.parse(row.expiresAt as string) <= NOW ? 'expired' : row.exhausted ? 'exhausted' : 'active');
    // "Limit reached": at least the smallest limit a code can have - or, if the panel sent it, exactly the limit.
    if (status === 'exhausted') lo = Math.max(lo, typeof row.useLimit === 'number' ? row.useLimit : know.min);
    if (form) [lo, hi] = probe(c, form, lo, hi);
    if (selfBurn && c.useLimit !== undefined && c.used === c.useLimit) {
      lo = hi = c.used; // the flip pinned the limit and the agency counted every use itself
    }
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
    // A shown number is rounded to a multiple of the step and never under the threshold.
    // roundForDisplay = Math.round(v / step) * step, so a shown S means v in [S - lowOff, S + highOff]:
    // step 5 -> -2..+2 (shown 10 is 8..12), step 10 -> -5..+4 (shown 10 is 5..14, 15 rounds up to 20).
    const lowOff = Math.floor(activeStep / 2);
    const highOff = activeStep % 2 === 0 ? activeStep / 2 - 1 : (activeStep - 1) / 2;
    lo[i] = rounded ? Math.max(SMALL_CELL_THRESHOLD, value - lowOff) : value;
    hi[i] = rounded ? value + highOff : value;
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
  test('A = 7, B masked, funnel total "10" (R 8..12): B is not read back as 1..4', () => {
    // Before TASK-MUM17YBJVAHRR the panel sent A's 7: B ≥ 8 − 7 = 1, and a masked B says B < SMALL_CELL_THRESHOLD.
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
      // The control stands for the attack at the unit it was written for (5, before FO-398).
      const leaks = withStep(5, () => attack(t, publish(t), { codes, noneDeleted: true }));
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

  describe('FO-392: the use limit is back, so a used-up code could be read again (K-577141, K-577268)', () => {
    // The same cohort as above, but the first four codes carry a LIVE limit of 6.
    const t = tableOf({
      [NO_PROVINCE]: { MUNICIPALITY: [3, 2, 3, 0, 0, 0, 0], UNIVERSITY: [3, 2, 3, 1, 0, 0, 0] },
      Samsun: { MUNICIPALITY: [6, 4, 6, 2, 1, 0, 0], UNIVERSITY: [5, 2, 5, 1, 1, 1, 0] },
      Tokat: { MUNICIPALITY: [4, 3, 4, 3, 0, 0, 0], UNIVERSITY: [6, 4, 6, 0, 3, 2, 0] },
    });
    const small: TrueCode[] = [6, 6, 6, 6, 3].map((used) => ({ useLimit: 6, used }));

    test('the panel says "exhausted" for a code at its limit and never for one without a limit', () => {
      expect(PANEL_SAYS_EXHAUSTED_WITH_LIMIT).toBe(true);
      expect(PANEL_SAYS_EXHAUSTED).toBe(false);
    });

    test('positive control: a SMALL, KNOWN limit (6) is read back, the fifth code as 2..3 - what a fixed limit costs', () => {
      const know = FIXED_LIMIT(6);
      const codes = publishCodes(small, formUseLimit(know), know);
      expect(codes.slice(0, 4).map((c) => [c.lo, c.hi])).toEqual([[6, 6], [6, 6], [6, 6], [6, 6]]);
      const leaks = withStep(5, () => attack(t, publish(t), { codes, noneDeleted: true }));
      expect(leaks).toContainEqual({ target: 'code#4', truth: 3, lo: 2, hi: 3 });
    });

    test('the shipped limit (hidden, 500..524), same small cohort: nobody reaches it, so nothing is read back', () => {
      const codes = publishCodes([6, 6, 6, 6, 3].map((used) => ({ useLimit: newInviteCodeUseLimit(), used })), FORM_USELIMIT);
      expect(codes.every((c) => c.lo === c.truth || c.hi > c.truth)).toBe(true);
      expect(attack(t, publish(t), { codes, noneDeleted: true })).toEqual([]);
      expect(attack(t, publish(t), { codes })).toEqual([]);
    });

    test('legacy codes (no limit) behave as before FO-392: the form tells nothing the panel does not', () => {
      const legacy: TrueCode[] = [6, 6, 6, 6, 3].map((used) => ({ used }));
      expect(publishCodes(legacy, FORM_USELIMIT)).toEqual(publishCodes(legacy));
    });

    test('the panel row carries neither the real limit nor a count (what the attacker is given)', () => {
      const row = inviteCodeRow(
        {
          id: 'x',
          hint: 'ABCD',
          label: null,
          usedCount: 518,
          useLimit: 518,
          expiresAt: new Date(NOW + 86_400_000),
          revokedAt: null,
          createdAt: new Date(NOW - 86_400_000),
        },
        NOW
      );
      expect(row.status).toBe('exhausted');
      expect(JSON.stringify(row)).not.toMatch(/518|useLimit|usedCount/);
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
        codes.push({
          maxUses: SEQUENTIAL_BATCH,
          useLimit: rand() < 0.5 ? INVITE_CODE_MIN_USE_LIMIT + ri(0, INVITE_CODE_USE_LIMIT_SPREAD) : undefined,
          used: Math.max(0, Math.min(SEQUENTIAL_BATCH, n)),
        });
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
        // FO-392: a new code carries a hidden limit of 500..524, a code from before it none.
        useLimit: rand() < 0.5 ? INVITE_CODE_MIN_USE_LIMIT + ri(0, INVITE_CODE_USE_LIMIT_SPREAD) : undefined,
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
              codes: publishCodes(randomCodes(t, codeRand, noneDeleted, sequential), FORM_USELIMIT),
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

/**
 * FO-392 B-1 / K-577268: the saturated cohort. The earlier gate above never filled a code
 * (its largest table has ~50 organisations, the limit is 500), so it called a used-up code
 * "unreachable". crw-fb measured the hole it hid: with a FIXED limit, an agency that really
 * fills codes to the limit, D = 0 and a funnel total rounded to 5 reads the LAST code's 1..4
 * uses back (37-45 of 900 tables). Here codes ARE filled to a limit drawn by the product's own
 * `newInviteCodeUseLimit()`, and the attacker is the same one, knowing only what the policy
 * exports say (range 500..524).
 *
 * Reproduce a bigger sweep (one-off measurement, 900 tables per mode):
 *   FO392_TABLES=900 pnpm vitest run src/lib/agency/funnel.attack.test.ts -t "saturated cohort"
 */
describe('FO-392: saturated cohort - codes really filled to their (hidden) limit', () => {
  const TABLES = Number(process.env.FO392_TABLES ?? '') || 150;
  const CONTROL_TABLES = 300;
  const TIMEOUT_MS = 300_000;
  const PROVS = ['Samsun', 'Tokat', 'Amasya'];
  /** One-off measurement lines, appended to the file named by FO392_LOG (vitest buffers console here). */
  const measure = (line: string): void => {
    const file = process.env.FO392_LOG;
    if (file) appendFileSync(file, `${line}\n`);
  };

  function stream(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
    };
  }

  /** `reg` organisations as one cell's seven funnel counts (+ readiness), like randomTable. */
  function cellRow(rand: () => number, reg: number): number[] {
    const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
    const pipeline = ri(0, reg);
    const submitted = ri(0, reg);
    return [reg, ri(0, reg), pipeline, ri(0, pipeline), submitted, ri(0, submitted), ri(0, submitted), ri(0, reg)];
  }

  /**
   * A table with exactly R registered organisations. `single`: one province and type (plus
   * the NO_PROVINCE bucket half the time); otherwise 2-3 provinces x 1-3 types. A few small
   * cells (1..14) are always present, the ones the funnel masks - the rest of R is spread
   * over the big cells.
   */
  function bigTable(rand: () => number, R: number, single: boolean): Table {
    const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
    const provs = single ? [PROVS[0]!] : PROVS.slice(0, ri(2, 3));
    if (rand() < 0.5) provs.push(NO_PROVINCE);
    const types = [...ORG_TYPES].sort(() => rand() - 0.5).slice(0, single ? 1 : ri(1, 3));
    const cells: Array<[string, OrgType]> = [];
    for (const p of provs) for (const ty of types) cells.push([p, ty]);
    const sizes = cells.map(() => 0);
    let left = R;
    // small, maskable cells first
    for (let i = 1; i < cells.length && left > 40; i++) {
      if (rand() < 0.6) {
        const s = ri(1, 14);
        sizes[i] = s;
        left -= s;
      }
    }
    // the rest over the cells, random weights
    const w = cells.map(() => rand() + 0.05);
    const wSum = w.reduce((a, b) => a + b, 0);
    let given = 0;
    for (let i = 0; i < cells.length; i++) {
      const add = i === cells.length - 1 ? left - given : Math.floor((left * w[i]!) / wSum);
      sizes[i]! += add;
      given += add;
    }
    const spec: Record<string, Partial<Record<OrgType, number[]>>> = {};
    cells.forEach(([p, ty], i) => {
      spec[p] ??= {};
      spec[p]![ty] = cellRow(rand, sizes[i]!);
    });
    return tableOf(spec);
  }

  /**
   * The codes of an agency that really filled `nFull` of them to their limit, plus a last
   * code with `r` uses (the one a leak would expose). Returns the codes and R = Σ used - D.
   * `draw` gives each code's real limit.
   */
  function saturatedCodes(draw: () => number, nFull: number, r: number, d: number): { codes: TrueCode[]; R: number } {
    const codes: TrueCode[] = [];
    for (let i = 0; i < nFull; i++) {
      const lim = draw();
      codes.push({ useLimit: lim, used: lim });
    }
    codes.push({ useLimit: draw(), used: r });
    const sum = codes.reduce((a, c) => a + c.used, 0);
    return { codes, R: sum - d };
  }

  type Mode = { single: boolean; noneDeleted: boolean };
  const MODES: Mode[] = [
    { single: true, noneDeleted: true },
    { single: false, noneDeleted: true },
    { single: true, noneDeleted: false },
    { single: false, noneDeleted: false },
  ];

  function sweep(seed: number, mode: Mode, tables: number, draw: () => number, know: LimitKnowledge, selfBurn = false) {
    const rand = stream(seed);
    let withLeak = 0;
    const found: string[] = [];
    for (let k = 0; k < tables; k++) {
      const nFull = 1 + Math.floor(rand() * 2); // 1 or 2 filled codes
      const r = rand() < 0.8 ? 1 + Math.floor(rand() * 4) : 5 + Math.floor(rand() * 30); // mostly the 1..4 a leak would expose
      const d = mode.noneDeleted ? 0 : Math.floor(rand() * 4);
      const { codes, R } = saturatedCodes(draw, nFull, r, d);
      const t = bigTable(rand, R, mode.single);
      const leaks = attack(t, publish(t), {
        codes: publishCodes(codes, formUseLimit(know), know, selfBurn),
        noneDeleted: mode.noneDeleted,
      });
      if (leaks.length) {
        withLeak++;
        for (const l of leaks.slice(0, 2)) found.push(`#${k} ${l.target}=${l.truth} ∈ [${l.lo}, ${l.hi}]`);
      }
    }
    return { withLeak, found };
  }

  for (const mode of MODES) {
    for (const seed of [11, 23]) {
      test(`seed ${seed}, ${mode.single ? 'single' : 'spread'}, ${mode.noneDeleted ? 'D = 0' : 'D >= 0'}: ${TABLES} tables, limits drawn by newInviteCodeUseLimit() - anyLeak = 0`, () => {
        const { withLeak, found } = sweep(seed, mode, TABLES, newInviteCodeUseLimit, POLICY_KNOWLEDGE);
        measure(`SATURATED seed=${seed} ${mode.single ? 'single' : 'spread'} ${mode.noneDeleted ? 'D=0' : 'D>=0'} tables=${TABLES} tablesWithLeak=${withLeak}`);
        expect(found, `${withLeak}/${TABLES} tables leak`).toEqual([]);
      }, TIMEOUT_MS);
    }
  }

  // Positive control: the attack is real. Same cohorts, but the limit is the pre-K-577268
  // FIXED 500 and the attacker knows it (as the panel used to tell it). This must leak.
  test('positive control: a FIXED limit of 500 with the same saturated cohorts leaks in some tables (D = 0)', () => {
    let leaking = 0;
    let total = 0;
    for (const single of [true, false]) {
      // At the unit before FO-398 (5): the control stands for the attack, not for the shipped funnel.
      const r = withStep(5, () => sweep(5, { single, noneDeleted: true }, CONTROL_TABLES, () => 500, FIXED_LIMIT(500)));
      leaking += r.withLeak;
      total += CONTROL_TABLES;
    }
    measure(`SATURATED-CONTROL fixed500 D=0 tablesWithLeak=${leaking}/${total}`);
    expect(leaking).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  // ---------------------------------------------------------------------------------------
  // B-3 (crw-fb FO-392-crw-fb-2.md, patron decision A): the limit is NOT secret from an agency
  // that fills its own code. The status flips to "exhausted" (and the form refuses) at exactly
  // useLimit, so an agency that makes a fresh code (0 uses, known) and registers on it until the
  // flip learns its limit exactly. The cost is about L real records. The spread protects only a
  // code that is not yet full. The two tests below measure what the agency gains from that.
  // ---------------------------------------------------------------------------------------

  /** What the agency learns by filling a fresh code (u0 = 0) until the form refuses: the refusal point. */
  function learnedByFilling(limit: number, know: LimitKnowledge): number {
    const form = formUseLimit(know);
    const code: TrueCode = { useLimit: limit, used: 0 };
    let k = 0;
    while (form.accepts({ ...code, used: k })) k++; // k real registrations later the form refuses
    return k;
  }

  test('self-burn: filling a fresh code until the flip gives the agency its limit EXACTLY (all 25 values)', () => {
    const learned: number[] = [];
    for (let lim = INVITE_CODE_MIN_USE_LIMIT; lim <= INVITE_CODE_MAX_USE_LIMIT; lim++) {
      const k = learnedByFilling(lim, POLICY_KNOWLEDGE);
      expect(k, `limit ${lim}`).toBe(lim); // exact, not a window
      learned.push(k);
    }
    measure(`SELFBURN-FLIP limits=${INVITE_CODE_MIN_USE_LIMIT}..${INVITE_CODE_MAX_USE_LIMIT} exactlyLearned=${learned.length}/${INVITE_CODE_USE_LIMIT_SPREAD + 1} costRealRecords=${INVITE_CODE_MIN_USE_LIMIT}..${INVITE_CODE_MAX_USE_LIMIT}`);
    expect(learned.length).toBe(INVITE_CODE_USE_LIMIT_SPREAD + 1);
  });

  test('self-burn: with the filled codes known exactly, the window for the last code (from the grand total alone) shrinks from ~25 per code to the rounding step (5)', () => {
    // The agency filled nFull codes itself (it knows each one's uses exactly) and a last code holds
    // r uses it did not make. The funnel total is shown rounded to FUNNEL_ROUND_STEP (10; true value within -5..+4), D = 0:
    //   r in [shown - 2 - S, shown + 2 - S]   with S = sum of the uses of the filled codes.
    // Without the self-burn S is only known to [nFull * MIN, nFull * MAX].
    const rand = stream(77);
    const widthKnown: number[] = [];
    const widthRange: number[] = [];
    let inside14 = 0;
    const N = 400;
    for (let n = 0; n < N; n++) {
      const nFull = 1 + Math.floor(rand() * 2);
      const r = 1 + Math.floor(rand() * 4);
      const { codes, R } = saturatedCodes(newInviteCodeUseLimit, nFull, r, 0);
      const t = bigTable(rand, R, false);
      const shown = publish(t).get(id('registered', ALL, ALL));
      if (shown == null) throw new Error('the grand total of a big cohort must be shown');
      const filled = codes.slice(0, nFull);
      const sExact = filled.reduce((a, c) => a + c.used, 0);
      const lowOff = Math.floor(FUNNEL_ROUND_STEP / 2);
      const highOff = FUNNEL_ROUND_STEP % 2 === 0 ? FUNNEL_ROUND_STEP / 2 - 1 : (FUNNEL_ROUND_STEP - 1) / 2;
      const known = [Math.max(0, shown - lowOff - sExact), shown + highOff - sExact];
      const range = [Math.max(0, shown - lowOff - nFull * INVITE_CODE_MAX_USE_LIMIT), shown + highOff - nFull * INVITE_CODE_MIN_USE_LIMIT];
      expect(r).toBeGreaterThanOrEqual(known[0]!);
      expect(r).toBeLessThanOrEqual(known[1]!);
      widthKnown.push(known[1]! - known[0]! + 1);
      widthRange.push(range[1]! - range[0]! + 1);
      if (known[0]! >= 1 && known[1]! <= 4) inside14++;
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    measure(`SELFBURN-WINDOW tables=${N} D=0 windowSelfBurnedAvg=${avg(widthKnown).toFixed(2)} max=${Math.max(...widthKnown)} windowPublicRangeAvg=${avg(widthRange).toFixed(2)} min=${Math.min(...widthRange)} windowsInside1to4=${inside14}`);
    // The agency pins the last code's uses to the rounding step (10 values since FO-398, 5 before)...
    expect(Math.max(...widthKnown)).toBeLessThanOrEqual(FUNNEL_ROUND_STEP);
    // ...which is a narrower window than the public range alone gives (the spread only helped before the flip)...
    expect(avg(widthKnown)).toBeLessThan(avg(widthRange));
    // ...and a window of 5 or more values cannot sit inside 1..4 by itself. At the old unit (5) the full
    // attack below combined the grand total with the per-province cells and did close onto 1..4 in some tables.
    expect(inside14).toBe(0);
  });

  // The gate for the self-burning agency. Measured at the unit before FO-398 (rounding step 5, seed 31,
  // 900 tables per mode): single province and every D >= 0 mode leak nothing, but the multi-province D = 0
  // mode leaked a hidden 1..4 in 57-84 of 900 tables over five runs with random limits (mean ~8 %, above
  // the ~5.8 % a FIXED 500 leaks; limitSeed 3101: 10/150 = 6.7 %, 74/900 = 8.2 %). K-577268 A accepted it;
  // K-577441 B reopened it, and FO-398 found it cheaper than the 500 records (see the next section) and
  // cut it with the rounding step: at 10 (K-577804) 6 of 900 tables are left, in the one multi-province D = 0 mode.
  const RESIDUAL_MODE = (m: Mode) => !m.single && m.noneDeleted;
  const RESIDUAL_CEILING = 0.1;
  const RESIDUAL_LIMIT_SEED = 3101;
  /** Limits for the residual gate: same uniform law as newInviteCodeUseLimit(), seeded, so no flake. */
  function seededUseLimit(seed: number): () => number {
    const u = stream(seed);
    return () => INVITE_CODE_MIN_USE_LIMIT + Math.floor(u() * (INVITE_CODE_USE_LIMIT_SPREAD + 1));
  }
  /** What is left at the shipped rounding step (measured, 900 tables: 6 = 0.7 %; 3x room, seeded so it cannot flake). */
  const STEP10_CEILING = 0.02;
  for (const mode of MODES) {
    const label = `${mode.single ? 'single' : 'spread'}, ${mode.noneDeleted ? 'D = 0' : 'D >= 0'}`;
    test(`self-burn gate, ${label}: codes the agency filled itself are exact - ${RESIDUAL_MODE(mode) ? `below ${STEP10_CEILING * 100} % (rounding step ${FUNNEL_ROUND_STEP})` : 'anyLeak = 0'}`, () => {
      const { withLeak, found } = sweep(31, mode, TABLES, seededUseLimit(RESIDUAL_LIMIT_SEED), POLICY_KNOWLEDGE, true);
      measure(`SELFBURN-SWEEP seed=31 limitSeed=${RESIDUAL_LIMIT_SEED} step=${FUNNEL_ROUND_STEP} ${label} tables=${TABLES} tablesWithLeak=${withLeak}`);
      if (RESIDUAL_MODE(mode)) expect(withLeak / TABLES, found.slice(0, 3).join('; ')).toBeLessThan(STEP10_CEILING);
      else expect(found, `${withLeak}/${TABLES} tables leak`).toEqual([]);
    }, TIMEOUT_MS);
    if (RESIDUAL_MODE(mode)) {
      test(`positive control, ${label}: at the rounding step before FO-398 (5) the self-burn reads a hidden 1..4 in some tables, below ${RESIDUAL_CEILING * 100} %`, () => {
        const { withLeak } = withStep(5, () => sweep(31, mode, TABLES, seededUseLimit(RESIDUAL_LIMIT_SEED), POLICY_KNOWLEDGE, true));
        const now = sweep(31, mode, TABLES, seededUseLimit(RESIDUAL_LIMIT_SEED), POLICY_KNOWLEDGE, true).withLeak;
        measure(`SELFBURN-SWEEP seed=31 limitSeed=${RESIDUAL_LIMIT_SEED} step=5 ${label} tables=${TABLES} tablesWithLeak=${withLeak} (the old residual; step ${FUNNEL_ROUND_STEP}: ${now})`);
        expect(withLeak, 'the attack must stay real, or this control proves nothing').toBeGreaterThan(0);
        expect(withLeak / TABLES).toBeLessThan(RESIDUAL_CEILING);
        expect(now, 'the shipped step must leak less than the old one').toBeLessThan(withLeak);
      }, TIMEOUT_MS);
    }
  }

  // ---------------------------------------------------------------------------------------
  // FO-398 (K-577441 B): was the 500-record self-burn the weakest link? No. Two cheaper attacks on
  // the SAME funnel, neither of which involves the use limit.
  // ---------------------------------------------------------------------------------------

  /**
   * Same sweep as {@link sweep}, but the agency knows its filled codes because it registered a few
   * organisations of its own on a fresh code (`ownMax` at most, 5 at least), not because a
   * limit flipped. No use limit is involved: these are plain codes whose uses the agency counted.
   */
  function sweepOwn(seed: number, mode: Mode, tables: number, ownMax: number) {
    const rand = stream(seed);
    let withLeak = 0;
    for (let k = 0; k < tables; k++) {
      const nFull = 1 + Math.floor(rand() * 2);
      const r = rand() < 0.8 ? 1 + Math.floor(rand() * 4) : 5 + Math.floor(rand() * 30);
      const d = mode.noneDeleted ? 0 : Math.floor(rand() * 4);
      // 5 at least: an own code of 3 or 4 would count as a "leak" of a number the agency made itself.
      const own = Array.from({ length: nFull }, () => 5 + Math.floor(rand() * (ownMax - 4)));
      const sum = own.reduce((a, b) => a + b, 0) + r;
      const t = bigTable(rand, sum - d, mode.single);
      const codes: CodeKnowledge[] = [
        ...own.map((m) => ({ truth: m, lo: m, hi: m })),
        { truth: r, lo: 0, hi: INVITE_CODE_MAX_USE_LIMIT },
      ];
      if (attack(t, publish(t), { codes, noneDeleted: mode.noneDeleted }).length) withLeak++;
    }
    return withLeak;
  }

  const CHEAP_MODES: Mode[] = MODES;
  for (const mode of CHEAP_MODES) {
    const label = `${mode.single ? 'single' : 'spread'}, ${mode.noneDeleted ? 'D = 0' : 'D >= 0'}`;
    test(`FO-398 cheap fill gate, ${label}: 5-30 own registrations on a fresh code - ${RESIDUAL_MODE(mode) ? `below ${STEP10_CEILING * 100} %` : 'anyLeak = 0'} (rounding step ${FUNNEL_ROUND_STEP})`, () => {
      const withLeak = sweepOwn(31, mode, TABLES, 30);
      measure(`CHEAPFILL seed=31 own=5..30 step=${FUNNEL_ROUND_STEP} ${label} tables=${TABLES} tablesWithLeak=${withLeak}`);
      if (RESIDUAL_MODE(mode)) expect(withLeak / TABLES).toBeLessThan(STEP10_CEILING);
      else expect(withLeak, `${withLeak}/${TABLES} tables leak`).toBe(0);
    }, TIMEOUT_MS);
  }

  test('FO-398 positive control: at the rounding step before FO-398 (5), 5-30 own registrations (no limit involved) read a hidden 1..4 in some tables (D = 0, spread)', () => {
    const MODE: Mode = { single: false, noneDeleted: true };
    const cheap = withStep(5, () => sweepOwn(31, MODE, TABLES, 30));
    const now = sweepOwn(31, MODE, TABLES, 30);
    const ref = withStep(5, () => sweep(31, MODE, TABLES, seededUseLimit(RESIDUAL_LIMIT_SEED), POLICY_KNOWLEDGE, true).withLeak);
    measure(`CHEAPFILL seed=31 own=5..30 step=5 spread D=0 tables=${TABLES} tablesWithLeak=${cheap} (step ${FUNNEL_ROUND_STEP}: ${now}; 500-record self-burn at step 5: ${ref})`);
    expect(cheap, 'the cheap attack must be real at step 5').toBeGreaterThan(0);
    expect(now, 'the shipped step must leak less than the old one').toBeLessThan(cheap);
  }, TIMEOUT_MS);

  /** A copy of `t` with `a` organisations of the attacker's own added to `province` (type SME, registered only). */
  function withOwnOrgs(t: Table, province: string, a: number): Table {
    const c: Table = new Map();
    for (const [p, types] of t) c.set(p, Object.fromEntries(ORG_TYPES.map((ty) => [ty, { ...types[ty] }])) as Record<OrgType, Counts>);
    c.get(province)!.SME.registered += a;
    return c;
  }

  /**
   * The threshold probe (NG-339, threshold 10): a province the funnel masks ("<10") is unmasked by
   * registering `a` of the attacker's own organisations in it (a = 1..4, the budget of the card); the
   * first `a` that shows a number gives the hidden count as threshold − a, exactly when the true count
   * is in threshold − a (a masked count T: T + a − 1 < 10 ≤ T + a forces T = 10 − a). Returns how many
   * masked province counts 1..9 it names exactly within the budget. Independent of the rounding step:
   * the mask is on the true value.
   */
  function unmaskProbe(tables: number, seed: number) {
    const rand = stream(seed);
    let targets = 0;
    let exact = 0;
    let unmasked = 0;
    let maxCost = 0;
    for (let k = 0; k < tables; k++) {
      const t = bigTable(rand, 60 + Math.floor(rand() * 200), false);
      const base = publish(t);
      for (const p of t.keys()) {
        if (p === NO_PROVINCE) continue;
        const key = id('registered', ALL, p);
        const truth = ORG_TYPES.reduce((n, ty) => n + t.get(p)![ty].registered, 0);
        if (base.get(key) !== null || truth < 1 || truth >= SMALL_CELL_THRESHOLD) continue; // only masked, really 1..9
        targets++;
        for (let a = 1; a <= 4; a++) {
          if (publish(withOwnOrgs(t, p, a)).get(key) == null) continue;
          unmasked++;
          if (SMALL_CELL_THRESHOLD - a === truth) {
            exact++;
            maxCost = Math.max(maxCost, a);
          }
          break;
        }
      }
    }
    return { targets, exact, unmasked, maxCost };
  }

  // NG-339 (HUKUK-5 5e): the province breakdown is no longer offered by the dashboard or the report, so
  // this probe measures the library function only. It is pinned: if it reads 0 the channel is closed and
  // the test goes red so the notice and the lawyer question are updated.
  test('NG-339 threshold probe: 1-4 own organisations unmask a masked province and name its hidden count', () => {
    // A fixed sample (3600 tables): the masked 1..9 province counts are rare.
    const r = unmaskProbe(3600, 41);
    measure(`UNMASKPROBE seed=41 threshold=${SMALL_CELL_THRESHOLD} maskedProvinceCounts1to9=${r.targets} unmaskedWithin4=${r.unmasked} namedExactly=${r.exact} maxOwnOrgsNeeded=${r.maxCost}`);
    expect(r.targets).toBeGreaterThan(0);
    expect(r.exact).toBeGreaterThan(0);
    expect(r.exact / r.targets).toBeLessThan(0.5);
    expect(r.maxCost).toBeLessThanOrEqual(4);
  }, TIMEOUT_MS);
});

/**
 * NG-339 (HUKUK-5 5c, 5e). The threshold is 10 (was 5) and the dashboard and the region report no
 * longer publish a province breakdown: the agency cannot tell its own additions from others'
 * (auth.ts and oauth-registration.ts open a fresh user and tenant per code sign-up), so the rule
 * that depended on it is withdrawn. These rules fail on a regression to 5 or a return of the
 * province view. Mutant evidence: with SMALL_CELL_THRESHOLD = 5 the first two fail (see the
 * sonuç dosyası NG-339-sec-gnd.md).
 */
describe('NG-339: threshold 10, and no province breakdown on the dashboard', () => {
  type Raw = Parameters<typeof buildAgencyFunnel>[0];
  const STEP_KEYS = ['registered', 'readiness', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'] as const;
  const counts = (n: number) => Object.fromEntries(STEP_KEYS.map((s) => [s, n])) as Record<(typeof STEP_KEYS)[number], number>;
  const raw = (p: string, byType: Partial<Record<OrgType, number>>): Raw =>
    new Map([
      [p, Object.fromEntries(ORG_TYPES.map((t) => [t, counts(byType[t] ?? 0)])) as Record<OrgType, ReturnType<typeof counts>>],
    ]);

  test('the threshold is 10 and a shown number is a multiple of 10', () => {
    expect(SMALL_CELL_THRESHOLD).toBe(10);
    expect(FUNNEL_ROUND_STEP).toBe(10);
  });

  test('a type of 5..9 organisations is masked on the type view, and so is the one visible beside it', () => {
    // SME 7 alone is hidden; total 32 − MUNICIPALITY 25 would give 7 exactly, so MUNICIPALITY is masked too.
    const f = buildAgencyFunnel(raw('Samsun', { SME: 7, MUNICIPALITY: 25 }), { dimension: 'orgType' });
    if (f.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
    expect(f.breakdown.byOrgType.SME.registered).toEqual({ state: 'small' });
    expect(f.breakdown.byOrgType.MUNICIPALITY.registered).toEqual({ state: 'small' });
    expect(f.all.registered).toEqual({ state: 'count', value: 30 }); // 32 rounded to the step
  });

  test('the type view names no province: the dashboard publishes totals and types only', () => {
    const f = buildAgencyFunnel(raw('Samsun', { SME: 25, MUNICIPALITY: 25 }), { dimension: 'orgType' });
    expect(JSON.stringify(f)).not.toMatch(/Samsun|Tokat|Amasya/);
    expect(f.breakdown.dimension).toBe('orgType');
  });
});
