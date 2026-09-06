export function generateIcsContent(
  title: string,
  description: string,
  start: Date,
  end: Date
): string {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fabrika SaaS//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatDate(start)}`,
    `DTEND:${formatDate(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return ics;
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
