import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IcsProvider } from '../ics';
import { GoogleCalendarProvider } from '../google';
import { OutlookCalendarProvider } from '../outlook';
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

    it('should create an event (mock)', async () => {
      const event = {
        title: 'Partner Meeting',
        description: 'Consortium discussion',
        start: new Date('2026-09-15T14:00:00Z'),
        end: new Date('2026-09-15T15:00:00Z'),
      };

      const result = await provider.createEvent(event);
      expect(result.externalId).toMatch(/^google:/);
    });

    it('should update and delete events', async () => {
      const event = {
        title: 'Updated Meeting',
        description: 'Changed',
        start: new Date('2026-09-15T14:00:00Z'),
        end: new Date('2026-09-15T15:00:00Z'),
      };

      await expect(provider.updateEvent('google:abc123', event)).resolves.toBeUndefined();
      await expect(provider.deleteEvent('google:abc123')).resolves.toBeUndefined();
    });
  });

  describe('OutlookCalendarProvider', () => {
    let provider: OutlookCalendarProvider;

    beforeEach(() => {
      provider = new OutlookCalendarProvider('client456', 'secret456');
    });

    it('should generate auth URL with client ID', async () => {
      const result = await provider.connect();
      expect(result.authUrl).toContain('client_id=client456');
      expect(result.authUrl).toContain('scope=calendar.readwrite');
    });

    it('should throw when client ID is missing', async () => {
      const noAuthProvider = new OutlookCalendarProvider();
      await expect(noAuthProvider.connect()).rejects.toThrow('MICROSOFT_OAUTH_CLIENT_ID not configured');
    });

    it('should create an event (mock)', async () => {
      const event = {
        title: 'Partner Meeting',
        description: 'Consortium discussion',
        start: new Date('2026-09-15T14:00:00Z'),
        end: new Date('2026-09-15T15:00:00Z'),
      };

      const result = await provider.createEvent(event);
      expect(result.externalId).toMatch(/^outlook:/);
    });

    it('should update and delete events', async () => {
      const event = {
        title: 'Updated Meeting',
        description: 'Changed',
        start: new Date('2026-09-15T14:00:00Z'),
        end: new Date('2026-09-15T15:00:00Z'),
      };

      await expect(provider.updateEvent('outlook:def456', event)).resolves.toBeUndefined();
      await expect(provider.deleteEvent('outlook:def456')).resolves.toBeUndefined();
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

    it('should create Outlook provider', () => {
      const provider = createCalendarProvider('outlook', {
        microsoftClientId: 'test-client',
        microsoftClientSecret: 'test-secret',
      });
      expect(provider).toBeInstanceOf(OutlookCalendarProvider);
    });

    it('should throw for unknown provider', () => {
      expect(() => createCalendarProvider('unknown' as CalendarProviderType)).toThrow(
        'Unknown calendar provider: unknown'
      );
    });
  });
});
