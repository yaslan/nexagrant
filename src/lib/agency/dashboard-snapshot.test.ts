import { describe, expect, test } from 'vitest';
import type { OrgType } from '@prisma/client';
import { buildAgencyFunnel, FUNNEL_STEPS, NO_PROVINCE, ORG_TYPES, type FunnelStep, type RawByProvince } from './funnel';
import { buildAgencyReport, reportPeriod, type AgencyReportSnapshot } from './report';
import { followsCurrentRules, funnelFromSnapshot } from './dashboard-snapshot';

/**
 * NG-340 (HUKUK-5 5b) — the dashboard reads the month-end snapshot, so the time
 * channel closes. Pure: no database. tests/agency-dashboard-month-end.live.test.ts
 * runs the same on fabrika_app.
 */

type Counts = Partial<Record<OrgType, Partial<Record<FunnelStep, number>>>>;

function raw(counts: Counts, province = 'Samsun'): RawByProvince {
  const table = Object.fromEntries(
    ORG_TYPES.map((t) => [t, Object.fromEntries(FUNNEL_STEPS.map((s) => [s, counts[t]?.[s] ?? 0]))])
  ) as Record<OrgType, Record<FunnelStep, number>>;
  return new Map([
    [province, table],
    [NO_PROVINCE, Object.fromEntries(ORG_TYPES.map((t) => [t, Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0]))])) as Record<OrgType, Record<FunnelStep, number>>],
  ]);
}

/** Same fixture as the live test: two big types and two small ones that cover each other. */
const BEFORE: Counts = { SME: { registered: 20 }, MUNICIPALITY: { registered: 20 }, NGO: { registered: 3 }, UNIVERSITY: { registered: 8 } };

describe('funnelFromSnapshot: the dashboard is the stored report, nothing recounted', () => {
  const snap = buildAgencyReport(raw(BEFORE), '2026-10', new Date('2026-11-01T06:00:00Z'));

  test('the type breakdown is the snapshot cell for cell, and equals the live answer at that moment', () => {
    const f = funnelFromSnapshot(snap, { dimension: 'orgType' });
    if (f.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
    expect(f.all).toEqual(snap.all);
    expect(f.breakdown.byOrgType).toEqual(snap.byOrgType);
    expect(f).toEqual(buildAgencyFunnel(raw(BEFORE), { dimension: 'orgType' }));
    // The fixture shows numbers (not all "<10"), so a change would be visible.
    expect(f.breakdown.byOrgType.SME.registered).toEqual({ state: 'count', value: 20 });
    expect(f.all.registered).toEqual({ state: 'withheld' });
  });

  test('no breakdown and a province both give the totals only (no province view since NG-339)', () => {
    expect(funnelFromSnapshot(snap, { dimension: 'none' })).toEqual({ all: snap.all, breakdown: { dimension: 'none' } });
    expect(funnelFromSnapshot(snap, { dimension: 'province', province: 'Samsun' })).toEqual({
      all: snap.all,
      breakdown: { dimension: 'none' },
    });
  });
});

describe('followsCurrentRules: a pre-NG-339 report is not republished on the dashboard', () => {
  const current = buildAgencyReport(raw(BEFORE), '2026-10', new Date('2026-11-01T06:00:00Z'));
  test('a report made today passes', () => expect(followsCurrentRules(current)).toBe(true));
  test('a published grand total fails', () => {
    const s: AgencyReportSnapshot = structuredClone(current);
    s.all.registered = { state: 'count', value: 50 };
    expect(followsCurrentRules(s)).toBe(false);
  });
  test('a count of 5 (threshold 5, rounding 5) fails', () => {
    const s: AgencyReportSnapshot = structuredClone(current);
    s.byOrgType.NGO.registered = { state: 'count', value: 5 };
    expect(followsCurrentRules(s)).toBe(false);
  });
  test('a stored province table fails', () => {
    const s: AgencyReportSnapshot = structuredClone(current);
    s.byProvince = [{ province: 'Samsun', view: current.byOrgType.SME }];
    expect(followsCurrentRules(s)).toBe(false);
  });
});

/**
 * The time channel, measured. 92 days (1 Sep – 1 Dec 2026), one SME registering
 * every day at 12:00 UTC on top of the fixture. An agency polls the dashboard
 * every hour and notes when the answer changes.
 *   - before (live count): it changes on the day a rounded number steps, which
 *     dates a registration to the hour;
 *   - after (month-end snapshot, written by the 1st-of-month 06:00 UTC run):
 *     it changes only at that run, once a month.
 */
describe('time channel: live dashboard vs month-end snapshot', () => {
  const START = Date.UTC(2026, 8, 1);
  const HOUR = 3_600_000;
  const HOURS = 92 * 24;
  /** Registrations made up to `ms`. */
  const smesAt = (ms: number) => 20 + Math.max(0, Math.floor((ms - START - 12 * HOUR) / (24 * HOUR)) + 1);
  const rawAt = (ms: number) => raw({ ...BEFORE, SME: { registered: smesAt(ms) } });

  function poll(answer: (ms: number) => string) {
    const changes: string[] = [];
    let prev = answer(START);
    for (let h = 1; h <= HOURS; h++) {
      const ms = START + h * HOUR;
      const now = answer(ms);
      if (now !== prev) changes.push(new Date(ms).toISOString());
      prev = now;
    }
    return changes;
  }

  test('live: the answer steps mid-month (the old leak); snapshot: only at the 1st-of-month run', () => {
    const live = poll((ms) => JSON.stringify(buildAgencyFunnel(rawAt(ms), { dimension: 'orgType' })));

    /** The store the monthly job fills: period → snapshot, written once at 06:00 UTC on the 1st. */
    const store = new Map<string, AgencyReportSnapshot>();
    const dashboard = (ms: number) => {
      const now = new Date(ms);
      if (now.getUTCDate() === 1 && now.getUTCHours() >= 6) {
        const period = reportPeriod(now);
        if (!store.has(period)) store.set(period, buildAgencyReport(rawAt(ms), period, now));
      }
      const latest = [...store.keys()].sort().at(-1);
      return latest ? JSON.stringify(funnelFromSnapshot(store.get(latest)!, { dimension: 'orgType' })) : 'none';
    };
    const snapshot = poll(dashboard);

    // Before NG-340: several changes, each at the very poll of a registration (12:00 UTC), mostly mid-month.
    expect(live.length).toBeGreaterThan(3);
    expect(live.every((iso) => iso.endsWith('T12:00:00.000Z'))).toBe(true);
    expect(live.some((iso) => !iso.slice(8, 10).startsWith('01'))).toBe(true);
    // After: exactly one change per month start, at the 06:00 UTC run (the first, 1 Sep, makes August's snapshot).
    expect(snapshot).toEqual([
      '2026-09-01T06:00:00.000Z',
      '2026-10-01T06:00:00.000Z',
      '2026-11-01T06:00:00.000Z',
      '2026-12-01T06:00:00.000Z',
    ]);
    console.log(`[NG-340 time channel] live changes=${live.length} ${live.join(',')} | snapshot changes=${snapshot.length} ${snapshot.join(',')}`);
  });
});
