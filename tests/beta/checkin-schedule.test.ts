import { describe, it, expect } from 'vitest';
import {
  buildCheckinIcs,
  buildCheckinSchedule,
  firstWeekdayOnOrAfter,
  zonedTimeToUtc,
} from '@/lib/beta/checkin-schedule';
import { PRODUCT_NAME } from '@/lib/brand';

const START = '2026-09-07'; // Monday

describe('firstWeekdayOnOrAfter', () => {
  it('keeps a Monday where it is', () => {
    expect(firstWeekdayOnOrAfter('2026-09-07')).toBe('2026-09-07');
  });

  it('advances a Sunday by one day', () => {
    expect(firstWeekdayOnOrAfter('2026-09-06')).toBe('2026-09-07');
  });

  it('advances a Tuesday to the following Monday', () => {
    expect(firstWeekdayOnOrAfter('2026-09-08')).toBe('2026-09-14');
  });

  it('finds the next Thursday for the guide\'s programme design', () => {
    expect(firstWeekdayOnOrAfter('2026-09-06', 4)).toBe('2026-09-10');
    expect(firstWeekdayOnOrAfter('2026-09-10', 4)).toBe('2026-09-10');
  });

  it('treats ISO 7 as Sunday', () => {
    expect(firstWeekdayOnOrAfter('2026-09-07', 7)).toBe('2026-09-13');
  });

  it('rejects a weekday outside 1-7', () => {
    expect(() => firstWeekdayOnOrAfter('2026-09-07', 0)).toThrow(/Invalid weekday/);
    expect(() => firstWeekdayOnOrAfter('2026-09-07', 8)).toThrow(/Invalid weekday/);
  });

  it('rejects a malformed date', () => {
    expect(() => firstWeekdayOnOrAfter('07/09/2026')).toThrow(/YYYY-MM-DD/);
  });
});

describe('zonedTimeToUtc', () => {
  it('resolves a summer-time Brussels wall clock (UTC+2)', () => {
    expect(zonedTimeToUtc('Europe/Brussels', 2026, 9, 7, 15, 0).toISOString()).toBe(
      '2026-09-07T13:00:00.000Z'
    );
  });

  it('resolves a winter-time Brussels wall clock (UTC+1)', () => {
    expect(zonedTimeToUtc('Europe/Brussels', 2026, 10, 26, 15, 0).toISOString()).toBe(
      '2026-10-26T14:00:00.000Z'
    );
  });
});

describe('buildCheckinSchedule', () => {
  const schedule = buildCheckinSchedule(START, 8);

  it('produces one occurrence per beta week', () => {
    expect(schedule).toHaveLength(8);
    expect(schedule.map((o) => o.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('lands every occurrence on a Monday, seven days apart', () => {
    expect(schedule.map((o) => o.localDate)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    for (const occ of schedule) {
      expect(new Date(`${occ.localDate}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it('holds 15:00 Istanbul (+03:00, no DST) across the whole beta', () => {
    expect(schedule.every((o) => o.localTime === '15:00')).toBe(true);
    expect(schedule.every((o) => o.utcOffset === '+03:00')).toBe(true);
    expect(schedule[0]?.start.toISOString()).toBe('2026-09-07T12:00:00.000Z');
    expect(schedule[7]?.start.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });

  it('honours an alternative DST zone without touching the default', () => {
    // The regression this guards: a hard-coded offset would put week 8 an hour off.
    const brussels = buildCheckinSchedule('2026-09-07', 8, {
      timezone: 'Europe/Brussels',
      weekday: 1,
      hour: 15,
      minute: 0,
      durationMinutes: 30,
    });
    expect(brussels.every((o) => o.localTime === '15:00')).toBe(true);
    expect(brussels.slice(0, 7).every((o) => o.utcOffset === '+02:00')).toBe(true);
    expect(brussels[7]?.utcOffset).toBe('+01:00');
    expect(brussels[0]?.start.toISOString()).toBe('2026-09-07T13:00:00.000Z');
    expect(brussels[7]?.start.toISOString()).toBe('2026-10-26T14:00:00.000Z');
    expect(schedule[0]?.start.toISOString()).toBe('2026-09-07T12:00:00.000Z');
  });

  it('gives every occurrence a 30-minute duration', () => {
    for (const occ of schedule) {
      expect(occ.end.getTime() - occ.start.getTime()).toBe(30 * 60_000);
    }
  });

  it('uses stable uids so a re-run updates rather than duplicates', () => {
    const again = buildCheckinSchedule(START, 8);
    expect(again.map((o) => o.uid)).toEqual(schedule.map((o) => o.uid));
    expect(new Set(schedule.map((o) => o.uid)).size).toBe(8);
  });
});

/** RFC 5545 §3.1 unfolding — the inverse of the writer's 75-octet line folding. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('buildCheckinIcs', () => {
  const schedule = buildCheckinSchedule(START, 8);
  const ics = buildCheckinIcs(schedule, {
    organizerEmail: 'info@nexagrant.com',
    attendees: ['partner01@example.invalid'],
    dtstamp: new Date(Date.UTC(2026, 8, 6)),
  });

  it('wraps eight events in one calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(8);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(8);
  });

  it('uses CRLF line endings as RFC 5545 requires', () => {
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('emits the Istanbul-correct UTC instants', () => {
    expect(ics).toContain('DTSTART:20260907T120000Z');
    expect(ics).toContain('DTSTART:20261026T120000Z');
  });

  it('carries organizer and attendee', () => {
    expect(unfold(ics)).toContain(`ORGANIZER;CN=${PRODUCT_NAME} Beta:mailto:info@nexagrant.com`);
    expect(unfold(ics)).toContain(
      'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:partner01@example.invalid'
    );
  });

  it('is byte-identical when regenerated with the same stamp', () => {
    const again = buildCheckinIcs(schedule, {
      organizerEmail: 'info@nexagrant.com',
      attendees: ['partner01@example.invalid'],
      dtstamp: new Date(Date.UTC(2026, 8, 6)),
    });
    expect(again).toBe(ics);
  });

  it('folds every content line to 75 octets', () => {
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});
