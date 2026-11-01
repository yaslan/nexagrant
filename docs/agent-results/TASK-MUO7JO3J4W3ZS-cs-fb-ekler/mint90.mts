import { encode } from 'next-auth/jwt';
import fs from 'fs';
const users: Record<string, [string, string]> = {
  owner: ['o83-owner', 'owner83@o83.test'], restr: ['o83-restr', 'restr83@o83.test'], restrc: ['o83-restrc', 'restrc83@o83.test'],
  del: ['o83-del', 'del83@o83.test'], none: ['o83-none', 'none83@o83.test'], nomem: ['o83-nomem', 'nomem83@o83.test'],
  t5u: ['o83-t5u', 't5u83@o83.test'], t6u: ['o83-t6u', 't6u83@o83.test'], t7u: ['o83-t7u', 't7u83@o83.test'],
  t8u: ['o83-t8u', 't8u83@o83.test'], t9u: ['o90-t9u', 't9u90@o90.test'],
};
const out: Record<string, string> = {};
for (const [k, [id, email]] of Object.entries(users)) {
  out[k] = await encode({ token: { sub: id, id, email }, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 86400 });
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('minted', Object.keys(out).length);
