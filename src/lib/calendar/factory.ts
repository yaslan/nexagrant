import { CalendarProvider, CalendarProviderType } from './provider';
import { icsProvider } from './ics';
import { createGoogleProvider } from './google';
import { createOutlookProvider } from './outlook';

export function createCalendarProvider(
  providerType: CalendarProviderType,
  options?: {
    googleClientId?: string;
    googleClientSecret?: string;
    microsoftClientId?: string;
    microsoftClientSecret?: string;
  }
): CalendarProvider {
  switch (providerType) {
    case 'ics':
      return icsProvider;
    case 'google':
      return createGoogleProvider(options?.googleClientId, options?.googleClientSecret);
    case 'outlook':
      return createOutlookProvider(options?.microsoftClientId, options?.microsoftClientSecret);
    default:
      throw new Error(`Unknown calendar provider: ${providerType}`);
  }
}
