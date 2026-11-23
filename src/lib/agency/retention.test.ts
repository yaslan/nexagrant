import { describe, expect, test } from 'vitest';
import {
  AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS,
  AGENCY_REPORT_PURGE_INTERVAL_MONTHS,
  AGENCY_REPORT_RETENTION_BASIS,
  AGENCY_REPORT_RETENTION_MONTHS,
  agencyReportRetentionCutoff,
  agencyReportRetentionRunId,
  purgeExpiredAgencyReports,
} from './retention';
import { SCHEDULE, previousTick } from '@/lib/jobs/schedule';
import tr from '../../../messages/tr.json';
import en from '../../../messages/en.json';

/** NG-341 (HUKUK-5 5d): 12-month retention, destroyed every 6 months, records kept ≥ 3 years. */

const iso = (d: Date) => d.toISOString();

describe('the decision is fixed in one place', () => {
  test('12 months, every 6 months, records ≥ 3 years, basis retention-12m', () => {
    expect(AGENCY_REPORT_RETENTION_MONTHS).toBe(12);
    expect(AGENCY_REPORT_PURGE_INTERVAL_MONTHS).toBe(6);
    expect(AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS).toBeGreaterThanOrEqual(3);
    expect(AGENCY_REPORT_RETENTION_BASIS).toBe('retention-12m');
  });

  test('the screen text says the same, in both languages', () => {
    expect(tr.agency.reports.retentionNote).toBe('Bu rapor 12 ay saklanır; süresi dolanlar 6 ayda bir toplu silinir.');
    expect(en.agency.reports.retentionNote).toMatch(/12 months.*every 6 months/);
  });
});

describe('agencyReportRetentionCutoff', () => {
  test('the same UTC instant 12 calendar months earlier', () => {
    expect(iso(agencyReportRetentionCutoff(new Date('2027-01-01T05:00:00Z')))).toBe('2026-01-01T05:00:00.000Z');
    expect(iso(agencyReportRetentionCutoff(new Date('2027-07-01T05:00:00.123Z')))).toBe('2026-07-01T05:00:00.123Z');
  });

  test('a day the earlier month lacks becomes its last day (29 Feb → 28 Feb)', () => {
    expect(iso(agencyReportRetentionCutoff(new Date('2028-02-29T10:00:00Z')))).toBe('2027-02-28T10:00:00.000Z');
    expect(iso(agencyReportRetentionCutoff(new Date('2029-02-28T10:00:00Z')))).toBe('2028-02-28T10:00:00.000Z');
  });

  test('a report generated on 1 Oct 2026 (period 2026-09) survives the Jul 2027 run and goes in Jan 2028', () => {
    const generated = new Date('2026-10-01T06:00:00Z');
    expect(generated < agencyReportRetentionCutoff(new Date('2027-07-01T05:00:00Z'))).toBe(false);
    expect(generated < agencyReportRetentionCutoff(new Date('2028-01-01T05:00:00Z'))).toBe(true);
  });

  test('never less than 12 months: cutoff ≤ at − 365 days', () => {
    for (let d = Date.UTC(2026, 0, 1); d < Date.UTC(2029, 0, 1); d += 86_400_000 * 7) {
      const at = new Date(d);
      expect(at.getTime() - agencyReportRetentionCutoff(at).getTime()).toBeGreaterThanOrEqual(365 * 86_400_000);
    }
  });
});

describe('agencyReportRetentionRunId', () => {
  test('a cron run is named by its tick, a manual run by its own moment', () => {
    const now = new Date('2027-01-02T08:00:00Z');
    expect(agencyReportRetentionRunId(new Date('2027-01-01T05:00:00Z'), now)).toBe('cron:2027-01-01T05:00:00.000Z');
    expect(agencyReportRetentionRunId(null, now)).toBe('manual:2027-01-02T08:00:00.000Z');
  });
});

describe('the schedule: 1 January and 1 July, 05:00 UTC', () => {
  const job = SCHEDULE.find((j) => j.id === 'agency-report-retention');

  test('twice a year, 6 months apart; not nightly', () => {
    if (!job) throw new Error('agency-report-retention is not scheduled');
    expect(job.cron).toBe('0 5 1 1,7 *');
    expect(iso(previousTick(job, new Date('2027-01-01T05:00:30Z'))!)).toBe('2027-01-01T05:00:00.000Z');
    expect(iso(previousTick(job, new Date('2027-07-15T00:00:00Z'))!)).toBe('2027-07-01T05:00:00.000Z');
    // No tick in the 32-day look-back on 2 March: the last one was 1 January.
    expect(previousTick(job, new Date('2027-03-02T00:00:00Z'))).toBeNull();
  });
});

describe('purgeExpiredAgencyReports (no database)', () => {
  test('no agency: nothing to do, the cutoff is reported', async () => {
    const r = await purgeExpiredAgencyReports(new Date('2027-01-01T05:00:00Z'), 'manual:x', { agencies: async () => [] });
    expect(r).toEqual({
      runId: 'manual:x',
      cutoff: '2026-01-01T05:00:00.000Z',
      agencies: 0,
      deleted: 0,
      purged: [],
      failed: 0,
      errors: [],
    });
  });
});
