import { encode } from 'next-auth/jwt';
import { readFileSync } from 'node:fs';
const secret = readFileSync(process.argv[2], 'utf8').trim();
const [id, email, forged] = process.argv.slice(3);
const token = { id, sub: id, email, name: id, ...(forged ? { isPlatformAdmin: true, role: 'SUPER_ADMIN' } : {}) };
console.log(await encode({ token, secret, salt: 'authjs.session-token', maxAge: 3600 }));
