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
import { PIC_LOOKUPS_PER_HOUR } from '@/lib/pic';
import { TenantPicChangedError, removeTenantPic } from '@/lib/tenant-pic-removal';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('updateTenantProfile action', () => {
  let tenantId: string;
  let userId: string;

  beforeEach(async () => {
    tenantId = requireId(`tenant-${suffix()}`, 'tenantId');
    userId = requireId(`user-${suffix()}`, 'userId');

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
      return id;
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

    // ── FO-386: the refusal answers yes or no, so it is counted and leaves a trace ──
    describe('lookup limit and refusal record', () => {
      const refusals = () =>
        prisma.auditEvent.findMany({
          where: { tenantId, type: 'tenant.pic.refused' },
          orderBy: { createdAt: 'asc' },
          select: { actorId: true, data: true },
        });
      /** Spends the whole allowance on PICs nobody holds and CORDIS does not know. */
      const spendAllowance = async () => {
        for (let i = 0; i < PIC_LOOKUPS_PER_HOUR; i++) {
          const pic = newPic();
          expect(await updateTenantProfile({ ...base, pic })).toMatchObject({ ok: true, pic: { status: 'unmatched', value: pic } });
        }
      };

      it('writes who and which PIC on a refusal, and nothing about the holder', async () => {
        owner();
        const pic = await cordisOrg('Real Org');
        const holder = await otherTenantHolding(pic);
        await updateTenantProfile({ ...base, pic });
        expect(await refusals()).toEqual([{ actorId: userId, data: { pic, reason: 'picTaken' } }]);
        expect(JSON.stringify(await refusals())).not.toContain(holder);
        // The record is on the asker's tenant: the holder's own log learns nothing either.
        expect(await prisma.auditEvent.count({ where: { tenantId: holder } })).toBe(0);
      });

      it('counts every kind of answer, not only the refusal: the next one is refused unasked', async () => {
        owner();
        const asked = await cordisOrg('Listed Org');
        expect(await updateTenantProfile({ ...base, pic: asked })).toMatchObject({ error: 'picConfirmationRequired' });
        for (let i = 1; i < PIC_LOOKUPS_PER_HOUR; i++) {
          await updateTenantProfile({ ...base, pic: newPic() });
        }

        // A PIC someone holds, one nobody holds and one CORDIS lists: one answer, so no oracle left.
        const held = await cordisOrg('Held Org');
        await otherTenantHolding(held);
        const answers = [
          await updateTenantProfile({ ...base, pic: held }),
          await updateTenantProfile({ ...base, pic: newPic() }),
          await updateTenantProfile({ ...base, pic: asked, confirmedPic: asked }),
        ];
        for (const answer of answers) {
          expect(answer).toEqual({ ok: false, error: 'picRateLimited', retryAfterSeconds: expect.any(Number) });
          expect((answer as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
          expect((answer as { retryAfterSeconds: number }).retryAfterSeconds).toBeLessThanOrEqual(3600);
        }
        expect(await prisma.tenant.count({ where: { id: tenantId, pic: asked } })).toBe(0);
      });

      it('saves nothing on the limit, and records it once however long the loop runs', async () => {
        owner();
        await spendAllowance();
        const before = await storedPic();
        const capabilities = 'Must not be saved';
        for (let i = 0; i < 5; i++) {
          await updateTenantProfile({ ...base, capabilities, pic: newPic() });
        }
        expect(await storedPic()).toBe(before);
        const profile = await prisma.tenantProfile.findUnique({ where: { tenantId } });
        expect(profile?.capabilities).not.toBe(capabilities);
        const rows = await refusals();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ actorId: userId, data: { pic: expect.any(String), reason: 'rateLimited' } });
      });

      it('holds each user to their own count', async () => {
        owner();
        await spendAllowance();
        expect(await updateTenantProfile({ ...base, pic: newPic() })).toMatchObject({ error: 'picRateLimited' });
        tenantScope.current = { tenantId, userId: `${userId}-colleague`, role: 'TENANT_OWNER' };
        expect(await updateTenantProfile({ ...base, pic: newPic() })).toMatchObject({ ok: true });
      });

      it('leaves alone a save that asks nothing: keywords only, the same PIC, or clearing it', async () => {
        owner();
        await spendAllowance();
        const stored = await storedPic();
        expect(await updateTenantProfile({ ...base, keywords: 'kept' })).toEqual({ ok: true });
        expect(await updateTenantProfile({ ...base, pic: stored ?? '' })).toEqual({ ok: true });
        expect(await updateTenantProfile({ ...base, pic: '' })).toEqual({ ok: true, pic: { status: 'cleared' } });
      });

      it('does not spend the allowance of a member, who gets no answer at all', async () => {
        tenantScope.current = { tenantId, userId, role: 'MEMBER' };
        for (let i = 0; i <= PIC_LOOKUPS_PER_HOUR; i++) {
          expect(await updateTenantProfile({ ...base, pic: newPic() })).toEqual({ ok: false, error: 'forbidden' });
        }
        expect(await refusals()).toHaveLength(0);
        owner();
        expect(await updateTenantProfile({ ...base, pic: newPic() })).toMatchObject({ ok: true });
      });
    });

    // ── K-576942: the real owner's way back ───────────────────────────────────
    describe('removeTenantPic', () => {
      const removedAudits = () =>
        prisma.auditEvent.findMany({ where: { tenantId, type: 'tenant.pic.removed' } });

      it('clears the PIC, writes who, whose and what, and only that', async () => {
        const pic = newPic();
        await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
        await removeTenantPic(tenantId, pic, userId, 'owner disputed');
        expect(await storedPic()).toBeNull();
        const audits = await removedAudits();
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ tenantId, actorId: userId, data: { from: pic, note: 'owner disputed' } });
      });

      it('refuses a PIC the tenant no longer holds: the newer value stays and no audit row is written', async () => {
        const seen = newPic();
        const saved = newPic();
        await prisma.tenant.update({ where: { id: tenantId }, data: { pic: saved } });
        await expect(removeTenantPic(tenantId, seen, userId, 'stale')).rejects.toBeInstanceOf(TenantPicChangedError);
        expect(await storedPic()).toBe(saved);
        expect(await removedAudits()).toHaveLength(0);
      });

      it('touches no other tenant holding the same value', async () => {
        const pic = newPic();
        await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
        const other = await otherTenantHolding(pic);
        await removeTenantPic(tenantId, pic, userId, 'owner disputed');
        expect((await prisma.tenant.findUnique({ where: { id: other }, select: { pic: true } }))?.pic).toBe(pic);
      });

      it('frees the PIC for the real owner', async () => {
        owner();
        const pic = newPic();
        const holder = await otherTenantHolding(pic);
        expect(await updateTenantProfile({ ...base, pic })).toEqual({ ok: false, error: 'picTaken' });
        await removeTenantPic(holder, pic, userId, 'owner disputed');
        expect(await updateTenantProfile({ ...base, pic })).toEqual({ ok: true, pic: { status: 'unmatched', value: pic } });
        expect(await storedPic()).toBe(pic);
        await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(holder, 'holder') } });
      });
    });

    it('lets one tenant win however many claim a PIC at the same moment, round after round', async () => {
      // No unique index stands behind the check, so the advisory lock is the only thing here that
      // can fail this test. One pair, once, stayed green without the lock when the whole file ran:
      // the race is timing, so it gets more claimants and more chances.
      const CLAIMANTS = 8;
      const ROUNDS = 10;
      owner();
      const claimants = [tenantId];
      for (let i = 1; i < CLAIMANTS; i++) {
        const id = `rival-${suffix()}`;
        await prisma.tenant.create({ data: { id, name: 'Rival', slug: `rival-${suffix()}`, country: 'TR', orgType: 'SME' } });
        otherTenants.push(id);
        claimants.push(id);
      }

      // `requireTenantAction` is mocked; each call answers for one tenant, in call order.
      const { requireTenantAction } = await import('@/lib/tenant');
      try {
        for (let round = 1; round <= ROUNDS; round++) {
          const pic = newPic();
          for (const id of claimants) {
            // One user per tenant, as in life: one user claiming 80 times would meet the FO-386 limit.
            vi.mocked(requireTenantAction).mockResolvedValueOnce({ tenantId: id, userId: `${userId}-${id}`, role: 'TENANT_OWNER' } as never);
          }
          const results = await Promise.all(claimants.map(() => updateTenantProfile({ ...base, pic })));
          expect({ round, holders: await prisma.tenant.count({ where: { pic } }) }).toEqual({ round, holders: 1 });
          expect(results.filter((r) => r.ok)).toHaveLength(1);
          expect(results.filter((r) => !r.ok && r.error === 'picTaken')).toHaveLength(CLAIMANTS - 1);
        }
      } finally {
        for (const id of claimants.slice(1)) {
          await prisma.tenantProfile.deleteMany({ where: { tenantId: requireId(id, 'claimant') } });
          await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(id, 'claimant') } });
        }
      }
    }, 60_000);

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
