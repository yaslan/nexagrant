import crypto from 'node:crypto';
import { appBaseUrl, type AppUrlSource } from '@/lib/app-url';
import {
  CalendarEvent,
  CalendarProvider,
  CalendarProviderNotImplementedError,
} from './provider';

/**
 * The narrowest Google scope that covers what this provider does: create,
 * update and delete the events it syncs. The bare `calendar` it used to ask
 * for is not a Google scope name at all, and the full
 * `https://www.googleapis.com/auth/calendar` would also let us read, share and
 * delete the user's calendars themselves, which nothing here needs.
 */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_CALENDAR_CALLBACK_PATH = '/api/calendar/callback';

export class GoogleCalendarProvider implements CalendarProvider {
  private clientId: string;
  private clientSecret: string;
  private appUrlSource?: AppUrlSource;

  /** `appUrlSource` defaults to the process env; tests pass their own. */
  constructor(clientId?: string, clientSecret?: string, appUrlSource?: AppUrlSource) {
    this.clientId = clientId || '';
    this.clientSecret = clientSecret || '';
    this.appUrlSource = appUrlSource;
  }

  async connect() {
    if (!this.clientId) {
      console.warn('[MOCK/DEV] Google Calendar connect attempted without GOOGLE_OAUTH_CLIENT_ID (mock/dev mode)');
      throw new Error('GOOGLE_OAUTH_CLIENT_ID not configured (mock/dev mode)');
    }
    // Was a fixed http://localhost:3000 redirect_uri, which Google rejects for
    // any registered live client (TASK-MUN3OAFIVW9NA).
    const baseUrl = appBaseUrl(this.appUrlSource);
    if (!baseUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL not configured: no Google Calendar redirect_uri');
    }
    // CSRF: the caller keeps `state` (e.g. in an httpOnly cookie) and the
    // callback must refuse a response whose `state` does not match it.
    const state = crypto.randomBytes(32).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: `${baseUrl}${GOOGLE_CALENDAR_CALLBACK_PATH}`,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPE,
      access_type: 'offline',
      include_granted_scopes: 'true',
      state,
    });
    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state };
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
