// Replicates exactly what client.tsx handleDownloadIcs() passes to generateIcsContent()
function generateIcsContent(title, description, start, end) {
  const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Fabrika SaaS//EN','BEGIN:VEVENT',
    `DTSTART:${formatDate(start)}`,`DTEND:${formatDate(end)}`,`SUMMARY:${title}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
}
const briefContent = `### 1. Partner Background & EU Track Record
- **Partner:** Fraunhofer Institute (Germany) — PIC 999984059
- **Track Record:** 142 Horizon Europe participations, 48 coordinator roles; recognized leader.`;
const start = new Date('2026-09-15T14:00:00.000Z');
const end = new Date(start.getTime() + 3600000);
const ics = generateIcsContent(`Görüşme: Fraunhofer Institute; Munich, DE`, briefContent.substring(0,200), start, end);
console.log('----- generated .ics -----');
console.log(ics);
console.log('----- RFC 5545 checks -----');
const checks = [
  ['UID present (REQUIRED, RFC5545 3.6.1)', /\r\nUID:/.test(ics)],
  ['DTSTAMP present (REQUIRED, RFC5545 3.6.1)', /\r\nDTSTAMP:/.test(ics)],
  ['no unescaped comma in text values (RFC5545 3.3.11)', !/(SUMMARY|DESCRIPTION):.*[^\\],/.test(ics)],
  ['no unescaped semicolon in text values', !/(SUMMARY|DESCRIPTION):.*[^\\];/.test(ics)],
  ['all lines <= 75 octets (RFC5545 3.1 folding)', ics.split('\r\n').every(l => Buffer.byteLength(l,'utf8') <= 75)],
];
for (const [name, ok] of checks) console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
const longest = ics.split('\r\n').map(l=>Buffer.byteLength(l,'utf8')).sort((a,b)=>b-a)[0];
console.log('longest line octets:', longest);
