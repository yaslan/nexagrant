import type { NotificationEvent, NotificationType } from '@prisma/client';

/**
 * The notification centre's event list: spec §13 "Olaylar", in the spec's order
 * (NG-43, NG-22 E-1). Preferences are kept per event of this list, not per
 * stored `NotificationType`: the spec names nine events, the store had four
 * types, two of them not events of §13 at all.
 */
export const NOTIFICATION_EVENTS = [
  'NEW_MATCHING_CALL', // yeni uygun çağrı
  'CALL_CHANGED', // çağrı değişikliği
  'OUTREACH_REPLY', // outreach yanıtı
  'CONTRIBUTION_OVERDUE', // katkı gecikmesi
  'APPROVAL_OVERDUE', // onay süresi aşımı
  'BUDGET_DEVIATION', // bütçe sapması
  'TASK_COLOR_CHANGED', // görev rengi değişimi
  'REPORT_DUE', // rapor yaklaşması
  'OBLIGATION_REMINDER', // yükümlülük hatırlatması
] as const satisfies readonly NotificationEvent[];

/**
 * Which §13 event a stored notification type is. `null` = not a §13 event:
 * account and billing notices (credits) are not the user's to switch off, they
 * always go to the panel and never by e-mail.
 *
 * - SAVED_SEARCH_MATCH: a saved search found new calls → "yeni uygun çağrı".
 * - EVIDENCE_EXPIRING: a verified document of the institution is about to run
 *   out → "yükümlülük hatırlatması" (keeping eligibility documents valid is an
 *   obligation of the applicant).
 *
 * `satisfies Record<NotificationType, …>`: a new NotificationType does not
 * compile until it is placed here.
 */
export const NOTIFICATION_TYPE_EVENT = {
  SAVED_SEARCH_MATCH: 'NEW_MATCHING_CALL',
  CREDIT_GRANTED: null,
  CREDIT_EXHAUSTED: null,
  EVIDENCE_EXPIRING: 'OBLIGATION_REMINDER',
} as const satisfies Record<NotificationType, NotificationEvent | null>;

export function eventOfType(type: NotificationType): NotificationEvent | null {
  return NOTIFICATION_TYPE_EVENT[type];
}

export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return typeof value === 'string' && (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}
