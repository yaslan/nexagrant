import { test } from 'vitest';
import { finalKeyOfIncoming, generateR2ObjectKey } from '@/lib/storage';
const T = 'cmtenantaaaaaaaaaaaaaaaaa';
const good = `${T}/incoming/org-default/certificate/2026/deadbeef_belge_pdf.pdf`;
const cases: [string, unknown][] = [
  ['presign shape', good],
  ['nested incoming org', `${T}/incoming/incoming/certificate/2026/deadbeef_x_pdf.pdf`],
  ['INCOMING upper org', `${T}/incoming/INCOMING/certificate/2026/deadbeef_x_pdf.pdf`],
  ['Incoming mixed org', `${T}/incoming/Incoming/certificate/2026/deadbeef_x_pdf.pdf`],
  ['category=incoming', `${T}/incoming/org-default/incoming/2026/deadbeef_x_pdf.pdf`],
  ['double nested', `${T}/incoming/incoming/incoming/certificate/2026/deadbeef_x.pdf`],
  ['old loose short', `${T}/incoming/incoming/x.pdf`],
  ['other tenant as org', `${T}/incoming/cmtenantbbbbbbbbbbbbbbbbb/certificate/2026/deadbeef_x_pdf.pdf`],
  ['final key itself', `${T}/org-default/certificate/2026/deadbeef_x_pdf.pdf`],
  ['dot-dot', `${T}/incoming/../certificate/2026/deadbeef_x_pdf.pdf`],
  ['encoded slash', `${T}/incoming/org%2Fx/certificate/2026/deadbeef_x_pdf.pdf`],
  ['trailing newline', `${good}\n`],
  ['leading slash', `/${good}`],
  ['double slash', `${T}/incoming//org-default/certificate/2026/deadbeef_x_pdf.pdf`],
  ['uppercase ext', good.replace('.pdf', '.PDF')],
  ['hash 9 chars', good.replace('deadbeef_', 'deadbeef0_')],
  ['extra segment', `${T}/incoming/org-default/certificate/2026/x/deadbeef_x_pdf.pdf`],
  ['unicode name', good.replace('belge', 'bélge')],
  ['url form', `https://x.r2.dev/${good}`],
  ['array', [good]],
  ['other tenant key', good.replace(T, 'cmtenantbbbbbbbbbbbbbbbbb')],
];
test('D-1 key probes', () => {
  const out = cases.map(([n, k]) => `${n.padEnd(22)} → ${JSON.stringify(finalKeyOfIncoming(T, k))?.replace(T, 'T')}`);
  // presign → finalKeyOfIncoming round trip on odd inputs
  const names = ['BELGE.PDF', 'Ş ğ ü.pdf', 'a'.repeat(300) + '.pdf', '.pdf', 'noext', 'x.p d f', '..pdf'];
  const cats = ['certificate', 'CAT-03', 'İzin Belgesi', '../x', ''];
  for (const n of names) for (const c of cats) {
    const k = generateR2ObjectKey(T, 'org-default', c || 'certificate', n);
    const inc = `${T}/incoming/${k.slice(T.length + 1)}`;
    if (!finalKeyOfIncoming(T, inc)) out.push(`ROUNDTRIP FAIL name=${JSON.stringify(n).slice(0, 30)} cat=${JSON.stringify(c)} key=${inc.replace(T, 'T').slice(0, 90)}`);
  }
  require('node:fs').writeFileSync('/private/tmp/claude-501/-Users-macbook-alan/56338281-6978-4118-8f49-4597415a7647/scratchpad/d1-probes.txt', out.join('\n') + '\n');
});
