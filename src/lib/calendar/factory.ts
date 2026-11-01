import { CalendarProvider, CalendarProviderType } from './provider';
import { icsProvider } from './ics';
import { createGoogleProvider } from './google';

export function createCalendarProvider(
  providerType: CalendarProviderType,
  options?: {
    googleClientId?: string;
    googleClientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
  }
): CalendarProvider {
  switch (providerType) {
    case 'ics':
      return icsProvider;
    case 'google':
      return createGoogleProvider(options?.googleClientId, options?.googleClientSecret);
    default:
      throw new Error(`Unknown calendar provider: ${providerType}`);
  }
}
