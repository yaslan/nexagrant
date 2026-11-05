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
  // ── FO-383: PIC ────────────────────────────────────────────────────────────
  describe('PIC', () => {
    const base: UpdateProfileInput = { capabilities: 'Caps', keywords: 'AI', trlMin: 3, trlMax: 6 };
    const owner = () => {
      session.current = { tenantId, userId, role: 'TENANT_OWNER' };
      tenantScope.current = { tenantId, userId, role: 'TENANT_OWNER' };
    };
    const storedPic = async () =>
      (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } }))?.pic ?? null;
    const picAudits = () =>
      prisma.auditEvent.findMany({ where: { tenantId, type: 'tenant.pic.updated' }, orderBy: { createdAt: 'asc' } });

    // Distinct per test: PICs are global across tenants and CordisOrganization has no tenant.
    const newPic = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999));
    const orgIds: string[] = [];
    const otherTenants: string[] = [];

    afterEach(async () => {
      for (const organisationId of orgIds.splice(0)) await prisma.cordisOrganization.delete({ where: { organisationId } });
      for (const id of otherTenants.splice(0)) await prisma.tenant.delete({ where: { id: requireId(id, 'otherTenant') } });
    });

    const cordisOrg = async (name: string) => {
      const pic = newPic();
      await prisma.cordisOrganization.create({ data: { organisationId: pic, name, city: 'Ankara', country: 'TR' } });
      orgIds.push(pic);
      return pic;
    };
    const otherTenantHolding = async (pic: string, deletedAt: Date | null = null) => {
      const id = `other-${suffix()}`;
      await prisma.tenant.create({ data: { id, name: 'Other', slug: `other-${suffix()}`, country: 'TR', orgType: 'SME', pic, deletedAt } });
      otherTenants.push(id);
    };

    it('leaves the stored PIC alone when the field is absent', async () => {
      owner();
      const pic = newPic();
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      expect(await updateTenantProfile(base)).toEqual({ ok: true });
      expect(await storedPic()).toBe(pic);
    });

    it.each(['12345678', '1234567890', '12345678a', '٠١٢٣٤٥٦٧٨', "1' OR '1'='1"])('refuses the malformed PIC %s and saves nothing', async (bad) => {
      owner();
      expect(await updateTenantProfile({ ...base, pic: bad })).toEqual({ ok: false, error: 'picInvalid' });
      expect(await storedPic()).toBeNull();
      expect(await prisma.tenantProfile.findUnique({ where: { tenantId } })).toBeNull();
    });

    it('stores the bare digits of a pasted PIC', async () => {
      owner();
      const pic = newPic();
      const pasted = ` ${pic.slice(0, 3)} ${pic.slice(3, 6)}-${pic.slice(6)} `;
      expect(await updateTenantProfile({ ...base, pic: pasted })).toEqual({
        ok: true,
        pic: { status: 'unmatched', value: pic },
      });
      expect(await storedPic()).toBe(pic);
    });

    it('asks for confirmation of a CORDIS match, and writes nothing until it gets one', async () => {
      owner();
      const pic = await cordisOrg('Real Org');
      const match = { name: 'Real Org', city: 'Ankara', country: 'TR' };

      expect(await updateTenantProfile({ ...base, pic })).toEqual({ ok: false, error: 'picConfirmationRequired', match });
      expect(await storedPic()).toBeNull();
      expect(await prisma.tenantProfile.findUnique({ where: { tenantId } })).toBeNull();

      // A confirmation of some other code does not count: the server compares, not the form.
      expect(await updateTenantProfile({ ...base, pic, confirmedPic: newPic() })).toEqual({
        ok: false,
        error: 'picConfirmationRequired',
        match,
      });
      expect(await storedPic()).toBeNull();

      expect(await updateTenantProfile({ ...base, pic, confirmedPic: pic })).toEqual({
        ok: true,
        pic: { status: 'matched', value: pic, match },
      });
      expect(await storedPic()).toBe(pic);
      const audits = await picAudits();
      expect(audits).toHaveLength(1);
      expect(audits[0]?.actorId).toBe(userId);
      expect(audits[0]?.data).toEqual({ from: null, to: pic, cordisName: 'Real Org' });
    });

    it('clears the PIC with an empty value and records it', async () => {
      owner();
      const pic = newPic();
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      expect(await updateTenantProfile({ ...base, pic: '  ' })).toEqual({ ok: true, pic: { status: 'cleared' } });
      expect(await storedPic()).toBeNull();
      expect((await picAudits())[0]?.data).toEqual({ from: pic, to: null, cordisName: null });
    });

    it('does not ask again or audit when the PIC did not change', async () => {
      owner();
      const pic = await cordisOrg('Real Org');
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      expect(await updateTenantProfile({ ...base, pic })).toEqual({ ok: true });
      expect(await picAudits()).toHaveLength(0);
    });

    it('refuses a PIC another live tenant holds, confirmed or not, without naming that tenant', async () => {
      owner();
      const pic = await cordisOrg('Real Org');
      await otherTenantHolding(pic);
      const result = await updateTenantProfile({ ...base, pic, confirmedPic: pic });
      expect(result).toEqual({ ok: false, error: 'picTaken' });
      expect(await storedPic()).toBeNull();
      expect(await picAudits()).toHaveLength(0);
    });

    it('lets one of two tenants win when both claim a PIC at the same moment', async () => {
      owner();
      const pic = newPic();
      const secondId = `second-${suffix()}`;
      await prisma.tenant.create({ data: { id: secondId, name: 'Second', slug: `second-${suffix()}`, country: 'TR', orgType: 'SME' } });
      otherTenants.push(secondId);

      // `requireTenantAction` is mocked; each call answers for one tenant, in call order.
      const { requireTenantAction } = await import('@/lib/tenant');
      vi.mocked(requireTenantAction)
        .mockResolvedValueOnce({ tenantId, userId, role: 'TENANT_OWNER' } as never)
        .mockResolvedValueOnce({ tenantId: secondId, userId, role: 'TENANT_OWNER' } as never);

      const results = await Promise.all([updateTenantProfile({ ...base, pic }), updateTenantProfile({ ...base, pic })]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.error === 'picTaken')).toHaveLength(1);
      expect(await prisma.tenant.count({ where: { pic } })).toBe(1);
      await prisma.tenantProfile.deleteMany({ where: { tenantId: requireId(secondId, 'secondId') } });
      await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(secondId, 'secondId') } });
    });

    it('does not let a soft-deleted tenant block its PIC', async () => {
      owner();
      const pic = newPic();
      await otherTenantHolding(pic, new Date());
      expect(await updateTenantProfile({ ...base, pic })).toEqual({ ok: true, pic: { status: 'unmatched', value: pic } });
    });

    it.each(['PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'])('refuses %s, and tells it nothing about the PIC', async (role) => {
      session.current = { tenantId, userId, role };
      tenantScope.current = { tenantId, userId, role };
      const pic = await cordisOrg('Real Org');
      expect(await updateTenantProfile({ ...base, pic, confirmedPic: pic })).toEqual({ ok: false, error: 'forbidden' });
      expect(await storedPic()).toBeNull();
    });
  });
});
