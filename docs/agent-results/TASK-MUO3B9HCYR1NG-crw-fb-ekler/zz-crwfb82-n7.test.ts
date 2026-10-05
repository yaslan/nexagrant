import { test } from 'vitest';
import { finalKeyOfIncoming } from '@/lib/storage';
const T = 'cmtenantaaaaaaaaaaaaaaaaa';
test('n7', () => {
  const ks = [`${T}/incoming/incoming/org-default/certificate/2026/deadbeef_x_pdf.pdf`, `${T}/incoming/zzz/incoming/org-default/certificate/2026/deadbeef_x_pdf.pdf`];
  require('node:fs').appendFileSync('/private/tmp/claude-501/-Users-macbook-alan/56338281-6978-4118-8f49-4597415a7647/scratchpad/ekler/n7.txt', ks.map((k) => `${k.replace(T,'T')} → ${JSON.stringify(finalKeyOfIncoming(T, k))?.replace(T,'T')}`).join('\n') + '\n');
});
