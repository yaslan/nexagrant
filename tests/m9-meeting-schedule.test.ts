import { describe, expect, it } from 'vitest';
import {
  MEETING_SCHEDULE_MESSAGES,
  resolveMeetingSchedule,
} from '@/modules/m9/meeting-schedule';

/**
 * Dogfood finding P2-9: a date entered without a time was dropped without a
 * word. These lock the rule that decides when the pair is usable.
 */
describe('resolveMeetingSchedule', () => {
  it('accepts an empty pair: scheduling a meeting is optional', () => {
    expect(resolveMeetingSchedule('', '')).toEqual({ ok: true, scheduledAt: undefined });
  });

  it('treats whitespace-only input as empty', () => {
    expect(resolveMeetingSchedule('   ', '  ')).toEqual({ ok: true, scheduledAt: undefined });
  });

  it('rejects a date without a time and points at the time field', () => {
    const result = resolveMeetingSchedule('2026-10-24', '');
    expect(result).toEqual({
      ok: false,
      field: 'time',
      message: MEETING_SCHEDULE_MESSAGES.timeMissing,
    });
  });

  it('rejects a time without a date and points at the date field', () => {
    const result = resolveMeetingSchedule('', '14:00');
    expect(result).toEqual({
      ok: false,
      field: 'date',
      message: MEETING_SCHEDULE_MESSAGES.dateMissing,
    });
  });

  it('rejects an unparseable pair rather than sending Invalid Date to the server', () => {
    const result = resolveMeetingSchedule('2026-13-45', '14:00');
    expect(result).toEqual({
      ok: false,
      field: 'date',
      message: MEETING_SCHEDULE_MESSAGES.invalid,
    });
  });

  it('resolves a complete pair to the instant the local zone implies', () => {
    const result = resolveMeetingSchedule('2026-10-24', '14:00');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduledAt).toEqual(new Date('2026-10-24T14:00'));
  });

  it('accepts a seconds-precision time value', () => {
    const result = resolveMeetingSchedule('2026-11-01', '14:00:30');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduledAt).toEqual(new Date('2026-11-01T14:00:30'));
  });
});
