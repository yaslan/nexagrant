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
      throw new Error('GOOGLE_OAUTH_CLIENT_ID not configured');
    }
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&scope=calendar&redirect_uri=http://localhost:3000/api/calendar/callback`;
    return { authUrl };
  }

  async disconnect() {
    // TODO: Revoke tokens when OAuth is configured
  }

  async createEvent(_event: CalendarEvent): Promise<{ externalId: string }> {
    // Was: a console.log and a random id, which the sync path recorded as a
    // real external event with a `lastSyncAt` stamp. See
    // CalendarProviderNotImplementedError in provider.ts.
    throw new CalendarProviderNotImplementedError('google', 'createEvent');
  }

  async updateEvent(_externalId: string, _event: CalendarEvent): Promise<void> {
    throw new CalendarProviderNotImplementedError('google', 'updateEvent');
  }

  async deleteEvent(_externalId: string): Promise<void> {
    throw new CalendarProviderNotImplementedError('google', 'deleteEvent');
  }
}

export function createGoogleProvider(clientId?: string, clientSecret?: string) {
  return new GoogleCalendarProvider(clientId, clientSecret);
}
