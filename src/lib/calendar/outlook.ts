import { CalendarEvent, CalendarProvider } from './provider';

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

  async createEvent(event: CalendarEvent) {
    // Mock: simulates Outlook Graph API
    console.log('[MOCK] Outlook Calendar: createEvent', { event });
    return { externalId: `outlook:${Math.random().toString(36).slice(2, 11)}` };
  }

  async updateEvent(externalId: string, event: CalendarEvent) {
    console.log('[MOCK] Outlook Calendar: updateEvent', { externalId, event });
  }

  async deleteEvent(externalId: string) {
    console.log('[MOCK] Outlook Calendar: deleteEvent', { externalId });
  }
}

export function createOutlookProvider(clientId?: string, clientSecret?: string) {
  return new OutlookCalendarProvider(clientId, clientSecret);
}
