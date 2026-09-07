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

/**
 * A small RFC 5545 conformance pass over a whole iCalendar stream, rather than
 * one property at a time.
 *
 * TASK-MTQUTBH8Q9VMK measured the generator with this and found one surviving
 * violation: the stream ended on "END:VCALENDAR" with nothing after it. §3.1
 * and the `icalobject` ABNF both terminate — not separate — content lines with
 * CRLF: `icalobject = "BEGIN:VCALENDAR" CRLF icalbody "END:VCALENDAR" CRLF`.
 * The other claims on that card (escaping, folding, UID, DTSTAMP) were already
 * satisfied; this function is here so the next claim can be measured instead of
 * argued.
 */
export function rfc5545Violations(ics: string): string[] {
  const findings: string[] = [];

  // §3.1 — line termination.
  if (!ics.endsWith('\r\n')) {
    findings.push('§3.1 the final content line is not terminated by CRLF');
  }
  if (/(?<!\r)\n/.test(ics) || /\r(?!\n)/.test(ics)) {
    findings.push('§3.1 a bare LF or CR appears outside a CRLF pair');
  }

  // §3.1 — octet-based folding, 75 octets excluding the CRLF.
  const rawLines = ics.split('\r\n').slice(0, -1);
  rawLines.forEach((line, i) => {
    const octets = Buffer.byteLength(line, 'utf8');
    if (octets > 75) {
      findings.push(`§3.1 content line ${i + 1} is ${octets} octets (>75) and is not folded`);
    }
  });

  const lines = unfold(ics).filter(Boolean);
  const has = (prefix: string) => lines.some((l) => l.startsWith(prefix));

  // §3.6/§3.7 — the properties a VCALENDAR and a VEVENT must carry.
  for (const required of [
    'BEGIN:VCALENDAR',
    'VERSION:',
    'PRODID:',
    'BEGIN:VEVENT',
    'UID:',
    'DTSTAMP:',
    'DTSTART:',
    'END:VEVENT',
    'END:VCALENDAR',
  ]) {
    if (!has(required)) findings.push(`§3.6/§3.7 required property missing: ${required}`);
  }

  for (const line of lines) {
    // §3.3.5 — DATE-TIME form.
    const when = /^(DTSTART|DTEND|DTSTAMP)(;[^:]*)?:(.+)$/.exec(line);
    if (when && !/^\d{8}T\d{6}Z?$/.test(when[3]!)) {
      findings.push(`§3.3.5 not a DATE-TIME value: ${line}`);
    }
    // §3.6.5 — a TZID parameter is only meaningful with a VTIMEZONE component.
    if (when?.[2]?.includes('TZID=') && !has('BEGIN:VTIMEZONE')) {
      findings.push(`§3.6.5 TZID used without a VTIMEZONE component: ${line}`);
    }
    // §3.3.11 — TEXT values escape backslash, semicolon, comma and newline.
    const text = /^(SUMMARY|DESCRIPTION|LOCATION):(.*)$/.exec(line);
    if (text && /(?<!\\)[;,]/.test(text[2]!)) {
      findings.push(`§3.3.11 unescaped ";" or "," in ${text[1]}`);
    }
  }

  return findings;
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
  it('passes an RFC 5545 conformance pass over the whole stream', () => {
    // The measurement TASK-MTQUTBH8Q9VMK's card asked for. Multi-byte text, a
    // semicolon, a comma and an embedded newline, all in one event.
    const ics = generateIcsContent(
      'Toplantı: Fraunhofer; ana konu, bütçe',
      `Satır bir\nSatır iki — ${'ü'.repeat(60)}`,
      start,
      end
    );
    expect(rfc5545Violations(ics)).toEqual([]);
  });

  it('terminates the stream with CRLF, not merely separating the lines', () => {
    // The one violation still standing when this card was measured: the stream
    // ended on "END:VCALENDAR" with no CRLF after it.
    const ics = generateIcsContent('Title', 'desc', start, end);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
