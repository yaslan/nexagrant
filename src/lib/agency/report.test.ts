import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import {
  buildAgencyFunnel,
  FUNNEL_ROUND_STEP,
  FUNNEL_STEPS,
  maskAgencyFunnel,
  NO_PROVINCE,
  ORG_TYPES,
  SMALL_CELL_THRESHOLD,
  type FunnelBreakdown,
} from './funnel';
import {
  agencyReportHtml,
  AgencyReportSnapshotSchema,
  AgencyReportPeriodError,
  buildAgencyReport,
  generateAgencyReports,
  reportPeriod,
  requestedReportPeriod,
  type AgencyReportSnapshot,
} from './report';

/**
 * TASK-MULRR08Y9YI77 (FB KAMU B3) — the region report is the dashboard's
 * published output, copied: no number that the dashboard does not show for the
 * same data, in the same form (masked at SMALL_CELL_THRESHOLD, rounded to
 * FUNNEL_ROUND_STEP). Since NG-339 (HUKUK-5 5e) the report has no province table.
 */

type Step = (typeof FUNNEL_STEPS)[number];
type Counts = Record<Step, number>;
const zero = (): Counts => Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0])) as Counts;

/** `{ Samsun: { SME: 8 } }` → 8 SMEs in Samsun on every step. */
function table(v: Record<string, Partial<Record<OrgType, number | Partial<Counts>>>>) {
  return new Map(
    Object.entries(v).map(([p, types]) => [
      p,
      Object.fromEntries(
        ORG_TYPES.map((t) => {
          const x = types[t];
          return [t, typeof x === 'number' ? (Object.fromEntries(FUNNEL_STEPS.map((s) => [s, x])) as Counts) : { ...zero(), ...x }];
        })
      ) as Record<OrgType, Counts>,
    ])
  );
}

const AT = new Date('2026-10-01T06:00:00Z');

/**
 * Every number the dashboard publishes for `raw`, as the report must copy it.
 * The masking does not depend on the breakdown, so the table is masked once.
 * `endpoint` is one breakdown checked against buildAgencyFunnel itself, the
 * function the dashboard calls — after the other calls, so a closure whose answer
 * depends on what it was asked before differs from the fresh one (İNCELEME-99 Ö-1).
 */
