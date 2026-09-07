import { z } from 'zod';

export interface CalendarEvent {
  title: string;
  description: string;
  start: Date;
  end: Date;
  externalId?: string;
}

export interface CalendarProvider {
  connect(): Promise<{ authUrl: string }>;
  disconnect(): Promise<void>;
  createEvent(event: CalendarEvent): Promise<{ externalId: string }>;
  updateEvent(externalId: string, event: CalendarEvent): Promise<void>;
  deleteEvent(externalId: string): Promise<void>;
}

export type CalendarProviderType = 'google' | 'outlook' | 'ics';

export const CalendarProviderSchema = z.enum(['google', 'outlook', 'ics']);

/**
 * Thrown by a provider whose remote half does not exist yet.
 *
 * TASK-MTQUTBH8Q9VMK — `GoogleCalendarProvider.createEvent` and its Outlook
 * twin used to `console.log('[MOCK] …')` and return
 * `{ externalId: "google:" + Math.random().toString(36) }`. `syncMeetingBriefToCalendar`
 * takes that as success: it writes the id and stamps `lastSyncAt`, and the
 * calendar settings screen then tells the user "Son senkronizasyon: <date>"
 * about an event that exists in no calendar anywhere. A random string is not an
 * external id, and a log line is not an API call.
 *
 * The sync path already handles a throw correctly — it records a SystemAlert and
 * moves on to the next connection (CLAUDE.md rule 6) — so failing loudly here
 * costs nothing and stops the false "synced" claim.
 */
export class CalendarProviderNotImplementedError extends Error {
  readonly code = 'CALENDAR_PROVIDER_NOT_IMPLEMENTED';

  constructor(readonly provider: CalendarProviderType, operation: string) {
    super(
      `${provider} calendar ${operation} is not implemented: no API call is made, so no event is created.`
    );
    this.name = 'CalendarProviderNotImplementedError';
  }
}
