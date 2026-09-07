import { z } from 'zod';

export interface CalendarEvent {
  title: string;
  description: string;
  start: Date;
  end: Date;
  externalId?: string;
}

export interface CalendarProvider {
  connect(): Promise<{ authUrl: string }>;
  disconnect(): Promise<void>;
  createEvent(event: CalendarEvent): Promise<{ externalId: string }>;
  updateEvent(externalId: string, event: CalendarEvent): Promise<void>;
  deleteEvent(externalId: string): Promise<void>;
}

export type CalendarProviderType = 'google' | 'outlook' | 'ics';

export const CalendarProviderSchema = z.enum(['google', 'outlook', 'ics']);
