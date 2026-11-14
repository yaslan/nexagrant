import { suiteHasDatabase } from './helpers/database-availability';
/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-4) — the per-key rate
 * limit against the real database: the counting UPDATE in authenticateApiKey,
 * its window reset, and that concurrent requests cannot slip past the limit.
 */
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { API_KEY_RATE_LIMIT_PER_MINUTE } from '@/lib/api-rate-limit';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HAS_DB = await suiteHasDatabase('api-key-rate-limit.live');

describe.skipIf(!HAS_DB)('API key rate limit (live DB)', () => {
  let tenantId: string;
  let keyId: string;
  let key: string;

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Rate Limit Test', slug: `rate-limit-${suffix()}`, country: 'TR' },
    });
    tenantId = tenant.id;
    // The key is only served while M1 is on and the plan includes it (FO-80); the
    // counter is what this suite measures, so the tenant is entitled to M1.
    await prisma.subscription.create({ data: { tenantId, planId: 'pro', status: 'ACTIVE' } });
    await prisma.moduleState.create({ data: { tenantId, moduleId: 'M1', status: 'ON' } });
    key = `fp_live_rl_${crypto.randomBytes(12).toString('hex')}`;
    const row = await prisma.apiKey.create({
      data: {
        tenantId,
        name: 'rate limit test',
        prefix: key.slice(0, 12),
        keyHash: crypto.createHash('sha256').update(key).digest('hex'),
      },
    });
    keyId = row.id;
  });

  afterEach(async () => {
    await prisma.apiKey.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  });

  const call = () =>
    authenticateApiKey(new Request('http://localhost/api/v1/calls', { headers: { authorization: `Bearer ${key}` } }));

  const setWindow = (count: number, startedAt: Date) =>
    prisma.apiKey.update({ where: { id: keyId }, data: { rateWindowCount: count, rateWindowStartedAt: startedAt } });

  it('counts each request on the key row and records lastUsedAt', async () => {
    expect((await call()).authenticated).toBe(true);
    expect((await call()).authenticated).toBe(true);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } });
    expect(row.rateWindowCount).toBe(2);
    expect(row.rateWindowStartedAt).not.toBeNull();
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('the request over the limit is 429 with Retry-After, and nothing past it passes', async () => {
    await setWindow(API_KEY_RATE_LIMIT_PER_MINUTE - 1, new Date(Date.now() - 30_000));
    expect((await call()).authenticated).toBe(true); // the 1000th
    const over = await call(); // the 1001st
    expect(over.authenticated).toBe(false);
    if (over.authenticated) return;
    expect(over.errorResponse.status).toBe(429);
    const retryAfter = Number(over.errorResponse.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(29);
    expect(retryAfter).toBeLessThanOrEqual(31);
  });

  it('a window a minute old starts over', async () => {
    await setWindow(API_KEY_RATE_LIMIT_PER_MINUTE + 50, new Date(Date.now() - 61_000));
    expect((await call()).authenticated).toBe(true);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } });
    expect(row.rateWindowCount).toBe(1);
  });

  it('concurrent requests serialise: exactly the remaining budget passes', async () => {
    await setWindow(API_KEY_RATE_LIMIT_PER_MINUTE - 5, new Date());
    const results = await Promise.all(Array.from({ length: 20 }, () => call()));
    expect(results.filter((r) => r.authenticated)).toHaveLength(5);
    const statuses = results.filter((r) => !r.authenticated).map((r) => (r.authenticated ? 0 : r.errorResponse.status));
    expect(new Set(statuses)).toEqual(new Set([429]));
  });
});
