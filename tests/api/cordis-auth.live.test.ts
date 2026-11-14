import { suiteHasDatabase } from '../helpers/database-availability';
/**
 * FO-160 — the three /api/cordis/* routes against the real database, through the
 * API-key door: a wrong key is 401, a key on a limited plan (Discover) is 403, a
 * key on Pro reads 200, and a key past its per-minute count is 429 with Retry-After.
 *
 * The anonymous and session doors are not here: `auth()` needs a request scope,
 * which a test does not have. They are covered by tests/api/cordis-api-auth.test.ts
 * and by the live curl run against `next dev` recorded in the result file.
 */
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireId } from '../helpers/teardown-guard';
import { GET as getOrganizations } from '@/app/api/cordis/organizations/route';
import { GET as getProjects } from '@/app/api/cordis/projects/route';
import { GET as getOrganization } from '@/app/api/cordis/organizations/[id]/route';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// A CORDIS organisation row for the [id] route to read, so a Pro key gets 200 and
// not the route's own 404. Digits, as a PIC is.
const orgId = String(900_000_000 + Math.floor(Math.random() * 99_000_000));

const ROUTES: Array<[string, (headers: Record<string, string>) => Promise<Response>]> = [
  [
    '/api/cordis/organizations',
    (h) => getOrganizations(new NextRequest('http://localhost/api/cordis/organizations', { headers: h })),
  ],
  ['/api/cordis/projects', (h) => getProjects(new NextRequest('http://localhost/api/cordis/projects', { headers: h }))],
  [
    '/api/cordis/organizations/[id]',
    (h) =>
      getOrganization(new NextRequest(`http://localhost/api/cordis/organizations/${orgId}`, { headers: h }), {
        params: Promise.resolve({ id: orgId }),
      }),
  ],
];

function makeKey() {
  const key = `fp_live_cordis_${crypto.randomBytes(12).toString('hex')}`;
  return { key, keyHash: crypto.createHash('sha256').update(key).digest('hex'), prefix: key.slice(0, 12) };
}

const HAS_DB = await suiteHasDatabase('api/cordis-auth.live');

describe.skipIf(!HAS_DB)('/api/cordis/* API-key policy (live DB)', () => {
  let proTenantId: string;
  let discoverTenantId: string;
  let proKey: string;
  let discoverKey: string;
  let proKeyId: string;

  beforeAll(async () => {
    const pro = makeKey();
    const discover = makeKey();
    proKey = pro.key;
    discoverKey = discover.key;

    const proTenant = await prisma.tenant.create({
      data: { name: 'Cordis Auth Pro', slug: `cordis-auth-pro-${suffix()}`, country: 'TR' },
    });
    proTenantId = proTenant.id;
    const discoverTenant = await prisma.tenant.create({
      data: { name: 'Cordis Auth Discover', slug: `cordis-auth-discover-${suffix()}`, country: 'TR' },
    });
    discoverTenantId = discoverTenant.id;

    const proApiKey = await prisma.apiKey.create({
      data: { tenantId: proTenantId, name: 'cordis pro', prefix: pro.prefix, keyHash: pro.keyHash },
    });
    proKeyId = proApiKey.id;
    await prisma.apiKey.create({
      data: { tenantId: discoverTenantId, name: 'cordis discover', prefix: discover.prefix, keyHash: discover.keyHash },
    });

    await prisma.subscription.create({ data: { tenantId: proTenantId, planId: 'pro', status: 'ACTIVE' } });
    await prisma.subscription.create({ data: { tenantId: discoverTenantId, planId: 'free', status: 'ACTIVE' } });
    await prisma.moduleState.create({ data: { tenantId: proTenantId, moduleId: 'M1', status: 'ON' } });
    await prisma.moduleState.create({ data: { tenantId: discoverTenantId, moduleId: 'M1', status: 'ON' } });
    await prisma.cordisOrganization.create({ data: { organisationId: orgId, name: `FO-160 auth test ${suffix()}` } });
  });

  afterAll(async () => {
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: requireId(orgId, 'organisationId') } });
    for (const id of [proTenantId, discoverTenantId]) {
      const tenantId = requireId(id, 'tenantId');
      await prisma.apiKey.deleteMany({ where: { tenantId } });
      await prisma.moduleState.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  });

  // The 429 case fills the Pro key's window; open a fresh one for the next route.
  afterEach(async () => {
    await prisma.apiKey.update({
      where: { id: proKeyId },
      data: { rateWindowCount: 0, rateWindowStartedAt: null },
    });
  });

  describe.each(ROUTES)('%s', (_path, call) => {
    it('a key that is not in the database: 401, and it does not fall through to a session', async () => {
      const res = await call({ 'x-api-key': 'fp_live_cordis_not_a_real_key' });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: 'AUTH_INVALID_API_KEY' });
    });

    it('a key on Discover (M1 limited): 403 MODULE_ACCESS_DENIED', async () => {
      const res = await call({ 'x-api-key': discoverKey });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'MODULE_ACCESS_DENIED', module: 'M1' });
    });

    it('a key on Pro (M1 in full): 200 with the CORDIS envelope', async () => {
      const res = await call({ 'x-api-key': proKey });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true });
    });

    it('a Pro key past its per-minute count: 429 with Retry-After', async () => {
      await prisma.apiKey.update({
        where: { id: proKeyId },
        data: { rateWindowCount: 1000, rateWindowStartedAt: new Date() },
      });
      const res = await call({ 'x-api-key': proKey });
      expect(res.status).toBe(429);
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED' });
    });
  });
});
