import { createHash } from 'crypto';

import { CalendarEvent, CalendarProvider } from './provider';
import { generateIcsContent } from '../calendar';

export class IcsProvider implements CalendarProvider {
  async connect() {
    return { authUrl: '' };
  }

  async disconnect() {
    // No-op: ICS doesn't require connection management
  }

  /**
   * An .ics "connection" has no remote calendar to push to — the file is
   * downloaded by the user from the brief screen. What this returns is the
   * handle the sync record keeps for the event.
   *
   * It used to be the first 32 characters of base64(the generated .ics). Since
   * `generateIcsContent` embeds a fresh `randomUUID()` UID and the current
   * DTSTAMP, the *same* event produced a *different* "external id" on every
   * call, so the id identified nothing. It is now derived from the event, so
   * re-syncing one brief keeps one id.
   */
  async createEvent(event: CalendarEvent) {
    // Validates as a side effect: a payload that cannot be rendered as RFC 5545
    // must fail here rather than be recorded as synced.
    generateIcsContent(event.title, event.description, event.start, event.end);

    const handle =
      event.externalId ??
      createHash('sha256')
        .update(`${event.title}\u0000${event.start.toISOString()}\u0000${event.end.toISOString()}`)
        .digest('hex')
        .slice(0, 32);

    return { externalId: `ics:${handle}` };
  }

  async updateEvent(_externalId: string, _event: CalendarEvent) {
    // ICS doesn't track updates; new event replaces old
  }

  async deleteEvent(_externalId: string) {
    // ICS doesn't track deletions
  }
}

export const icsProvider = new IcsProvider();
