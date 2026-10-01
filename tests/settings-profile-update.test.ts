/**
 * TASK-MUPUHIIKSQAPN — Tenant profile (capabilities, keywords, TRL range) update action
 * tests form validation, authorization, persistence, and error handling.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const tenantScope = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn(async () => tenantScope.current),
}));

import { prisma, withTenant } from '@/lib/db';
import { updateTenantProfile, type UpdateProfileInput } from '@/app/[locale]/(app)/[workspace]/settings/profile/actions';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('updateTenantProfile action', () => {
  let tenantId: string;
  let userId: string;

  beforeEach(async () => {
    tenantId = requireId('tenant', suffix());
    userId = requireId('user', suffix());

    // Create test tenant and user
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Test Tenant',
        slug: `test-${suffix()}`,
        country: 'TR',
        orgType: 'SME',
      },
    });

    await prisma.user.create({
      data: {
        id: userId,
        email: `user-${suffix()}@test.local`,
        name: 'Test User',
      },
    });

    await prisma.membership.create({
      data: {
        tenantId,
        userId,
        role: 'TENANT_OWNER',
      },
    });
  });

  afterEach(async () => {
    await prisma.membership.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.delete({ where: { id: requireId(tenantId, 'tenantId') } });
    await prisma.user.delete({ where: { id: requireId(userId, 'userId') } });
  });

  it('creates a new profile with valid input', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    const input: UpdateProfileInput = {
      capabilities: 'AI and machine learning expertise, TRL 5-8',
      keywords: 'AI, ML, Robotics',
      trlMin: 5,
      trlMax: 8,
    };

    const result = await updateTenantProfile(input);

    expect(result).toEqual({ ok: true });

    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId },
    });

    expect(profile).toBeDefined();
    expect(profile?.capabilities).toBe(input.capabilities);
    expect(profile?.keywords).toEqual(['AI', 'ML', 'Robotics']);
    expect(profile?.trlRange).toEqual([5, 8]);
  });

  it('updates an existing profile', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    // Create initial profile
    await prisma.tenantProfile.create({
      data: {
        tenantId,
        capabilities: 'Old capabilities',
        keywords: ['Old', 'Keywords'],
        naceCodes: [],
        preferredRoles: [],
        trlRange: [3, 6],
      },
    });

    const input: UpdateProfileInput = {
      capabilities: 'New capabilities with AI',
      keywords: 'AI, Deep Learning, Robotics',
      trlMin: 4,
      trlMax: 8,
    };

    const result = await updateTenantProfile(input);

    expect(result).toEqual({ ok: true });

    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId },
    });

    expect(profile?.capabilities).toBe(input.capabilities);
    expect(profile?.keywords).toEqual(['AI', 'Deep Learning', 'Robotics']);
    expect(profile?.trlRange).toEqual([4, 8]);
  });

  it('rejects empty capabilities', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    const input: UpdateProfileInput = {
      capabilities: '   ',
      keywords: 'AI, ML',
      trlMin: 3,
      trlMax: 8,
    };

    const result = await updateTenantProfile(input);

    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects empty keywords', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    const input: UpdateProfileInput = {
      capabilities: 'Some capabilities',
      keywords: '   ,  , ',
      trlMin: 3,
      trlMax: 8,
    };

    const result = await updateTenantProfile(input);

    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects invalid TRL range', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    // Min > Max
    let input: UpdateProfileInput = {
      capabilities: 'Capabilities',
      keywords: 'AI',
      trlMin: 8,
      trlMax: 3,
    };

    let result = await updateTenantProfile(input);
    expect(result).toEqual({ ok: false, error: 'invalid' });

    // Out of range
    input = {
      capabilities: 'Capabilities',
      keywords: 'AI',
      trlMin: 0,
      trlMax: 8,
    };

    result = await updateTenantProfile(input);
    expect(result).toEqual({ ok: false, error: 'invalid' });

    input = {
      capabilities: 'Capabilities',
      keywords: 'AI',
      trlMin: 1,
      trlMax: 10,
    };

    result = await updateTenantProfile(input);
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('forbids non-owner users', async () => {
    session.current = { tenantId, userId, role: 'MEMBER' };
    tenantScope.current = { tenantId, userId, role: 'MEMBER' };

    const input: UpdateProfileInput = {
      capabilities: 'Capabilities',
      keywords: 'AI',
      trlMin: 3,
      trlMax: 8,
    };

    const result = await updateTenantProfile(input);

    expect(result).toEqual({ ok: false, error: 'forbidden' });

    // Profile should not exist
    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId },
    });

    expect(profile).toBeNull();
  });

  it('creates audit event on successful update', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    const input: UpdateProfileInput = {
      capabilities: 'Capabilities',
      keywords: 'AI, ML',
      trlMin: 5,
      trlMax: 7,
    };

    await updateTenantProfile(input);

    const events = await prisma.auditEvent.findMany({
      where: {
        tenantId,
        type: 'tenant.profile.updated',
      },
    });

    expect(events.length).toBe(1);
    expect(events[0]?.actorId).toBe(userId);
    expect(events[0]?.data).toMatchObject({
      capabilities: input.capabilities,
      keywords: ['AI', 'ML'],
      trlRange: [5, 7],
    });
  });

  it('trims whitespace from keywords', async () => {
    session.current = { tenantId, userId, role: 'TENANT_OWNER' };
    tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };

    const input: UpdateProfileInput = {
      capabilities: 'Capabilities',
      keywords: '  AI  ,  ML  ,  Robotics  ',
      trlMin: 3,
      trlMax: 8,
    };

    await updateTenantProfile(input);

    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId },
    });

    expect(profile?.keywords).toEqual(['AI', 'ML', 'Robotics']);
  });
});
