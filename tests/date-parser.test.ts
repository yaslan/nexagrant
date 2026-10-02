import { describe, test, expect } from 'vitest';
import { parsePublishedDate } from '@/lib/date';

describe('parsePublishedDate', () => {
  describe('Turkish format', () => {
    test('parses "28 Ağustos 2026" to UTC midnight', () => {
      const result = parsePublishedDate('28 Ağustos 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    });

    test('parses "31 Aralık 2026" to UTC midnight', () => {
      const result = parsePublishedDate('31 Aralık 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    test('parses "1 Ocak 2026" to UTC midnight', () => {
      const result = parsePublishedDate('1 Ocak 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    test('parses all 12 Turkish months', () => {
      const months = [
        { name: 'Ocak', month: 1 },
        { name: 'Şubat', month: 2 },
        { name: 'Mart', month: 3 },
        { name: 'Nisan', month: 4 },
        { name: 'Mayıs', month: 5 },
        { name: 'Haziran', month: 6 },
        { name: 'Temmuz', month: 7 },
        { name: 'Ağustos', month: 8 },
        { name: 'Eylül', month: 9 },
        { name: 'Ekim', month: 10 },
        { name: 'Kasım', month: 11 },
        { name: 'Aralık', month: 12 },
      ];

      for (const { name, month } of months) {
        const result = parsePublishedDate(`15 ${name} 2026`);
        expect(result).not.toBeNull();
        const iso = result?.toISOString() ?? '';
        expect(iso).toMatch(new RegExp(`^2026-${String(month).padStart(2, '0')}-15T00:00:00`));
      }
    });

    test('case-insensitive Turkish month matching', () => {
      const result = parsePublishedDate('28 AĞUSTOS 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    });
  });

  describe('English format', () => {
    test('parses "August 28, 2026" (Month DD, YYYY)', () => {
      const result = parsePublishedDate('August 28, 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    });

    test('parses "28 August 2026" (DD Month YYYY)', () => {
      const result = parsePublishedDate('28 August 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    });

    test('parses "December 31, 2026" to UTC midnight', () => {
      const result = parsePublishedDate('December 31, 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    test('parses all 12 English months', () => {
      const months = [
        { name: 'January', month: 1 },
        { name: 'February', month: 2 },
        { name: 'March', month: 3 },
        { name: 'April', month: 4 },
        { name: 'May', month: 5 },
        { name: 'June', month: 6 },
        { name: 'July', month: 7 },
        { name: 'August', month: 8 },
        { name: 'September', month: 9 },
        { name: 'October', month: 10 },
        { name: 'November', month: 11 },
        { name: 'December', month: 12 },
      ];

      for (const { name, month } of months) {
        const result = parsePublishedDate(`${name} 15, 2026`);
        expect(result).not.toBeNull();
        const iso = result?.toISOString() ?? '';
        expect(iso).toMatch(new RegExp(`^2026-${String(month).padStart(2, '0')}-15T00:00:00`));
      }
    });

    test('case-insensitive English month matching', () => {
      const result = parsePublishedDate('AUGUST 28, 2026');
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    });
  });

  describe('error handling', () => {
    test('returns null for empty string', () => {
      expect(parsePublishedDate('')).toBeNull();
    });

    test('returns null for null input', () => {
      expect(parsePublishedDate(null as unknown as string)).toBeNull();
    });

    test('returns null for undefined input', () => {
      expect(parsePublishedDate(undefined as unknown as string)).toBeNull();
    });

    test('returns null for non-string input', () => {
      expect(parsePublishedDate(123 as unknown as string)).toBeNull();
      expect(parsePublishedDate({} as unknown as string)).toBeNull();
    });

    test('returns null for invalid month name in Turkish', () => {
      expect(parsePublishedDate('28 Aralık2 2026')).toBeNull();
      expect(parsePublishedDate('28 Geçersiz 2026')).toBeNull();
    });

    test('returns null for invalid month name in English', () => {
      expect(parsePublishedDate('28 Monthname 2026')).toBeNull();
      expect(parsePublishedDate('Invalidmonth 28, 2026')).toBeNull();
    });

    test('returns null for malformed date strings', () => {
      expect(parsePublishedDate('2026 Ağustos 28')).toBeNull();
      expect(parsePublishedDate('August')).toBeNull();
      expect(parsePublishedDate('28, 2026')).toBeNull();
    });
  });

  describe('timezone correctness', () => {
    test('produces UTC midnight regardless of local timezone', () => {
      // All dates should end with T00:00:00.000Z
      const testCases = [
        '28 Ağustos 2026',
        'August 28, 2026',
        '28 August 2026',
      ];

      for (const dateStr of testCases) {
        const result = parsePublishedDate(dateStr);
        expect(result).not.toBeNull();
        const iso = result?.toISOString() ?? '';
        expect(iso).toMatch(/T00:00:00\.000Z$/);
      }
    });

    test('does not shift date based on timezone', () => {
      // The critical check from the bug: 28 Ağustos should always be 28, not 27
      const result = parsePublishedDate('28 Ağustos 2026');
      const iso = result?.toISOString() ?? '';
      expect(iso).toBe('2026-08-28T00:00:00.000Z');
      expect(iso).not.toContain('08-27');
    });
  });
});
