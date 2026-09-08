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
      console.warn('[MOCK/DEV] Outlook Calendar connect attempted without MICROSOFT_OAUTH_CLIENT_ID (mock/dev mode)');
      throw new Error('MICROSOFT_OAUTH_CLIENT_ID not configured (mock/dev mode)');
    }
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${this.clientId}&scope=calendar.readwrite&redirect_uri=http://localhost:3000/api/calendar/callback`;
    return { authUrl };
  }

  async disconnect() {
    console.warn('[MOCK/DEV] Outlook Calendar disconnect called in mock/dev mode');
  }

  async createEvent(_event: CalendarEvent): Promise<{ externalId: string }> {
    console.warn('[MOCK/DEV] Outlook Calendar createEvent called in mock/dev mode: no real event created');
    throw new CalendarProviderNotImplementedError('outlook', 'createEvent');
  }

  async updateEvent(_externalId: string, _event: CalendarEvent): Promise<void> {
    console.warn('[MOCK/DEV] Outlook Calendar updateEvent called in mock/dev mode');
    throw new CalendarProviderNotImplementedError('outlook', 'updateEvent');
  }

  async deleteEvent(_externalId: string): Promise<void> {
    console.warn('[MOCK/DEV] Outlook Calendar deleteEvent called in mock/dev mode');
    throw new CalendarProviderNotImplementedError('outlook', 'deleteEvent');
  }
}

export function createOutlookProvider(clientId?: string, clientSecret?: string) {
  return new OutlookCalendarProvider(clientId, clientSecret);
}
