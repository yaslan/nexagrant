import { describe, it } from 'vitest';
import { ipBucket, hashClientIp, clientIpFrom, trustedProxyHops } from '@/lib/leads/public-lead';
const S = 'probe-secret';
const h = (ip: string) => hashClientIp(ip, S)!.slice(0, 10);
const hdr = (xff: string) => ({ get: (n: string) => (n === 'x-forwarded-for' ? xff : null) });
describe('probe', () => {
  it('prints', () => {
    const cases = [
      'fd62:62:62:62::b1', 'fd62:62:62:62:ffff:ffff:ffff:ffff', 'FD62:0062:0062:0062:0000:0000:0000:00B1',
      'fd62:62:62:62:0:0:0:1', 'fd62:62:62:62::1%eth0', 'fd62:62:62:62::1%25x', '[fd62:62:62:62::1]', ' fd62:62:62:62::1 ',
      'fd62:62:62:63::1', 'fd62:62:62:ff62::1', 'fd62:62:63:62::1',
      '::ffff:1.2.3.4', '::FFFF:1.2.3.4', '::ffff:0102:0304', '0:0:0:0:0:ffff:1.2.3.4', '0000:0000:0000:0000:0000:ffff:0102:0304', '[::ffff:1.2.3.4]', '::ffff:1.2.3.4%lo',
      '1.2.3.4', ' 1.2.3.4', '01.02.03.04', '1.2.3.4:5555', '[1.2.3.4]', '::1.2.3.4', '::ffff:0:1.2.3.4', '64:ff9b::1.2.3.4', '64:ff9b::5.6.7.8',
      '2002:0102:0304::1', '2002:0506:0708::1', 'fe80::1%a', 'fe80::2%b', '::', '::1', 'unknown', '[fd62:62:62:62::1]:443',
    ];
    for (const c of cases) console.log(JSON.stringify(c).padEnd(46), ipBucket(c).padEnd(26), h(c));
    for (const x of ['1.1.1.1, 9.9.9.9', 'fd00::1, 2001:db8:1:2::5', '', ' , 9.9.9.9', '9.9.9.9,,', '1.1.1.1 , fd62:62:62:62::1%zz'])
      console.log('xff', JSON.stringify(x), 'hops1=', clientIpFrom(hdr(x), 1), 'hops2=', clientIpFrom(hdr(x), 2), 'hops0=', clientIpFrom(hdr(x), 0));
    for (const v of [undefined, '', '0', '1', '2', '5', '6', '01', ' 2 ', '2.0', '-1', '1e0', '0x2', '１', '99999999999999999999'])
      console.log('hops', JSON.stringify(v), trustedProxyHops(v));
  });
});
