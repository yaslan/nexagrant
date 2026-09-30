import { attachmentContentDisposition as f } from './wt88/src/lib/content-disposition';
const cases: Record<string,string> = {
  tr: 'Çağrı: Kırsal İklim Öncüleri — ğüşıöç',
  emoji: '🚀 Proje 👩‍💻 🇹🇷',
  quote: 'He said "hi" \'x\'',
  semi: 'a; filename="evil.exe"; b',
  crlf: 'x\r\nSet-Cookie: pwn=1\r\n\r\nbody',
  lf_only: 'x\nX-Evil: 1',
  nul: 'a\u0000b\u007fc\u0085d',
  u2028: 'a X-Evil: 1 b',
  long: 'Ş'.repeat(5000) + '🚀'.repeat(200),
  longascii: 'A'.repeat(100000),
  lone_sur: 'x\uD800y\uDFFFz',
  bidi: 'fatura‮cod.exe',
  alm: 'fatura؜cod.exe',
  zw: 'a​b﻿c⁠d',
  pct: '100% %41 %0d%0a',
  path: '../../etc/passwd',
  winres: 'CON',
  dots: '...',
  empty: '',
  spaces: '   \t  ',
  onlyemoji: '🚀🚀',
  backslash: 'a\\"; x',
  html: '<script>alert(1)</script>',
};
for (const [k, v] of Object.entries(cases)) {
  const h = f(v, '.docx', 'ConceptNote');
  let ok = 'ok';
  try { new Headers({ 'Content-Disposition': h }); } catch (e) { ok = 'HEADERS-THROW ' + (e as Error).message; }
  const bad = /[\r\n\u0000]/.test(h) ? ' CRLF/NUL!' : '';
  const nonLatin1 = /[^\x00-\xff]/.test(h) ? ' NON-LATIN1!' : '';
  const nonAscii = /[^\x20-\x7e]/.test(h) ? ' NON-PRINTABLE-ASCII' : '';
  const m = /filename\*=UTF-8''(.*)$/.exec(h);
  const dec = m ? decodeURIComponent(m[1]) : '?';
  const q = /filename="([^"]*)"/.exec(h);
  const params = h.split(';').length;
  console.log(`${k}: ${ok}${bad}${nonLatin1}${nonAscii} len=${h.length} params=${params} ascii=${JSON.stringify(q?.[1]?.slice(0,80))} utf8=${JSON.stringify(dec.slice(0,80))} cps=${Array.from(dec).length}`);
}
