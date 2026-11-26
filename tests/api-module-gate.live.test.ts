import { suiteHasDatabase } from './helpers/database-availability';
/**
 * TASK-MVDPYNG1JI0S1 (FO-80) — the Partner REST API is gated by M1 against the real
 * database: a key keeps authenticating in the DB, so the module state and the plan
 * are what the gate must read. The fake-DB version is tests/api/v1-module-gate.test.ts.
 */
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HAS_DB = await suiteHasDatabase('api-module-gate.live');

describe.skipIf(!HAS_DB)('/api/v1 module gate (live DB)', () => {
  let tenantId: string;
  let key: string;

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Module Gate Test', slug: `module-gate-${suffix()}`, country: 'TR' },
    });
    tenantId = tenant.id;
    key = `fp_live_mg_${crypto.randomBytes(12).toString('hex')}`;
    await prisma.apiKey.create({
      data: {
        tenantId,
        name: 'module gate test',
        prefix: key.slice(0, 12),
        keyHash: crypto.createHash('sha256').update(key).digest('hex'),
      },
    });
    await prisma.subscription.create({ data: { tenantId, planId: 'pro', status: 'ACTIVE' } });
    await prisma.moduleState.create({ data: { tenantId, moduleId: 'M1', status: 'ON' } });
  });

  afterEach(async () => {
    const id = requireId(tenantId, 'tenantId');
    await prisma.apiKey.deleteMany({ where: { tenantId: id } });
    await prisma.moduleState.deleteMany({ where: { tenantId: id } });
    await prisma.subscription.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  });

  const call = () =>
    authenticateApiKey(new Request('http://localhost/api/v1/calls', { headers: { 'x-api-key': key } }), { action: 'search_calls', feature: 'call_search' });

  const setM1 = (status: 'ON' | 'OFF' | 'PILOT' | 'DEV') =>
    prisma.moduleState.update({
      where: { tenantId_moduleId: { tenantId: requireId(tenantId, 'tenantId'), moduleId: 'M1' } },
      data: { status },
    });

  const setPlan = (planId: string) =>
    prisma.subscription.update({ where: { tenantId: requireId(tenantId, 'tenantId') }, data: { planId } });

  it('M1 on and in the plan: the key authenticates', async () => {
    expect((await call()).authenticated).toBe(true);
  });

  it('M1 switched off: 403 MODULE_ACCESS_DENIED, and turning it back on reopens the same key', async () => {
    await setM1('OFF');
    const off = await call();
    expect(off.authenticated).toBe(false);
    if (off.authenticated) return;
    expect(off.errorResponse.status).toBe(403);
    expect(await off.errorResponse.json()).toEqual({ error: 'MODULE_ACCESS_DENIED', module: 'M1' });

    await setM1('ON');
    expect((await call()).authenticated).toBe(true);
  });

  it('M1 in pilot: the tenant key keeps working (machine audience), while DEV stays staff-only: 200 then 403', async () => {
    await setM1('PILOT');
    expect((await call()).authenticated).toBe(true);

    await setM1('DEV');
    const dev = await call();
    expect(dev.authenticated).toBe(false);
    if (dev.authenticated) return;
    expect(dev.errorResponse.status).toBe(403);
  });

  it('switched on but the plan does not include M1 (public-starter): 403', async () => {
    await setPlan('public-starter');
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
  });

  // FO-41: Discover and Basic grant M1 limited (metered searches, read only);
  // the API meters nothing, so a limited M1 does not open it.
  it.each(['basic', 'free'])('M1 only limited on %s: 403', async (planId) => {
    await setPlan(planId);
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
  });
});
