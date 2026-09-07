import { randomUUID } from 'crypto';

const ICS_LINE_MAX_OCTETS = 75;

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline must be escaped in TEXT values.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// RFC 5545 §3.1: content lines longer than 75 octets must be folded (CRLF + a single leading
// space). Folding is octet-based, so a multi-byte UTF-8 char must never be split across chunks.
function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= ICS_LINE_MAX_OCTETS) {
    return line;
  }

  const chunks: string[] = [];
  let start = 0;
  let limit = ICS_LINE_MAX_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes.at(end)! & 0xc0) === 0x80) {
      end--;
    }
    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    // Continuation lines carry a mandatory leading space, so they get one fewer content octet.
    limit = ICS_LINE_MAX_OCTETS - 1;
  }
  return chunks.join('\r\n ');
}

export function generateIcsContent(
  title: string,
  description: string,
  start: Date,
  end: Date
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fabrika SaaS//EN',
    'BEGIN:VEVENT',
    `UID:${randomUUID()}@fabrika.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // RFC 5545 §3.1 / the `icalobject` ABNF: every content line is *terminated*
  // by CRLF, the last one included — `icalobject = "BEGIN:VCALENDAR" CRLF
  // icalbody "END:VCALENDAR" CRLF`. `join` alone leaves the stream ending on
  // "END:VCALENDAR" with nothing after it, which strict parsers reject.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function createIcsDataUrl(
  title: string,
  description: string,
  start: Date,
  end: Date
): string {
  const content = generateIcsContent(title, description, start, end);
  return `data:text/calendar;charset=utf8,${encodeURIComponent(content)}`;
}
