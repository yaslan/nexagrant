import { encode } from 'next-auth/jwt';
const SECRET = process.env.AUTH_SECRET || 'fabrika-secret-key-horizon-europe-2026-super-secure';
const value = await encode({
  token: { sub: 'demo-user-alice', id: 'demo-user-alice', name: 'Alice', email: 'alice@fabrika.test', tenantId: 'demo-tenant', role: 'PIPELINE_MANAGER' },
  secret: SECRET, salt: 'authjs.session-token', maxAge: 3600,
});
console.log(value);
