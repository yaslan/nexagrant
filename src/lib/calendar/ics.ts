import { CalendarEvent, CalendarProvider } from './provider';
import { generateIcsContent } from '../calendar';

export class IcsProvider implements CalendarProvider {
  async connect() {
    return { authUrl: '' };
  }

  async disconnect() {
    // No-op: ICS doesn't require connection management
  }

  async createEvent(event: CalendarEvent) {
    const ics = generateIcsContent(event.title, event.description, event.start, event.end);
    const externalId = `ics:${Buffer.from(ics).toString('base64').slice(0, 32)}`;
    return { externalId };
  }

  async updateEvent(externalId: string, event: CalendarEvent) {
    // ICS doesn't track updates; new event replaces old
  }

  async deleteEvent(externalId: string) {
    // ICS doesn't track deletions
  }
}

export const icsProvider = new IcsProvider();
