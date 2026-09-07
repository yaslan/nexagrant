import { CalendarEvent, CalendarProvider } from './provider';

export class GoogleCalendarProvider implements CalendarProvider {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
  }

  async connect() {
    if (!this.clientId) {
      throw new Error('GOOGLE_OAUTH_CLIENT_ID not configured');
    }
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&scope=calendar&redirect_uri=http://localhost:3000/api/calendar/callback`;
    return { authUrl };
  }

  async disconnect() {
    // TODO: Revoke tokens when OAuth is configured
  }

  async createEvent(event: CalendarEvent) {
    // Mock: simulates Google Calendar API
    console.log('[MOCK] Google Calendar: createEvent', { event });
    return { externalId: `google:${Math.random().toString(36).slice(2, 11)}` };
  }

  async updateEvent(externalId: string, event: CalendarEvent) {
    console.log('[MOCK] Google Calendar: updateEvent', { externalId, event });
  }

  async deleteEvent(externalId: string) {
    console.log('[MOCK] Google Calendar: deleteEvent', { externalId });
  }
}

export function createGoogleProvider(clientId?: string, clientSecret?: string) {
  return new GoogleCalendarProvider(clientId, clientSecret);
}