function dashboard(raw: ReturnType<typeof table>, endpoint?: FunnelBreakdown) {
  const funnel = maskAgencyFunnel(raw);
  const none = funnel({ dimension: 'none' });
  const byType = funnel({ dimension: 'orgType' });
  if (byType.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
  if (endpoint) expect(funnel(endpoint)).toEqual(buildAgencyFunnel(raw, endpoint));
  return { all: none.all, byOrgType: byType.breakdown.byOrgType };
}

/** The report equals the dashboard, number for number. */
function expectSameAsDashboard(r: AgencyReportSnapshot, raw: ReturnType<typeof table>, endpoint?: FunnelBreakdown) {
  const d = dashboard(raw, endpoint);
  expect(r.all).toEqual(d.all);
  expect(r.byOrgType).toEqual(d.byOrgType);
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('report numbers == dashboard response', () => {
  test('a fixed table: masking, rounding and suppression are the dashboard’s', () => {
    const raw = table({
      Samsun: { MUNICIPALITY: 13, PUBLIC: 9 },
      Tokat: { SME: { registered: 7, savedSearch: 7, pipeline: 3 } },
      [NO_PROVINCE]: { LARGE: 3 },
    });
    const r = buildAgencyReport(raw, '2026-09', AT);
    expectSameAsDashboard(r, raw);
    // The grand total (13 + 9 + 7 + 3 = 32) is withheld, not rounded (K-585957 = A); masked: 3 LARGE (under 10).
    expect(r.all.registered).toEqual({ state: 'withheld' });
    expect(r.byOrgType.LARGE.registered).toEqual({ state: 'small' });
    for (const t of ORG_TYPES)
      for (const s of FUNNEL_STEPS) {
        const c = r.byOrgType[t][s];
        if (c.state === 'count') expect(c.value % FUNNEL_ROUND_STEP).toBe(0);
      }
  });

  test('property: 300 random tables — every cell of the report is the dashboard’s cell', () => {
    const rnd = lcg(20260929);
    const provinces: string[] = ['Samsun', 'Tokat', 'Çorum', 'Amasya', NO_PROVINCE];
    // One breakdown per table goes through buildAgencyFunnel too, in turn.
    const endpoints: FunnelBreakdown[] = [{ dimension: 'none' }, { dimension: 'orgType' }];
    for (let n = 0; n < 300; n++) {
      const spec: Record<string, Partial<Record<OrgType, Partial<Counts>>>> = {};
      for (const p of provinces) {
        if (rnd() < 0.3) continue;
        spec[p] = {};
        for (const t of ORG_TYPES) {
          if (rnd() < 0.6) continue;
          const reg = Math.floor(rnd() * 14);
          const pick = (max: number) => Math.floor(rnd() * (max + 1));
          const pipeline = pick(reg);
          const submitted = pick(reg);
          spec[p]![t] = {
            registered: reg,
            readiness: pick(reg),
            savedSearch: pick(reg),
            pipeline,
            conceptNote: pick(pipeline),
            submitted,
            accepted: pick(submitted),
            rejected: pick(submitted),
          };
        }
      }
      const raw = table(spec);
      expectSameAsDashboard(buildAgencyReport(raw, '2026-09', AT), raw, endpoints[n % endpoints.length]);
    }
  }, 120_000);
});

describe('edge cases', () => {
  test('empty month: no organisation — the total is withheld, every type cell "<10", no province anywhere, the view still renders', () => {
    const r = buildAgencyReport(new Map(), '2026-09', AT);
    expectSameAsDashboard(r, new Map());
    expect(Object.values(r.all).every((c) => c.state === 'withheld')).toBe(true);
    expect(Object.values(r.byOrgType.SME).every((c) => c.state === 'small')).toBe(true);
    expect(JSON.stringify(r)).not.toContain('byProvince');
    expect(agencyReportHtml(r, 'OKA')).toContain(`&lt;${SMALL_CELL_THRESHOLD}`);
  });

  test('one province: its numbers are only the totals and the types; its name never reaches the report', () => {
    const raw = table({ Samsun: { MUNICIPALITY: 6, SME: 6 } });
    const r = buildAgencyReport(raw, '2026-09', AT);
    expectSameAsDashboard(r, raw);
    expect(r.all.registered).toEqual({ state: 'withheld' });
    expect(agencyReportHtml(r, 'OKA')).not.toContain('Samsun');
  });

  test('a province of 1..9 organisations is not named anywhere in the report', () => {
    const raw = table({ Samsun: { SME: 12 }, Tokat: { SME: 2 } });
    const r = buildAgencyReport(raw, '2026-09', AT);
    expectSameAsDashboard(r, raw);
    expect(JSON.stringify(r)).not.toContain('Tokat');
    expect(agencyReportHtml(r, 'OKA')).not.toContain('Tokat');
  });
});

describe('the stored snapshot holds only published values', () => {
  const raw = table({ Samsun: { MUNICIPALITY: 13, PUBLIC: 9 }, [NO_PROVINCE]: { LARGE: 3 } });
  const r = buildAgencyReport(raw, '2026-09', AT);

  test('no raw count, no id, no name: every number a multiple of 10 and ≥ 10, keys fixed', () => {
    const json = JSON.stringify(r);
    const numbers = [...json.matchAll(/"value":(\d+)/g)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(0);
    for (const v of numbers) expect(v % FUNNEL_ROUND_STEP === 0 && v >= SMALL_CELL_THRESHOLD).toBe(true);
    expect(Object.keys(r).sort()).toEqual(['all', 'byOrgType', 'generatedAt', 'period', 'version']);
    expect(json).not.toMatch(/tenant|name|"13"|:13\b|:9\b|:3\b/i);
  });

  test('the schema refuses a raw count, an extra key and a province × type cell', () => {
    const bad = structuredClone(r) as unknown as Record<string, unknown>;
    (bad.all as Record<string, unknown>).registered = { state: 'count', value: 13 };
    expect(AgencyReportSnapshotSchema.safeParse(bad).success).toBe(false);
    expect(AgencyReportSnapshotSchema.safeParse({ ...r, tenantId: 'x' }).success).toBe(false);
    const cross = { ...r, byProvince: [{ province: 'Samsun', view: r.all, orgType: 'SME' }] };
    expect(AgencyReportSnapshotSchema.safeParse(cross).success).toBe(false);
    expect(AgencyReportSnapshotSchema.safeParse({ ...r, byProvinceByType: {} }).success).toBe(false);
  });

  test('a report stored before NG-339 (multiples of 5, with a province table) still parses', () => {
    const legacy = { ...r, byProvince: [{ province: 'Samsun', view: r.all }] };
    expect(AgencyReportSnapshotSchema.safeParse(legacy).success).toBe(true);
    const off = structuredClone(legacy) as unknown as Record<string, unknown>;
    (off.all as Record<string, unknown>).registered = { state: 'count', value: 13 };
    expect(AgencyReportSnapshotSchema.safeParse(off).success).toBe(false);
  });
});

describe('on-screen view (NG-341: no file)', () => {
  const raw = table({ Samsun: { MUNICIPALITY: 13, PUBLIC: 9 }, Tokat: { SME: 7 } });
  const r = buildAgencyReport(raw, '2026-09', AT);

  test('view: escapes the agency name, carries the privacy and retention notes, offers no print or PDF', () => {
    const html = agencyReportHtml(r, '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('PDF');
    expect(html).not.toContain('window.print');
    expect(html).not.toContain('@media print');
    expect(html).toContain('Bu rapor 12 ay saklanır; süresi dolanlar 6 ayda bir toplu silinir.');
    expect(agencyReportHtml(r, 'OKA', 'en')).toContain('kept for 12 months');
    expect(html).toContain(`Gösterilen sayılar ${FUNNEL_ROUND_STEP} birimine yuvarlanır`);
    expect(html).toContain('İl kırılımı bu raporda yoktur.');
    // The grand total is withheld in the report too: the explanation sits in the cell, no number (K-585957 = A).
    expect(html).not.toContain('<td>30</td>');
    expect(html).toContain('<td>Gizlendi: toplam yayımlanmaz, kırılımlardan geri hesaplanamaz</td>');
  });

  test('reportPeriod: always the last closed month, never the open one', () => {
    expect(reportPeriod(new Date('2026-10-01T06:00:00Z'))).toBe('2026-09');
    expect(reportPeriod(new Date('2027-01-01T06:00:00Z'))).toBe('2026-12');
    // TASK-MUM97IPC2QSGC (Ö-3): mid-month is still the month before — September is open on the 29th.
    expect(reportPeriod(new Date('2026-09-29T12:00:00Z'))).toBe('2026-08');
    expect(reportPeriod(new Date('2026-10-15T12:00:00Z'))).toBe('2026-09');
    // A cron retry that lands on the 2nd names the same month as the run on the 1st.
    expect(reportPeriod(new Date('2026-10-02T00:30:00Z'))).toBe('2026-09');
    expect(reportPeriod(new Date('2026-10-01T00:00:00Z'))).toBe('2026-09');
    expect(reportPeriod(new Date('2026-09-30T23:59:59Z'))).toBe('2026-08');
  });
});

/**
 * TASK-MUM97IPC2QSGC (İNCELEME-13 Ö-3): `agency/report.generate` by hand on
 * 15 October used to store `2026-10` with half a month in it, and the cron on
 * 1 November then skipped October as "already there". The event now names its
 * period, and only the month that has closed is accepted.
 */
describe('requestedReportPeriod (agency/report.generate payload)', () => {
  const MID_OCT = new Date('2026-10-15T12:00:00Z');

  test('the last closed month is accepted', () => {
    expect(requestedReportPeriod({ period: '2026-09' }, MID_OCT)).toBe('2026-09');
    expect(requestedReportPeriod({ period: '2026-12' }, new Date('2027-01-01T06:00:00Z'))).toBe('2026-12');
  });

  test('the open month is refused', () => {
    expect(() => requestedReportPeriod({ period: '2026-10' }, MID_OCT)).toThrow(AgencyReportPeriodError);
  });

  test('a future month is refused', () => {
    expect(() => requestedReportPeriod({ period: '2026-11' }, MID_OCT)).toThrow(AgencyReportPeriodError);
  });

  test('an earlier closed month is refused: the numbers are today\'s, not that month\'s', () => {
    expect(() => requestedReportPeriod({ period: '2026-08' }, MID_OCT)).toThrow(AgencyReportPeriodError);
  });

  test('no period, a bad period or an extra key is refused', () => {
    for (const data of [undefined, null, {}, { period: '' }, { period: '2026-9' }, { period: '2026-13' },
      { period: 202609 }, { period: '2026-09', tenantId: 'x' }]) {
      expect(() => requestedReportPeriod(data, MID_OCT)).toThrow(AgencyReportPeriodError);
    }
  });
});

describe('generateAgencyReports refuses a period that is not the last closed month', () => {
  test('open month: throws before reading or writing anything', async () => {
    let calls = 0;
    const deps = {
      agencies: async () => {
        calls++;
        return [{ id: 't1' }];
      },
    };
    await expect(generateAgencyReports('2026-10', new Date('2026-10-15T12:00:00Z'), deps)).rejects.toThrow(
      AgencyReportPeriodError
    );
    expect(calls).toBe(0);
  });
});
