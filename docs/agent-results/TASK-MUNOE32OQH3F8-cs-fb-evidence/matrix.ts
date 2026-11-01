import { clientIpFrom, trustedProxyHops } from '@/lib/leads/public-lead';
const envs: (string|undefined)[] = [undefined, '', '0', '1', '2', '-1', '-0', '1.5', 'abc', 'NaN', 'Infinity', ' 2 ', '0x2', '1e0', '2abc', '99'];
for (const e of envs) console.log(`TRUSTED_PROXY_HOPS=${JSON.stringify(e)} -> ${trustedProxyHops(e)}`);
const h = (pairs: [string,string][]) => { const x = new Headers(); for (const [k,v] of pairs) x.append(k,v); return x; };
const cases: [string, [string,string][], number][] = [
  ['forged first, hops1', [['x-forwarded-for','10.9.3.1, 198.51.100.77']], 1],
  ['two XFF headers (Headers.append)', [['x-forwarded-for','10.9.3.1'],['x-forwarded-for','198.51.100.77']], 1],
  ['IPv6', [['x-forwarded-for','10.9.3.1, 2001:db8::1']], 1],
  ['IPv6 bracket+port', [['x-forwarded-for','[2001:db8::1]:4711']], 1],
  ['IPv4 with port', [['x-forwarded-for','198.51.100.77:4711']], 1],
  ['IPv4-mapped v6', [['x-forwarded-for','::ffff:198.51.100.77']], 1],
  ['empty XFF', [['x-forwarded-for','']], 1],
  ['only commas', [['x-forwarded-for',', ,,']], 1],
  ['trailing empty hop', [['x-forwarded-for','198.51.100.77, ']], 1],
  ['short chain hops2', [['x-forwarded-for','198.51.100.77']], 2],
  ['forged + short chain hops2 (CDN bypassed)', [['x-forwarded-for','6.6.6.6, 198.51.100.77']], 2],
  ['garbage value', [['x-forwarded-for','not-an-ip, <script>']], 1],
  ['hops0', [['x-forwarded-for','198.51.100.77']], 0],
  ['hops NaN (direct call)', [['x-forwarded-for','1.1.1.1, 198.51.100.77']], NaN],
  ['hops 1.5 (direct call)', [['x-forwarded-for','1.1.1.1, 198.51.100.77']], 1.5],
];
for (const [n, p, hops] of cases) console.log(`${n.padEnd(42)} hops=${hops} -> ${JSON.stringify(clientIpFrom(h(p), hops))}`);
