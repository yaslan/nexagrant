/**
 * M9 meeting schedule input resolution.
 *
 * The briefs form takes the meeting moment as two separate controls (`<input
 * type="date">` + `<input type="time">`). The client used to reduce them with
 * `meetingDate && meetingTime ? dateToUTC(...) : undefined`, so a user who
 * filled only the date got their input dropped without a word: no Brussels
 * preview, no `meetingScheduledAt`, no `.ics` button, and no explanation
 * (dogfood finding P2-9).
 *
 * The pair is resolved here instead — as a pure function, so the rule is unit
 * testable and the component only renders the outcome.
 */

export type MeetingScheduleField = 'date' | 'time';

export type MeetingScheduleResult =
  | { ok: true; scheduledAt: Date | undefined }
  | { ok: false; field: MeetingScheduleField; message: string };

export const MEETING_SCHEDULE_MESSAGES = {
  timeMissing: 'Toplantı saatini de girin — yalnızca tarih girildiğinde görüşme takvime yazılmaz.',
  dateMissing: 'Toplantı tarihini de girin — yalnızca saat girildiğinde görüşme takvime yazılmaz.',
  invalid: 'Girilen toplantı tarihi ve saati geçerli değil.',
} as const;

/**
 * Both fields empty is valid: scheduling a meeting is optional, and a brief
 * without one is a legitimate record. Only a *half filled* pair is an error,
 * because that is the case where the user believes they entered something.
 */
export function resolveMeetingSchedule(dateStr: string, timeStr: string): MeetingScheduleResult {
  const date = dateStr.trim();
  const time = timeStr.trim();

  if (!date && !time) {
    return { ok: true, scheduledAt: undefined };
  }

  if (date && !time) {
    return { ok: false, field: 'time', message: MEETING_SCHEDULE_MESSAGES.timeMissing };
  }

  if (!date && time) {
    return { ok: false, field: 'date', message: MEETING_SCHEDULE_MESSAGES.dateMissing };
  }

  // Parsed in the browser's local zone, matching what the Brussels preview
  // shows the user; the server stores the resulting instant as UTC.
  const scheduledAt = new Date(`${date}T${time}`);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, field: 'date', message: MEETING_SCHEDULE_MESSAGES.invalid };
  }

  return { ok: true, scheduledAt };
}
