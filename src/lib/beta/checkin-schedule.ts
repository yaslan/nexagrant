/**
 * Weekly beta check-in schedule (E11.1).
 *
 * The slot is defined as a wall-clock time in a named zone ("Monday 15:00 in
 * Europe/Istanbul"). Istanbul has a fixed +03:00 offset, but the zone is still a
 * flag (a different --tz may straddle a DST change), so each occurrence resolves
 * its own UTC instant from the zone rather than a hard-coded offset, and the ICS is
 * emitted in UTC — one VEVENT per week rather than an RRULE, so every client lands
 * on the same minute regardless of how it expands recurrence across a DST change.
 */

import {
  BETA_CHECKIN_DURATION_MIN,
  BETA_CHECKIN_HOUR,
  BETA_CHECKIN_MINUTE,
  BETA_CHECKIN_TZ,
  BETA_CHECKIN_WEEKDAY,
  BETA_CHECKIN_WEEKS,
  BETA_MEETING_URL,
} from './constants';
import { PRODUCT_NAME } from '../brand';

export interface CheckinSlot {
  /** IANA timezone the wall-clock time is expressed in. */
  timezone: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
  durationMinutes: number;
}

export const DEFAULT_CHECKIN_SLOT: CheckinSlot = {
  timezone: BETA_CHECKIN_TZ,
  weekday: BETA_CHECKIN_WEEKDAY,
  hour: BETA_CHECKIN_HOUR,
  minute: BETA_CHECKIN_MINUTE,
  durationMinutes: BETA_CHECKIN_DURATION_MIN,
};

export interface CheckinOccurrence {
  /** 1-based week number within the beta. */
  week: number;
  /** Wall-clock date in the programme timezone, ISO `YYYY-MM-DD`. */
  localDate: string;
  /** Wall-clock time in the programme timezone, `HH:MM`. */
  localTime: string;
  /** UTC offset in effect for that occurrence, e.g. `+02:00`. */
  utcOffset: string;
  start: Date;
  end: Date;
  /** Stable id — re-running the generator updates the same calendar entry. */
  uid: string;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const found = parts.find((p) => p.type === type);
  if (!found) throw new Error(`Intl part "${type}" is missing`);
  return Number(found.value);
}

/** Offset (ms) that `tz` was at for the given UTC instant: local - utc. */
function zoneOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const asIfUtc = Date.UTC(
    part(parts, 'year'),
    part(parts, 'month') - 1,
    part(parts, 'day'),
    part(parts, 'hour') % 24,
    part(parts, 'minute'),
    part(parts, 'second')
  );
  return asIfUtc - utcMs;
}

/** Resolve a wall-clock time in `tz` to the UTC instant it denotes. */
export function zonedTimeToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall;
  // Two passes converge for every real zone; a third guards the DST-fold edge.
  for (let i = 0; i < 3; i += 1) {
    const next = wall - zoneOffsetMs(tz, utc);
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

function formatOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** First occurrence of ISO `weekday` (1=Mon … 7=Sun) on or after `from` (`YYYY-MM-DD`). */
export function firstWeekdayOnOrAfter(from: string, weekday: number = BETA_CHECKIN_WEEKDAY): string {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error(`Invalid weekday ${weekday}, expected 1 (Monday) … 7 (Sunday)`);
  }
  const [y, m, d] = from.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid start date "${from}", expected YYYY-MM-DD`);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay() is 0=Sunday…6=Saturday; ISO 7 (Sunday) maps onto 0.
  const shift = ((weekday % 7) - cursor.getUTCDay() + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + shift);
  return cursor.toISOString().slice(0, 10);
}

export function buildCheckinSchedule(
  startDate: string,
  weeks: number = BETA_CHECKIN_WEEKS,
  slot: CheckinSlot = DEFAULT_CHECKIN_SLOT
): CheckinOccurrence[] {
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid start date "${startDate}", expected YYYY-MM-DD`);

  const occurrences: CheckinOccurrence[] = [];
  for (let week = 1; week <= weeks; week += 1) {
    const cursor = new Date(Date.UTC(y, m - 1, d));
    cursor.setUTCDate(cursor.getUTCDate() + (week - 1) * 7);
    const localDate = cursor.toISOString().slice(0, 10);

    const start = zonedTimeToUtc(
      slot.timezone,
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      slot.hour,
      slot.minute
    );
    const end = new Date(start.getTime() + slot.durationMinutes * 60_000);

    occurrences.push({
      week,
      localDate,
      localTime: `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`,
      utcOffset: formatOffset(zoneOffsetMs(slot.timezone, start.getTime())),
      start,
      end,
      uid: `fonbridge-beta-checkin-w${week}@fonbridge.com`,
    });
  }
  return occurrences;
}

function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** RFC 5545 §3.1: escape TEXT values, then fold lines at 75 octets. */
function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) chunks.push(` ${line.slice(i, i + 74)}`);
  return chunks.join('\r\n');
}

export interface CheckinIcsOptions {
  organizerEmail: string;
  attendees?: string[];
  meetingUrl?: string;
  /** Fixed stamp so re-generating an unchanged schedule yields a byte-identical file. */
  dtstamp?: Date;
  /** Zone named in the human-readable description; defaults to the programme zone. */
  timezone?: string;
}

/** One VCALENDAR holding every weekly check-in, importable into Google Calendar. */
export function buildCheckinIcs(
  occurrences: CheckinOccurrence[],
  options: CheckinIcsOptions
): string {
  const meetingUrl = options.meetingUrl ?? BETA_MEETING_URL;
  const timezone = options.timezone ?? BETA_CHECKIN_TZ;
  const stamp = icsStamp(options.dtstamp ?? new Date(Date.UTC(2026, 8, 6)));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${PRODUCT_NAME} SaaS//Beta Check-in//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
  ];

  for (const occ of occurrences) {
    const description = [
      `${PRODUCT_NAME} Beta weekly check-in — week ${occ.week}/${occurrences.length}.`,
      `${occ.localDate} ${occ.localTime} ${timezone} (UTC${occ.utcOffset}).`,
      'Agenda: what you tried, what broke, what is missing, one pricing question.',
      `Join: ${meetingUrl}`,
    ].join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${occ.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsStamp(occ.start)}`,
      `DTEND:${icsStamp(occ.end)}`,
      'SEQUENCE:0',
      `SUMMARY:${icsText(`${PRODUCT_NAME} Beta check-in — week ${occ.week}`)}`,
      `DESCRIPTION:${icsText(description)}`,
      `LOCATION:${icsText(meetingUrl)}`,
      `URL:${meetingUrl}`,
      `ORGANIZER;CN=${PRODUCT_NAME} Beta:mailto:${options.organizerEmail}`,
      ...(options.attendees ?? []).map(
        (email) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`
      ),
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
