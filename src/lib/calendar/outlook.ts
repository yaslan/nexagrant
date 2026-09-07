import {
  CalendarEvent,
  CalendarProvider,
  CalendarProviderNotImplementedError,
} from './provider';

export class OutlookCalendarProvider implements CalendarProvider {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
  }

  async connect() {
    if (!this.clientId) {
      throw new Error('MICROSOFT_OAUTH_CLIENT_ID not configured');
    }
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${this.clientId}&scope=calendar.readwrite&redirect_uri=http://localhost:3000/api/calendar/callback`;
    return { authUrl };
  }

  async disconnect() {
    // TODO: Revoke tokens when OAuth is configured
  }

  async createEvent(_event: CalendarEvent): Promise<{ externalId: string }> {
    // Was: a console.log and a random id, which the sync path recorded as a
    // real external event with a `lastSyncAt` stamp. See
    // CalendarProviderNotImplementedError in provider.ts.
    throw new CalendarProviderNotImplementedError('outlook', 'createEvent');
  }

  async updateEvent(_externalId: string, _event: CalendarEvent): Promise<void> {
    throw new CalendarProviderNotImplementedError('outlook', 'updateEvent');
  }

  async deleteEvent(_externalId: string): Promise<void> {
    throw new CalendarProviderNotImplementedError('outlook', 'deleteEvent');
  }
}

export function createOutlookProvider(clientId?: string, clientSecret?: string) {
  return new OutlookCalendarProvider(clientId, clientSecret);
}
