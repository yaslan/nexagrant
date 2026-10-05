import { safeCallbackUrl } from '../src/lib/safe-callback-url';
import fs from 'fs';
const P = [
  '/tr/calls/topic/X', 'https://evil.com/x', 'HTTPS://EVIL.COM', 'http:evil.com', '//evil.com/x', '///evil.com', '////evil.com',
  '/\\evil.com/x', '\\/evil.com', '\\\\evil.com', '/\t/evil.com', '/\n/evil.com', '/\r//evil.com', ' //evil.com/x', '/ /evil.com',
  '/ /evil.com', '/　/evil.com', '/ /evil.com', '/﻿/evil.com', '/​/evil.com', '/᠎/evil.com',
  '/a/../..//evil.com', '/..//evil.com', '/.//evil.com', '/./..//evil.com', '/%2e%2e//evil.com', '/%2E%2E/%2Fevil.com', '/.%2e//evil.com',
  '/%2F/evil.com', '/%2F%2Fevil.com', '/%5Cevil.com', '/%5C%5Cevil.com', '/%09/evil.com', '/%0d%0a//evil.com',
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '/javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x',
  '/／evil.com', '/∕evil.com', '/⁄evil.com', '/＼evil.com', '/@evil.com', '/?next=//evil.com', '/#//evil.com',
  '/tr/x?a=//evil.com#//evil.com', '', '/', '.', 'evil.com', '/\u0000//evil.com', '/\u007f//evil.com', '/\u0085//evil.com',
];
const origin = 'http://localhost:3583';
const rows = P.map((p) => {
  const out = safeCallbackUrl(p, '/tr/default/dashboard');
  const resolved = new URL(out, origin);
  return { in: JSON.stringify(p), out, sameOrigin: resolved.origin === origin, fallback: out === '/tr/default/dashboard' };
});
fs.writeFileSync(process.argv[2], JSON.stringify(rows));
for (const r of rows) console.log(`${r.sameOrigin ? 'OK ' : 'KAÇTI'} ${r.fallback ? 'fallback' : 'kept    '} ${r.in} -> ${r.out}`);
console.log(`toplam=${rows.length} kaçan=${rows.filter(r => !r.sameOrigin).length}`);
