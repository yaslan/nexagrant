import { suiteHasDatabase } from './helpers/database-availability';
/**
 * NG-272 — the API-key door of the NexaGrant plan gate, against the real database.
 *
 * A key authenticates only when its tenant's NexaGrant plan grants the feature the route
 * serves. The three scenarios of the card, all on a tenant whose platform plan already
 * includes M1 in full (so the M1 module gate passes and only the NexaGrant plan decides):
 *
 *   1. a mixed tenant — M1 in full, and an NgSubscription whose trial has run out: the key
 *      is refused 403 NG_FEATURE_NOT_IN_PLAN (the end plan ng-free does not grant partner_search);
 *   2. the same tenant while the trial runs: the key authenticates (ng-pro grants partner_search);
 *   3. a tenant with no NgSubscription row: unchanged, the key authenticates (K-584603 = A).
 *
 * The real HTTP check is run separately against a running server (see the NG-272 report).
 */
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { authenticateApiKey, type ApiKeyNgGate } from '@/lib/api-auth';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const HAS_DB = await suiteHasDatabase('api-ng-key-gate.live');

const PARTNER_SEARCH = { action: 'view_partner_search', feature: 'partner_search' } as const;
const CALL_SEARCH = { action: 'search_calls', feature: 'call_search' } as const;
const DAY = 86_400_000;

describe.skipIf(!HAS_DB)('/api/v1 NexaGrant plan gate on the API-key door (live DB)', () => {
  let tenantId: string;
  let key: string;

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'NG Key Gate Test', slug: `ng-key-gate-${suffix()}`, country: 'TR' },
    });
    tenantId = tenant.id;
    key = `fp_live_ngkg_${crypto.randomBytes(12).toString('hex')}`;
    await prisma.apiKey.create({
      data: {
        tenantId,
        name: 'ng key gate test',
        prefix: key.slice(0, 12),
        keyHash: crypto.createHash('sha256').update(key).digest('hex'),
      },
    });
    // The platform plan includes M1 in full (the module gate passes); the NexaGrant plan decides the rest.
    await prisma.subscription.create({ data: { tenantId, planId: 'pro', status: 'ACTIVE' } });
    await prisma.moduleState.create({ data: { tenantId, moduleId: 'M1', status: 'ON' } });
  });

  afterEach(async () => {
    const id = requireId(tenantId, 'tenantId');
    await prisma.ngSubscription.deleteMany({ where: { tenantId: id } });
    await prisma.apiKey.deleteMany({ where: { tenantId: id } });
    await prisma.moduleState.deleteMany({ where: { tenantId: id } });
    await prisma.subscription.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  });

  const call = (gate: ApiKeyNgGate | null = PARTNER_SEARCH) =>
    authenticateApiKey(new Request('http://localhost/api/v1/partners', { headers: { 'x-api-key': key } }), gate);

  /** An NgSubscription on the NexaGrant trial, ending `endsAt`; the end plan is ng-free. */
  const trial = (endsAt: Date) =>
    prisma.ngSubscription.create({
      data: {
        tenantId: requireId(tenantId, 'tenantId'),
        planId: 'ng-pro',
        status: 'TRIALING',
        provider: 'ng-trial',
        trialSegment: 'default',
        trialStartedAt: new Date(Date.now() - 1 * DAY),
        trialEndsAt: endsAt,
        trialEndPlanId: 'ng-free',
      },
    });

  it('mixed tenant (M1 in full, trial run out): 403 NG_FEATURE_NOT_IN_PLAN with the feature key', async () => {
    await trial(new Date(Date.now() - 1 * DAY));
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
    expect(await res.errorResponse.json()).toEqual({
      error: 'Forbidden',
      code: 'NG_FEATURE_NOT_IN_PLAN',
      feature: 'partner_search',
    });
  });

  it('same tenant while the trial runs: the key authenticates', async () => {
    await trial(new Date(Date.now() + 5 * DAY));
    const res = await call();
    expect(res.authenticated).toBe(true);
  });

  it('a tenant with no NgSubscription row is unchanged: the key authenticates', async () => {
    const res = await call();
    expect(res.authenticated).toBe(true);
  });

  it('the gate is per route: an ended trial refuses call_search too (ng-free does not grant it; BASIC and up do)', async () => {
    await trial(new Date(Date.now() - 1 * DAY));
    const res = await call(CALL_SEARCH);
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(await res.errorResponse.json()).toEqual({
      error: 'Forbidden',
      code: 'NG_FEATURE_NOT_IN_PLAN',
      feature: 'call_search',
    });
  });
});
