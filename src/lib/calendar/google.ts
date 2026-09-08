import {
  CalendarEvent,
  CalendarProvider,
  CalendarProviderNotImplementedError,
} from './provider';

export class GoogleCalendarProvider implements CalendarProvider {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
  }

  async connect() {
    if (!this.clientId) {
      console.warn('[MOCK/DEV] Google Calendar connect attempted without GOOGLE_OAUTH_CLIENT_ID (mock/dev mode)');
      throw new Error('GOOGLE_OAUTH_CLIENT_ID not configured (mock/dev mode)');
    }
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&scope=calendar&redirect_uri=http://localhost:3000/api/calendar/callback`;
    return { authUrl };
  }

  async disconnect() {
    console.warn('[MOCK/DEV] Google Calendar disconnect called in mock/dev mode');
  }

  async createEvent(_event: CalendarEvent): Promise<{ externalId: string }> {
    console.warn('[MOCK/DEV] Google Calendar createEvent called in mock/dev mode: no real event created');
    throw new CalendarProviderNotImplementedError('google', 'createEvent');
  }

  async updateEvent(_externalId: string, _event: CalendarEvent): Promise<void> {
    console.warn('[MOCK/DEV] Google Calendar updateEvent called in mock/dev mode');
    throw new CalendarProviderNotImplementedError('google', 'updateEvent');
  }

  async deleteEvent(_externalId: string): Promise<void> {
    console.warn('[MOCK/DEV] Google Calendar deleteEvent called in mock/dev mode');
    throw new CalendarProviderNotImplementedError('google', 'deleteEvent');
  }
}

export function createGoogleProvider(clientId?: string, clientSecret?: string) {
  return new GoogleCalendarProvider(clientId, clientSecret);
}
