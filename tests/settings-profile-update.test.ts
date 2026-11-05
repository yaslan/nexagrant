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
import {
  PIC_LOOKUPS_PER_HOUR,
  PIC_LOOKUPS_PER_HOUR_UNSOLICITED,
  PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY,
  PIC_UNSOLICITED_LOOKUPS_PER_DAY,
} from '@/lib/pic';
import { budgetDay } from '@/lib/pic-budget';
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

    /** FO-389: a pilot. The FO-383/386 tests below are about a tenant with something behind it. */
    const pilot = { planId: 'public-team', status: 'ACTIVE' as const, provider: 'pilot' };
    beforeEach(async () => {
      await prisma.subscription.create({ data: { tenantId: requireId(tenantId, 'tenantId'), ...pilot } });
    });

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

    // ── FO-389: accounts anyone can open ──────────────────────────────────────
    describe('unsolicited accounts: lower limit and one shared daily budget', () => {
      const budgetRow = (day = budgetDay(new Date())) => prisma.picLookupBudget.findUnique({ where: { day } });
      const setBudget = (count: number) =>
        prisma.picLookupBudget.upsert({
          where: { day: budgetDay(new Date()) },
          create: { day: budgetDay(new Date()), count },
          update: { count },
        });
      /** A tenant of its own with one owner, and no invitation, pilot or plan unless `standing` gives one. */
      const account = async (standing: Record<string, unknown> = {}) => {
        const id = `acct-${suffix()}`;
        await prisma.tenant.create({
          data: { id, name: 'Account', slug: `acct-${suffix()}`, country: 'TR', orgType: 'SME', ...standing },
        });
        otherTenants.push(id);
        return { tenantId: id, userId: `u-${id}`, role: 'TENANT_OWNER' };
      };
      const as = (scope: Record<string, unknown>) => {
        tenantScope.current = scope;
      };
      const ask = (pic: string, extra: Partial<UpdateProfileInput> = {}) => updateTenantProfile({ ...base, pic, ...extra });
      const limited = { ok: false, error: 'picRateLimited', retryAfterSeconds: expect.any(Number) };

      beforeEach(async () => {
        await prisma.picLookupBudget.deleteMany({ where: { day: budgetDay(new Date()) } });
      });
      afterEach(async () => {
        await prisma.picLookupBudget.deleteMany({ where: { day: budgetDay(new Date()) } });
        await prisma.lifetimeLicence.deleteMany({ where: { tenantId: { in: otherTenants } } });
      });

      it('holds an account nobody vouched for to the lower hourly limit', async () => {
        as(await account());
        for (let i = 0; i < PIC_LOOKUPS_PER_HOUR_UNSOLICITED; i++) {
          expect(await ask(newPic())).toMatchObject({ ok: true });
        }
        expect(await ask(newPic())).toEqual(limited);
        expect(PIC_LOOKUPS_PER_HOUR_UNSOLICITED).toBeLessThan(PIC_LOOKUPS_PER_HOUR);
      });

      it('leaves the full hourly limit to the same user once a pilot stands behind the tenant', async () => {
        owner(); // the describe's tenant has a pilot
        for (let i = 0; i < PIC_LOOKUPS_PER_HOUR_UNSOLICITED + 1; i++) {
          expect(await ask(newPic())).toMatchObject({ ok: true });
        }
      });

      it.each([
        ['an agency invitation', async () => ({ agencyId: (await account({ kind: 'AGENCY' })).tenantId })],
        ['a pilot', async () => ({ subscription: { create: pilot } })],
        ['an active plan', async () => ({ subscription: { create: { planId: 'pro', status: 'ACTIVE', provider: 'stripe' } } })],
        ['a trial', async () => ({ subscription: { create: { planId: 'pro', status: 'TRIALING', provider: 'stripe' } } })],
        ['a plan past due', async () => ({ subscription: { create: { planId: 'pro', status: 'PAST_DUE', provider: 'stripe' } } })],
      ])('does not hold a tenant with %s to the lower limit, and does not spend the budget', async (_label, standing) => {
        as(await account(await standing()));
        for (let i = 0; i < PIC_LOOKUPS_PER_HOUR_UNSOLICITED + 2; i++) {
          expect(await ask(newPic())).toMatchObject({ ok: true });
        }
        expect(await budgetRow()).toBeNull();
      });

      it('does not hold a lifetime licence holder to the lower limit', async () => {
        const scope = await account();
        await prisma.lifetimeLicence.create({
          data: {
            tenantId: scope.tenantId,
            seq: 900_000 + Math.floor(Math.random() * 90_000),
            amountMinor: 1,
            providerEventId: `evt-${suffix()}`,
          },
        });
        as(scope);
        for (let i = 0; i < PIC_LOOKUPS_PER_HOUR_UNSOLICITED + 2; i++) {
          expect(await ask(newPic())).toMatchObject({ ok: true });
        }
      });

      it('holds a cancelled or paused subscription to the lower limit: nothing live stands behind it', async () => {
        for (const status of ['CANCELED', 'PAUSED'] as const) {
          as(await account({ subscription: { create: { planId: 'pro', status, provider: 'stripe' } } }));
          for (let i = 0; i < PIC_LOOKUPS_PER_HOUR_UNSOLICITED; i++) await ask(newPic());
          expect(await ask(newPic())).toEqual(limited);
        }
      });

      it('spends one from the shared budget per unsolicited question, from any account', async () => {
        for (let n = 1; n <= 3; n++) {
          as(await account());
          await ask(newPic());
          expect((await budgetRow())?.count).toBe(n);
        }
      });

      it('answers every unsolicited account the same once the day is spent, whatever PIC is asked', async () => {
        const listed = await cordisOrg('Listed Org');
        const held = await cordisOrg('Held Org');
        await otherTenantHolding(held);
        await setBudget(PIC_UNSOLICITED_LOOKUPS_PER_DAY);

        const answers = [];
        for (const pic of [listed, held, newPic()]) {
          as(await account()); // a different account each time: the per-user limit never fires
          answers.push(await ask(pic));
          answers.push(await ask(pic, { confirmedPic: pic }));
        }
        for (const answer of answers) expect(answer).toEqual(limited);
        const seconds = answers.map((a) => (a as { retryAfterSeconds: number }).retryAfterSeconds);
        expect(Math.max(...seconds)).toBeLessThanOrEqual(86_400);
        expect(Math.min(...seconds)).toBeGreaterThan(0);
        // No tenant row moved, and the count stayed at the ceiling: a refusal does not spend.
        expect(await prisma.tenant.count({ where: { pic: { in: [listed] } } })).toBe(0);
        expect((await budgetRow())?.count).toBe(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
      });

      it('lets the last question of the day through, and refuses the one after it', async () => {
        await setBudget(PIC_UNSOLICITED_LOOKUPS_PER_DAY - 1);
        as(await account());
        expect(await ask(newPic())).toMatchObject({ ok: true });
        as(await account());
        expect(await ask(newPic())).toEqual(limited);
        expect((await budgetRow())?.count).toBe(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
      });

      it('leaves invited, pilot and paying tenants untouched when the day is spent', async () => {
        await setBudget(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
        const agency = await account({ kind: 'AGENCY' });
        for (const standing of [{ agencyId: agency.tenantId }, { subscription: { create: pilot } }]) {
          as(await account(standing));
          const pic = newPic();
          expect(await ask(pic)).toEqual({ ok: true, pic: { status: 'unmatched', value: pic } });
        }
        // The same answer a customer always got: a listed PIC still asks to be confirmed, a held one is still refused.
        const listed = await cordisOrg('Listed Org');
        as(await account({ subscription: { create: pilot } }));
        expect(await ask(listed)).toMatchObject({ error: 'picConfirmationRequired' });
        const held = await cordisOrg('Held Org');
        await otherTenantHolding(held);
        expect(await ask(held)).toEqual({ ok: false, error: 'picTaken' });
        expect((await budgetRow())?.count).toBe(PIC_UNSOLICITED_LOOKUPS_PER_DAY);
      });

      it('counts a question that ends in a confirmation prompt: asking is what is counted, not saving', async () => {
        const scope = await account();
        as(scope);
        const pic = await cordisOrg('Listed Org');
        // Unconfirmed: the form gets the confirmation prompt and nothing is written, yet the ask counted.
        expect(await ask(pic)).toMatchObject({ error: 'picConfirmationRequired' });
        expect((await budgetRow())?.count).toBe(1);
      });

      it('keeps the count across a restart: a fresh module graph reads the same row', async () => {
        as(await account());
        await ask(newPic());
        expect((await budgetRow())?.count).toBe(1);
        vi.resetModules();
        const fresh = await import('@/app/[locale]/(app)/[workspace]/settings/profile/actions');
        as(await account()); // the new process knows no per-user counts at all
        expect(await fresh.updateTenantProfile({ ...base, pic: newPic() })).toMatchObject({ ok: true });
        expect((await budgetRow())?.count).toBe(2);
      });

      describe('the day does not reset on a request, only at UTC midnight', () => {
        const days: string[] = [];
        afterEach(async () => {
          await prisma.picLookupBudget.deleteMany({ where: { day: { in: days.splice(0) } } });
        });

        it('counts per UTC day and tells how long until the next', async () => {
          const { spendUnsolicitedPicLookup } = await import('@/lib/pic-budget');
          const d1 = new Date('2099-03-04T23:59:30.500Z');
          const d2 = new Date('2099-03-05T00:00:00.000Z');
          days.push('2099-03-04', '2099-03-05');
          expect(await spendUnsolicitedPicLookup(d1, 2)).toBeNull();
          expect(await spendUnsolicitedPicLookup(d1, 2)).toBeNull();
          expect(await spendUnsolicitedPicLookup(d1, 2)).toBe(30); // 29.5 s, rounded up
          // a request at the start of the same day sees the same spent day, a whole day from renewal
          expect(await spendUnsolicitedPicLookup(new Date('2099-03-04T00:00:00.000Z'), 2)).toBe(86_400);
          expect(await spendUnsolicitedPicLookup(d2, 2)).toBeNull(); // a new day, a new count
          expect((await budgetRow('2099-03-04'))?.count).toBe(2);
          expect((await budgetRow('2099-03-05'))?.count).toBe(1);
        });

        it('never lets more through than the ceiling when many ask at once, across separate connections', async () => {
          const { spendUnsolicitedPicLookup } = await import('@/lib/pic-budget');
          const at = new Date('2099-06-07T12:00:00.000Z');
          days.push('2099-06-07');
          const ceiling = 10;
          const results = await Promise.all(Array.from({ length: 60 }, () => spendUnsolicitedPicLookup(at, ceiling)));
          expect(results.filter((r) => r === null)).toHaveLength(ceiling);
          expect((await budgetRow('2099-06-07'))?.count).toBe(ceiling);
        });

        it('spends nothing against a ceiling of nothing', async () => {
          const { spendUnsolicitedPicLookup } = await import('@/lib/pic-budget');
          days.push('2099-07-08');
          expect(await spendUnsolicitedPicLookup(new Date('2099-07-08T00:00:00.000Z'), 0)).toBe(86_400);
          expect(await budgetRow('2099-07-08')).toBeNull();
        });
      });

      it('caps the picTaken rows one tenant adds in a day, and still refuses every ask', async () => {
        const held = await cordisOrg('Held Org');
        await otherTenantHolding(held);
        const scope = await account({ subscription: { create: pilot } });
        const asks = PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY + 5;
        for (let i = 0; i < asks; i++) {
          as({ ...scope, userId: `${scope.userId}-${i}` }); // a user each: the per-user limit never fires
          expect(await ask(held)).toEqual({ ok: false, error: 'picTaken' });
        }
        expect(await prisma.auditEvent.count({ where: { tenantId: scope.tenantId, type: 'tenant.pic.refused' } })).toBe(
          PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY
        );
      });

      it('keeps the cap per reason: a day of taken PICs still leaves the row that says the limit was hit', async () => {
        const held = await cordisOrg('Held Org');
        await otherTenantHolding(held);
        const scope = await account({ subscription: { create: pilot } });
        await prisma.auditEvent.createMany({
          data: Array.from({ length: PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY }, () => ({
            tenantId: scope.tenantId,
            type: 'tenant.pic.refused',
            data: { pic: held, reason: 'picTaken' },
          })),
        });
        as(scope);
        for (let i = 0; i < PIC_LOOKUPS_PER_HOUR; i++) await ask(held);
        expect(await ask(held)).toEqual(limited);
        const rows = await prisma.auditEvent.findMany({ where: { tenantId: scope.tenantId, type: 'tenant.pic.refused' } });
        expect(rows.filter((r) => (r.data as { reason?: string }).reason === 'picTaken')).toHaveLength(
          PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY
        );
        expect(rows.filter((r) => (r.data as { reason?: string }).reason === 'rateLimited')).toHaveLength(1);
      });

      it('counts only today toward the refusal cap', async () => {
        const held = await cordisOrg('Held Org');
        await otherTenantHolding(held);
        const scope = await account({ subscription: { create: pilot } });
        const yesterday = new Date(Date.now() - 36 * 3_600_000);
        await prisma.auditEvent.createMany({
          data: Array.from({ length: PIC_REFUSAL_ROWS_PER_TENANT_PER_DAY + 5 }, () => ({
            tenantId: scope.tenantId,
            type: 'tenant.pic.refused',
            data: { pic: held, reason: 'picTaken' },
            createdAt: yesterday,
          })),
        });
        as(scope);
        expect(await ask(held)).toEqual({ ok: false, error: 'picTaken' });
        expect(
          await prisma.auditEvent.count({ where: { tenantId: scope.tenantId, type: 'tenant.pic.refused', createdAt: { gt: yesterday } } })
        ).toBe(1);
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
        await prisma.tenant.create({
          data: { id, name: 'Rival', slug: `rival-${suffix()}`, country: 'TR', orgType: 'SME', subscription: { create: pilot } },
        });
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
