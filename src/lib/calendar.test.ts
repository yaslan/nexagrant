import { describe, expect, it } from 'vitest';
import { generateIcsContent } from './calendar';

// Parses folded RFC 5545 content lines back into logical "NAME:VALUE" lines.
function unfold(ics: string): string[] {
  return ics.split('\r\n').reduce<string[]>((lines, raw) => {
    if (raw.startsWith(' ') && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
    return lines;
  }, []);
}

describe('generateIcsContent', () => {
  const start = new Date('2026-10-24T11:00:00Z');
  const end = new Date('2026-10-24T12:00:00Z');

  it('includes the required UID and DTSTAMP properties', () => {
    const ics = generateIcsContent('Toplantı', 'Not', start, end);
    const lines = unfold(ics);

    const uidLine = lines.find((l) => l.startsWith('UID:'));
    const dtstampLine = lines.find((l) => l.startsWith('DTSTAMP:'));

    expect(uidLine).toBeDefined();
    expect(uidLine).toMatch(/^UID:[0-9a-f-]{36}@fabrika\.app$/);
    expect(dtstampLine).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/);
  });

  it('generates a distinct UID on every call', () => {
    const first = unfold(generateIcsContent('A', 'x', start, end)).find((l) =>
      l.startsWith('UID:')
    );
    const second = unfold(generateIcsContent('A', 'x', start, end)).find((l) =>
      l.startsWith('UID:')
    );
    expect(first).not.toEqual(second);
  });

  it('escapes commas, semicolons and backslashes in TEXT values', () => {
    const ics = generateIcsContent(
      'Görüşme: Fraunhofer Institute; Munich, DE',
      'C:\\path, with; special chars',
      start,
      end
    );
    const lines = unfold(ics);

    expect(lines).toContain(
      'SUMMARY:Görüşme: Fraunhofer Institute\\; Munich\\, DE'
    );
    expect(lines).toContain('DESCRIPTION:C:\\\\path\\, with\\; special chars');
  });

  it('escapes embedded newlines as the literal \\n sequence', () => {
    const ics = generateIcsContent('Title', 'line one\nline two', start, end);
    const lines = unfold(ics);
    expect(lines).toContain('DESCRIPTION:line one\\nline two');
  });

  it('folds content lines to at most 75 octets, breaking only on char boundaries', () => {
    const longDescription =
      '### 1. Partner Background & EU Track Record\n' +
      '- **Partner:** Fraunhofer Institute (Germany) — PIC 999984059 — özel karakterler ile dolu bir açıklama metni burada uzayıp gidiyor ve 75 okteti aşıyor.';
    const ics = generateIcsContent('Title', longDescription, start, end);

    for (const rawLine of ics.split('\r\n')) {
      expect(Buffer.byteLength(rawLine, 'utf8')).toBeLessThanOrEqual(75);
    }

    // Round-tripping through unfold() must reconstruct the original escaped value exactly,
    // proving no multi-byte character (e.g. "—" or "ö") was split across a fold boundary.
    const lines = unfold(ics);
    const descriptionLine = lines.find((l) => l.startsWith('DESCRIPTION:'));
    expect(descriptionLine).toBe(
      `DESCRIPTION:${longDescription.replace(/\n/g, '\\n')}`
    );
  });

  it('uses CRLF line endings throughout, with no bare LF or CR', () => {
    const ics = generateIcsContent('Title', 'desc', start, end);
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('produces valid DTSTART/DTEND values from the given dates', () => {
    const lines = unfold(generateIcsContent('Title', 'desc', start, end));
    expect(lines).toContain('DTSTART:20261024T110000Z');
    expect(lines).toContain('DTEND:20261024T120000Z');
  });
});
