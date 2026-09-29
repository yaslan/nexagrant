import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import { buildAgencyFunnel, FUNNEL_STEPS, NO_PROVINCE, ORG_TYPES, type FunnelView } from './funnel';
import { TR_PROVINCES, type TrProvince } from '@/lib/readiness/provinces';
import {
  agencyReportCsv,
  agencyReportHtml,
  AgencyReportSnapshotSchema,
  buildAgencyReport,
  reportPeriod,
  type AgencyReportSnapshot,
} from './report';

/**
 * TASK-MULRR08Y9YI77 (FB KAMU B3) — the region report is the dashboard's
 * published output, copied: no number that the dashboard does not show for the
 * same data, in the same form (masked, rounded to 5).
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

/** Every number the dashboard publishes for `raw`, as the report must copy it. */
function dashboard(raw: ReturnType<typeof table>) {
  const none = buildAgencyFunnel(raw, { dimension: 'none' });
  const byType = buildAgencyFunnel(raw, { dimension: 'orgType' });
  if (byType.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
  const provinces = new Map<TrProvince, FunnelView>();
  for (const p of TR_PROVINCES) {
    const f = buildAgencyFunnel(raw, { dimension: 'province', province: p });
    if (f.breakdown.dimension !== 'province') throw new Error('no province breakdown');
    provinces.set(p, f.breakdown.view);
  }
  return { all: none.all, byOrgType: byType.breakdown.byOrgType, provinces };
}

/** The report equals the dashboard, number for number; a province left out shows nothing there. */
function expectSameAsDashboard(r: AgencyReportSnapshot, raw: ReturnType<typeof table>) {
  const d = dashboard(raw);
  expect(r.all).toEqual(d.all);
  expect(r.byOrgType).toEqual(d.byOrgType);
  const listed = new Set(r.byProvince.map((p) => p.province));
  for (const { province, view } of r.byProvince) expect(view).toEqual(d.provinces.get(province));
  for (const [p, view] of d.provinces) {
    if (listed.has(p)) continue;
    expect(Object.values(view).every((c) => c.state !== 'count'), `${p} is left out but shows a number`).toBe(true);
  }
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
    // Rounded: 13 + 9 + 7 + 3 = 32 → 30; masked: 3 LARGE.
    expect(r.all.registered).toEqual({ state: 'count', value: 30 });
    expect(r.byOrgType.LARGE.registered).toEqual({ state: 'small' });
    for (const t of ORG_TYPES)
      for (const s of FUNNEL_STEPS) {
        const c = r.byOrgType[t][s];
        if (c.state === 'count') expect(c.value % 5).toBe(0);
      }
  });

  test('property: 300 random tables — every cell of the report is the dashboard’s cell', () => {
    const rnd = lcg(20260929);
    const provinces: string[] = ['Samsun', 'Tokat', 'Çorum', 'Amasya', NO_PROVINCE];
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
      expectSameAsDashboard(buildAgencyReport(raw, '2026-09', AT), raw);
    }
    // The dashboard side walks all 81 provinces of every table: ~25 000 maskings.
  }, 120_000);
});

describe('edge cases', () => {
  test('empty month: no organisation — every cell "<5", no province row, both files still render', () => {
    const r = buildAgencyReport(new Map(), '2026-09', AT);
    expectSameAsDashboard(r, new Map());
    expect(Object.values(r.all).every((c) => c.state === 'small')).toBe(true);
    expect(r.byProvince).toEqual([]);
    expect(agencyReportHtml(r, 'OKA')).toContain('Hiçbir il için gösterilebilir sayı yok');
    const csv = agencyReportCsv(r);
    // header + 8 steps × (1 total + 9 types), no province rows
    expect(csv.trim().split('\r\n')).toHaveLength(1 + 8 * 10);
  });

  test('one province: its row is the dashboard’s province view; the other 80 are not listed', () => {
    const raw = table({ Samsun: { MUNICIPALITY: 6, SME: 6 } });
    const r = buildAgencyReport(raw, '2026-09', AT);
    expectSameAsDashboard(r, raw);
    expect(r.byProvince.map((p) => p.province)).toEqual(['Samsun']);
    expect(r.byProvince[0]!.view.registered).toEqual({ state: 'count', value: 10 });
  });

  test('a province of 1..4 organisations is not listed (its dashboard row is all "<5", like an empty one)', () => {
    const raw = table({ Samsun: { SME: 12 }, Tokat: { SME: 2 } });
    const r = buildAgencyReport(raw, '2026-09', AT);
    expectSameAsDashboard(r, raw);
    expect(r.byProvince.map((p) => p.province)).not.toContain('Tokat');
    expect(agencyReportCsv(r)).not.toContain('Tokat');
  });
});

describe('the stored snapshot holds only published values', () => {
  const raw = table({ Samsun: { MUNICIPALITY: 13, PUBLIC: 9 }, [NO_PROVINCE]: { LARGE: 3 } });
  const r = buildAgencyReport(raw, '2026-09', AT);

  test('no raw count, no id, no name: every number a multiple of 5 and ≥ 5, keys fixed', () => {
    const json = JSON.stringify(r);
    const numbers = [...json.matchAll(/"value":(\d+)/g)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(0);
    for (const v of numbers) expect(v % 5 === 0 && v >= 5).toBe(true);
    expect(Object.keys(r).sort()).toEqual(['all', 'byOrgType', 'byProvince', 'generatedAt', 'period', 'version']);
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
});

describe('files', () => {
  const raw = table({ Samsun: { MUNICIPALITY: 13, PUBLIC: 9 }, Tokat: { SME: 7 } });
  const r = buildAgencyReport(raw, '2026-09', AT);

  test('CSV: UTF-8 BOM, CRLF, one row per (table, group, step), cells as the printable page', () => {
    const csv = agencyReportCsv(r);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Dönem,Tablo,Grup,Adım,Değer');
    expect(lines).toHaveLength(1 + 8 * (1 + 9 + r.byProvince.length));
    expect(lines).toContain('2026-09,Tüm kurumlar,Tüm kurumlar,Davet koduyla kayıt,30');
    // Every value is a shown number or a label — never a count the dashboard hid.
    for (const l of lines.slice(1)) expect(l.split(',').at(-1)).toMatch(/^(\d*[05]|<5|Henüz ölçülmüyor)$/);
    expect(agencyReportCsv(r, 'en').slice(1).split('\r\n')[0]).toBe('Period,Table,Group,Step,Value');
  });

  test('printable page: escapes the agency name, says it is a print-to-PDF page, carries the privacy note', () => {
    const html = agencyReportHtml(r, '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('PDF olarak kaydet');
    expect(html).toContain("5'in katına yuvarlanır");
    expect(html).toContain('<td>30</td>');
  });

  test('reportPeriod: a run on the 1st closes the month before', () => {
    expect(reportPeriod(new Date('2026-10-01T06:00:00Z'))).toBe('2026-09');
    expect(reportPeriod(new Date('2027-01-01T06:00:00Z'))).toBe('2026-12');
    expect(reportPeriod(new Date('2026-09-29T12:00:00Z'))).toBe('2026-09');
  });
});
