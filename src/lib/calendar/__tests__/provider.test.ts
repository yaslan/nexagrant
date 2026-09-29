import { describe, it, expect, beforeEach } from 'vitest';
import { IcsProvider } from '../ics';
import { CalendarProviderNotImplementedError, CalendarProviderSchema } from '../provider';
import { GoogleCalendarProvider } from '../google';
import { createCalendarProvider } from '../factory';
import type { CalendarProviderType } from '../provider';

describe('CalendarProvider', () => {
  describe('IcsProvider', () => {
    let provider: IcsProvider;

    beforeEach(() => {
      provider = new IcsProvider();
    });

    it('should create an event with ICS', async () => {
      const event = {
        title: 'Team Meeting',
        description: 'Sync meeting',
        start: new Date('2026-09-15T10:00:00Z'),
        end: new Date('2026-09-15T11:00:00Z'),
      };

      const result = await provider.createEvent(event);
      expect(result.externalId).toMatch(/^ics:/);
    });

    it('returns the same external id for the same event twice', async () => {
      // It used to be base64 of the generated .ics, which embeds a fresh UID and
      // the current DTSTAMP — so one brief got a new "external id" per sync and
      // the id identified nothing.
      const event = {
        title: 'Team Meeting',
        description: 'Sync meeting',
        start: new Date('2026-09-15T10:00:00Z'),
        end: new Date('2026-09-15T11:00:00Z'),
      };

      const first = await provider.createEvent(event);
      const second = await provider.createEvent(event);
      expect(first.externalId).toBe(second.externalId);
    });

    it('keeps the caller-supplied handle when there is one', async () => {
      const result = await provider.createEvent({
        title: 'Team Meeting',
        description: 'Sync meeting',
        start: new Date('2026-09-15T10:00:00Z'),
        end: new Date('2026-09-15T11:00:00Z'),
        externalId: 'fabrika-brief-b1',
      });
      expect(result.externalId).toBe('ics:fabrika-brief-b1');
    });

    it('should handle update (no-op for ICS)', async () => {
      const event = {
        title: 'Updated Meeting',
        description: 'Updated',
        start: new Date('2026-09-15T10:00:00Z'),
        end: new Date('2026-09-15T11:00:00Z'),
      };

      await expect(provider.updateEvent('ics:123', event)).resolves.toBeUndefined();
    });

    it('should handle delete (no-op for ICS)', async () => {
      await expect(provider.deleteEvent('ics:123')).resolves.toBeUndefined();
    });

    it('should handle connect (no-op for ICS)', async () => {
      const result = await provider.connect();
      expect(result.authUrl).toBe('');
    });
  });

  describe('GoogleCalendarProvider', () => {
    let provider: GoogleCalendarProvider;

    beforeEach(() => {
      provider = new GoogleCalendarProvider('client123', 'secret123');
    });

    it('should generate auth URL with client ID', async () => {
      const result = await provider.connect();
      expect(result.authUrl).toContain('client_id=client123');
      expect(result.authUrl).toContain('scope=calendar');
    });

    it('should throw when client ID is missing', async () => {
      const noAuthProvider = new GoogleCalendarProvider();
      await expect(noAuthProvider.connect()).rejects.toThrow('GOOGLE_OAUTH_CLIENT_ID not configured');
    });

    it('refuses to invent an event id for an API it does not call', async () => {
      // Was: `console.log('[MOCK] …')` plus
      // `{ externalId: 'google:' + Math.random().toString(36) }`. The sync path
      // took that as success, wrote the id and stamped `lastSyncAt`, so the
      // settings screen reported "Son senkronizasyon" for an event that exists
      // in no calendar.
      const event = {
        title: 'Partner Meeting',
        description: 'Consortium discussion',
        start: new Date('2026-09-15T14:00:00Z'),
        end: new Date('2026-09-15T15:00:00Z'),
      };

      await expect(provider.createEvent(event)).rejects.toThrow(
        CalendarProviderNotImplementedError
      );
      await expect(provider.updateEvent('google:abc123', event)).rejects.toThrow(
        CalendarProviderNotImplementedError
      );
      await expect(provider.deleteEvent('google:abc123')).rejects.toThrow(
        CalendarProviderNotImplementedError
      );
    });
  });

  describe('Outlook (removed, owner decision 29.09 — TASK-MUMMIHYY2F4KB)', () => {
    // M9 ships Google Calendar + .ics only. These fail the moment an Outlook
    // provider is registered again, so bringing it back is a deliberate change.
    it('is not a provider type', () => {
      expect(CalendarProviderSchema.options).toEqual(['google', 'ics']);
      expect(CalendarProviderSchema.safeParse('outlook').success).toBe(false);
    });

    it('is refused by the factory', () => {
      expect(() => createCalendarProvider('outlook' as CalendarProviderType)).toThrow(
        'Unknown calendar provider: outlook'
      );
    });
  });

  describe('Factory', () => {
    it('should create ICS provider', () => {
      const provider = createCalendarProvider('ics');
      expect(provider).toBeInstanceOf(IcsProvider);
    });

    it('should create Google provider', () => {
      const provider = createCalendarProvider('google', {
        googleClientId: 'test-client',
        googleClientSecret: 'test-secret',
      });
      expect(provider).toBeInstanceOf(GoogleCalendarProvider);
    });

    it('should throw for unknown provider', () => {
      expect(() => createCalendarProvider('unknown' as CalendarProviderType)).toThrow(
        'Unknown calendar provider: unknown'
      );
    });
  });
});
