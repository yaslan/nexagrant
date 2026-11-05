import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { INVITE_CODE_MAX_USE_LIMIT, INVITE_CODE_MIN_USE_LIMIT } from '@/lib/agency/invite-policy';
import {
  createInviteCodeIn,
  listInviteCodesIn,
  noteInviteRejection,
  redeemInviteCode,
  revokeInviteCodeIn,
} from '@/lib/agency/codes';
import { envValue } from './helpers/dotenv';
import { requireId } from './helpers/teardown-guard';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { AGENCY_INVITE_CODE_DDL_LOCK, UNKNOWN_INVITE_COUNTER_LOCK, withTestDbLock } from './helpers/test-db-lock';

/**
 * TASK-MULRQJQYM0NAM (FB KAMU B1) — agency invite codes, measured on the role
 * the policies are for: `fabrika_app` (NOBYPASSRLS, asserted below). Locally
 * the app itself connects as `fabrika` (SUPERUSER), where RLS is inert and every
 * isolation claim here would pass by construction.
 *
 * Every arm that goes through the code under test runs over `rls`. `admin`
 * (fabrika) only builds fixtures and reads the ground truth.
 *
 * `.live`: needs the docker-compose Postgres with add-agency-invite-code.sql and
 * `pnpm db:rls` applied (`scripts/apply-migrations.sh` applies the former).
 * Locally a missing database or migration marks every test here as skipped;
 * in CI either one fails the file, and a BYPASSRLS role fails everywhere
 * (tests/helpers/live-db-role.ts). TASK-MULU7SAA4EPP8: the missing-migration
 * branch used to return early from each test, which vitest counts as passed.
 */

const SUITE = 'agency-invite.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `b1-${Date.now().toString(36)}`;

let rls: PrismaClient | undefined;
/** A second NOBYPASSRLS client: the race needs two real connections. */
let rls2: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';

const ids = { agencyA: '', agencyB: '', org: '', orgWorkspace: '', staff: `${RUN}-staff` };
const tenants: string[] = [];
let seq = 0;

async function newTenant(kind: 'AGENCY' | 'ORGANIZATION', suffix: string): Promise<string> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${suffix}`, slug: `${RUN}-${suffix}`, country: 'TR', kind },
    select: { id: true },
  });
  tenants.push(t.id);
  return t.id;
}

/** A new code: it carries a real, hidden use limit of 500..524 (FO-392, K-577268, src/lib/agency/invite-policy.ts). */
async function makeCode(agency: string, days = 30): Promise<{ id: string; code: string }> {
  return withTenantOn(rls!, agency, (tx) =>
    createInviteCodeIn(tx, {
      tenantId: agency,
      createdBy: ids.staff,
      expiresAt: new Date(Date.now() + days * 86_400_000),
      label: RUN,
    })
  );
}

/**
 * A code made while codes had a limit, already used past it: the retired
 * column keeps its old value, and nothing may read it any more. Like every code
 * from before FO-392 it has no useLimit (NULL = unlimited).
 */
async function makeLegacyCodePastItsLimit(agency: string): Promise<{ id: string; code: string }> {
  const created = await makeCode(agency);
  await admin!.agencyInviteCode.update({
    where: { id: created.id },
    data: { maxUses: 6, usedCount: 9, useLimit: null },
  });
  return created;
}

/** A code with a small limit of its own, to measure the edge without 500 registrations. */
async function makeCodeWithLimit(agency: string, useLimit: number): Promise<{ id: string; code: string }> {
  const created = await makeCode(agency);
  await admin!.agencyInviteCode.update({ where: { id: created.id }, data: { useLimit } });
  return created;
}

/** Redeem as registration does: inside a transaction bound to a fresh tenant. */
async function redeemAsNewTenant(client: PrismaClient, code: string, holdMs = 0): Promise<string | null> {
  const t = await newTenant('ORGANIZATION', `reg-${++seq}`);
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t}, true)`;
      const agency = await redeemInviteCode(tx, code);
      if (holdMs) await tx.$executeRaw`SELECT pg_sleep(${holdMs / 1000})`;
      return agency;
    },
    { timeout: 15_000 }
  );
}

async function usedCount(id: string): Promise<number> {
  const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id }, select: { usedCount: true } });
  return row.usedCount;
}

beforeAll(async () => {
  // Before the try, so that in CI a missing variable fails instead of being caught.
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  rls = createDbClient(rlsUrl);
  rls2 = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  // Outside the try: a BYPASSRLS role must fail the file, not skip it.
  await assertRlsSubjectRole(rls, SUITE);
  let fnCount: number | undefined;
  try {
    const fn = await admin.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'redeem_agency_invite'`;
    fnCount = fn[0]?.n;
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  // Outside the try, so that in CI the throw reaches vitest under its own message.
  if (fnCount !== 1) {
    skipReason = 'add-agency-invite-code.sql is not applied (scripts/apply-migrations.sh)';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  try {
    ids.agencyA = await newTenant('AGENCY', 'agency-a');
    ids.agencyB = await newTenant('AGENCY', 'agency-b');
    ids.org = await newTenant('ORGANIZATION', 'org');
    // The linked organisation has content of its own, written in its own scope.
    const ws = await withTenantOn(admin, ids.org, (tx) =>
      tx.workspace.create({ data: { tenantId: ids.org, name: `${RUN} private`, slug: 'default' } })
    );
    ids.orgWorkspace = ws.id;
    ready = true;
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
  }
});

// A real skip: an early `return` inside the test would be reported as passed.
beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenants.length) {
    // Cascades to AgencyInviteCode, Workspace and the tenants' AuditEvent rows.
    // agencyId references are SET NULL, so deletion order does not matter.
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => {});
  }
  await Promise.all([rls, rls2, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('redeeming an agency invite code (fabrika_app)', () => {
  test('a valid code returns the agency, counts one use, and links the new tenant', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    const t = await newTenant('ORGANIZATION', 'linked');
    const agency = await rls!.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t}, true)`;
      const a = await redeemInviteCode(tx, code.toLowerCase().replace(/-/g, ' '));
      await tx.tenant.update({ where: { id: t }, data: { agencyId: a } });
      return a;
    });
    expect(agency).toBe(ids.agencyA);
    expect(await usedCount(id)).toBe(1);
    const row = await admin!.tenant.findUniqueOrThrow({ where: { id: t }, select: { agencyId: true } });
    expect(row.agencyId).toBe(ids.agencyA);
  });

  test('a use inside a transaction that rolls back is not counted', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    await expect(
      rls!.$transaction(async (tx) => {
        expect(await redeemInviteCode(tx, code)).toBe(ids.agencyA);
        throw new Error('registration failed after the code was used');
      })
    ).rejects.toThrow(/registration failed/);
    expect(await usedCount(id)).toBe(0);
    expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
  });

  // FO-392: a new code carries a hidden limit of 500..524; a code from before it (NULL) has none.
  test('a new code is written with a real limit in 500..524 and no retired maxUses; the audit trail does not carry the limit', async () => {
    const { id } = await makeCode(ids.agencyA);
    const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id }, select: { maxUses: true, useLimit: true } });
    expect(row.useLimit).toBeGreaterThanOrEqual(INVITE_CODE_MIN_USE_LIMIT);
    expect(row.useLimit).toBeLessThanOrEqual(INVITE_CODE_MAX_USE_LIMIT);
    expect(row.maxUses).toBeNull();
    const audit = await admin!.auditEvent.findFirstOrThrow({
      where: { tenantId: ids.agencyA, type: 'agency.invite.created', target: id },
      select: { data: true },
    });
    expect(audit.data).toMatchObject({ limited: true });
    expect(JSON.stringify(audit.data)).not.toMatch(/useLimit|5[0-2][0-9]\b/);
  });

  test('new codes get different limits (not one fixed number): 40 codes, more than 10 distinct values', async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const { id } = await makeCode(ids.agencyA);
      const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id }, select: { useLimit: true } });
      seen.add(row.useLimit!);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  test('FO-392 follow-up: the agency fills its OWN code to learn its earlier uses - it learns a 25-wide window, never a 1..4 one', async () => {
    // The attack of FO-392-crw-fb.md ("kendi kodunu doldurma"): a code already has u0 uses
    // (organisations the agency may not know about). The agency registers k accounts itself
    // until the form refuses, then reads u0 = limit - k. With a fixed limit that is exact.
    // With the hidden spread the agency only knows limit in [500, 524], so u0 in [500-k, 524-k].
    // Measured on the real redeem function, real limit, 500+ real redemptions.
    const u0 = 3;
    const { id, code } = await makeCode(ids.agencyA);
    for (let i = 0; i < u0; i++) expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
    let k = 0;
    for (;;) {
      if ((await redeemAsNewTenant(rls!, code)) === null) break;
      k++;
      expect(k).toBeLessThanOrEqual(INVITE_CODE_MAX_USE_LIMIT);
    }
    const limit = await usedCount(id);
    expect(limit).toBe(u0 + k); // the counter stopped at the real limit
    const lo = Math.max(0, INVITE_CODE_MIN_USE_LIMIT - k);
    const hi = INVITE_CODE_MAX_USE_LIMIT - k;
    console.log(`SELF-BURN u0=${u0} k=${k} realLimit=${limit} attackerWindow=[${lo},${hi}] width=${hi - lo + 1}`);
    expect(u0).toBeGreaterThanOrEqual(lo);
    expect(u0).toBeLessThanOrEqual(hi);
    // The funnel's rule: a hidden count must never be read back as lying in 1..4. The window is
    // [max(0, 500-k), 524-k]. lo >= 1 needs k <= 499, hi <= 4 needs k >= 520: both cannot hold.
    // (Near k = 520 the window is [0, 4]: it holds 0, so "1..4" is not learned. With a FIXED
    // limit lo = hi = u0 and any u0 in 1..4 is read exactly - that is the leak this spread closes.)
    expect(lo >= 1 && hi <= 4).toBe(false);
    // Over the whole range of k the window is as wide as the spread, except where 0 clamps it.
    expect(hi - lo + 1).toBe(Math.min(INVITE_CODE_MAX_USE_LIMIT - INVITE_CODE_MIN_USE_LIMIT + 1, hi + 1));
  }, 120_000);

  test('a code from before FO-392 (useLimit NULL) is unlimited: it works N times in a row and the counter keeps count', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    await admin!.agencyInviteCode.update({ where: { id }, data: { useLimit: null } });
    const N = 30;
    for (let i = 0; i < N; i++) expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
    expect(await usedCount(id)).toBe(N);
  });

  test('the use limit: exactly useLimit uses are accepted, every later one is refused with the same NULL, the counter stops at the limit', async () => {
    const { id, code } = await makeCodeWithLimit(ids.agencyA, 3);
    const results: (string | null)[] = [];
    for (let i = 0; i < 6; i++) results.push(await redeemAsNewTenant(rls!, code));
    expect(results).toEqual([ids.agencyA, ids.agencyA, ids.agencyA, null, null, null]);
    expect(await usedCount(id)).toBe(3);
  });

  test('a refused use inside a registration leaves the limit alone: the use that rolls back frees its place', async () => {
    const { id, code } = await makeCodeWithLimit(ids.agencyA, 1);
    await expect(
      rls!.$transaction(async (tx) => {
        expect(await redeemInviteCode(tx, code)).toBe(ids.agencyA);
        throw new Error('registration failed after the code was used');
      })
    ).rejects.toThrow(/registration failed/);
    expect(await usedCount(id)).toBe(0);
    expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
    expect(await redeemAsNewTenant(rls!, code)).toBeNull();
  });

  test('race for the LAST use: two connections, one place left - exactly one wins, the counter is at the limit', async () => {
    const { id, code } = await makeCodeWithLimit(ids.agencyA, 1);
    // The first holds the row lock for 400 ms; the second starts inside that window and
    // waits on the lock. After the first commits, the second re-checks the WHERE clause.
    const first = redeemAsNewTenant(rls!, code, 400);
    await new Promise((r) => setTimeout(r, 100));
    const second = redeemAsNewTenant(rls2!, code);
    const results = await Promise.all([first, second]);
    expect(results).toEqual([ids.agencyA, null]);
    expect(await usedCount(id)).toBe(1);
  });

  test('20 parallel registrations on a code with 5 places: exactly 5 win, the counter never passes 5', async () => {
    const LIMIT = 5;
    const { id, code } = await makeCodeWithLimit(ids.agencyA, LIMIT);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => redeemAsNewTenant(i % 2 ? rls2! : rls!, code))
    );
    expect(results.filter((r) => r === ids.agencyA)).toHaveLength(LIMIT);
    expect(results.filter((r) => r === null)).toHaveLength(20 - LIMIT);
    expect(await usedCount(id)).toBe(LIMIT);
  });

  test('the table itself holds the line: a limit of 0 and a counter past the limit are refused by CHECKs', async () => {
    const { id } = await makeCodeWithLimit(ids.agencyA, 2);
    await expect(admin!.agencyInviteCode.update({ where: { id }, data: { useLimit: 0 } })).rejects.toThrow(/useLimit_positive/);
    await expect(admin!.agencyInviteCode.update({ where: { id }, data: { usedCount: 3 } })).rejects.toThrow(/within_useLimit/);
    // Lowering the limit under the counter is the same refusal, not a silent over-use.
    await admin!.agencyInviteCode.update({ where: { id }, data: { usedCount: 2 } });
    await expect(admin!.agencyInviteCode.update({ where: { id }, data: { useLimit: 1 } })).rejects.toThrow(/within_useLimit/);
  });

  test('the panel list: a used-up code reads "exhausted", a legacy code reads "active" and unlimited; neither count nor limit anywhere', async () => {
    const used = await makeCodeWithLimit(ids.agencyA, 2);
    const legacy = await makeLegacyCodePastItsLimit(ids.agencyA);
    await redeemAsNewTenant(rls!, used.code);
    await redeemAsNewTenant(rls!, used.code);
    const list = await withTenantOn(rls!, ids.agencyA, (tx) => listInviteCodesIn(tx, ids.agencyA));
    const byId = new Map(list.map((c) => [c.id, c]));
    expect(byId.get(used.id)).toMatchObject({ status: 'exhausted', limited: true });
    expect(byId.get(legacy.id)).toMatchObject({ status: 'active', limited: false });
    expect(JSON.stringify(list)).not.toMatch(/usedCount|"used|useLimit/);
  });

  test('a code made under the old limit and used past it still works: the old limit is not read', async () => {
    const { id, code } = await makeLegacyCodePastItsLimit(ids.agencyA);
    expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
    expect(await usedCount(id)).toBe(10);
  });

  test('two connections on one code: the row lock serialises them, both win, no use is lost', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    // The first holds the row lock (uncommitted) for 400 ms; the second starts
    // inside that window, waits on the lock, then adds its own use.
    const first = redeemAsNewTenant(rls!, code, 400);
    await new Promise((r) => setTimeout(r, 100));
    const second = redeemAsNewTenant(rls2!, code);
    expect(await Promise.all([first, second])).toEqual([ids.agencyA, ids.agencyA]);
    expect(await usedCount(id)).toBe(2);
  });

  test('a burst of 12 parallel registrations on one code: all 12 succeed and are counted', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => redeemAsNewTenant(i % 2 ? rls2! : rls!, code))
    );
    expect(results.filter((r) => r === ids.agencyA)).toHaveLength(12);
    expect(await usedCount(id)).toBe(12);
  });

  test('probing (TASK-MUM3TMP8HU76G Ö-1): a much-used code answers like a fresh one; only revoke or expiry refuses, with the same NULL', async () => {
    const fresh = await makeCode(ids.agencyA);
    const used = await makeCode(ids.agencyA);
    for (let i = 0; i < 8; i++) await redeemAsNewTenant(rls!, used.code);
    // What an agency trying its own codes on the form gets back:
    expect(await redeemAsNewTenant(rls!, fresh.code)).toBe(ids.agencyA);
    expect(await redeemAsNewTenant(rls!, used.code)).toBe(ids.agencyA);
    // The only refusals it can meet are ones it caused itself and already knows.
    await withTenantOn(rls!, ids.agencyA, (tx) =>
      revokeInviteCodeIn(tx, { tenantId: ids.agencyA, id: used.id, revokedBy: ids.staff })
    );
    await admin!.agencyInviteCode.update({ where: { id: fresh.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const refusals = [
      await redeemAsNewTenant(rls!, used.code),
      await redeemAsNewTenant(rls!, fresh.code),
      await redeemAsNewTenant(rls!, 'ABCD-EFGH-JKMN'),
    ];
    expect(refusals).toEqual([null, null, null]);
  });

  test('a revoked code is refused; revoking twice is a no-op', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    const revoke = () =>
      withTenantOn(rls!, ids.agencyA, (tx) =>
        revokeInviteCodeIn(tx, { tenantId: ids.agencyA, id, revokedBy: ids.staff })
      );
    expect(await revoke()).toBe(true);
    expect(await revoke()).toBe(false);
    expect(await redeemAsNewTenant(rls!, code)).toBeNull();
    expect(await usedCount(id)).toBe(0);
  });

  test('an expired code is refused', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    await admin!.agencyInviteCode.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await redeemAsNewTenant(rls!, code)).toBeNull();
  });

  test('a code of a tenant that is no longer an agency, or is deleted, is refused', async () => {
    const c = await newTenant('AGENCY', 'agency-c');
    const { code } = await makeCode(c);
    await admin!.tenant.update({ where: { id: c }, data: { kind: 'ORGANIZATION' } });
    expect(await redeemAsNewTenant(rls!, code)).toBeNull();
    await admin!.tenant.update({ where: { id: c }, data: { kind: 'AGENCY', deletedAt: new Date() } });
    expect(await redeemAsNewTenant(rls!, code)).toBeNull();
  });

  test('unknown and malformed codes are refused the same way', async () => {
    expect(await redeemAsNewTenant(rls!, 'ABCD-EFGH-JKMN')).toBeNull();
    expect(await redeemAsNewTenant(rls!, 'not a code')).toBeNull();
    expect(await redeemAsNewTenant(rls!, '')).toBeNull();
  });

  test('only an agency can create codes', async () => {
    await expect(makeCode(ids.org)).rejects.toThrow(/Only an agency/);
  });
});

describe('the function does not leak its system scope', () => {
  test('after a normal call the caller scope is what it was', async () => {
    const { code } = await makeCode(ids.agencyA);
    const after = await rls!.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.system_scope', 'off', true)`;
      await redeemInviteCode(tx, code);
      const [row] = await tx.$queryRaw<Array<{ s: string | null }>>`
        SELECT current_setting('app.system_scope', true) AS s`;
      // And the scope really is closed: a cross-tenant read sees nothing.
      const visible = await tx.agencyInviteCode.count();
      return { s: row?.s, visible };
    });
    expect(after.s).toBe('off');
    expect(after.visible).toBe(0);
  });

  test('after the function fails mid-call the scope is not left open', async () =>
    // Under a 100 ms lock_timeout, so not while tests/oauth-registration.live.test.ts
    // creates or drops its trigger on this table (TASK-MUN7B4ZIEBJML).
    withTestDbLock(ADMIN_URL!, AGENCY_INVITE_CODE_DDL_LOCK, async () => {
      const { code } = await makeCode(ids.agencyA);
      // Connection 1 holds the code's row lock; connection 2 gives up waiting
      // (lock_timeout) INSIDE redeem_agency_invite, i.e. while the function's
      // `SET app.system_scope = 'on'` is in force.
      const holder = redeemAsNewTenant(rls!, code, 800);
      await new Promise((r) => setTimeout(r, 150));
      const observed = await rls2!.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('lock_timeout', '100ms', true)`;
        await tx.$executeRaw`SAVEPOINT before_redeem`;
        let failed = '';
        try {
          await redeemInviteCode(tx, code);
        } catch (e) {
          failed = e instanceof Error ? e.message : String(e);
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT before_redeem`;
        }
        const [row] = await tx.$queryRaw<Array<{ s: string | null }>>`
          SELECT current_setting('app.system_scope', true) AS s`;
        const visible = await tx.agencyInviteCode.count();
        return { failed, s: row?.s ?? null, visible };
      });
      await holder;
      expect(observed.failed).toMatch(/lock timeout/i);
      expect(observed.s).not.toBe('on');
      expect(observed.visible).toBe(0);
    }));
});

describe('the agency link grants no read on the linked organisation', () => {
  test('agency scope: the linked org content is invisible and unwritable', async () => {
    await admin!.tenant.update({ where: { id: ids.org }, data: { agencyId: ids.agencyA } });

    // Counterfactual first: the row exists and its own tenant sees it.
    const own = await withTenantOn(rls!, ids.org, (tx) => tx.workspace.count({ where: { tenantId: ids.org } }));
    expect(own).toBe(1);

    const asAgency = await withTenantOn(rls!, ids.agencyA, async (tx) => ({
      byTenant: await tx.workspace.count({ where: { tenantId: ids.org } }),
      byId: await tx.workspace.findUnique({ where: { id: ids.orgWorkspace } }),
      updated: (await tx.workspace.updateMany({ where: { id: requireId(ids.orgWorkspace, 'ids.orgWorkspace') }, data: { name: 'agency was here' } })).count,
    }));
    expect(asAgency).toEqual({ byTenant: 0, byId: null, updated: 0 });

    await expect(
      withTenantOn(rls!, ids.agencyA, (tx) =>
        tx.workspace.create({ data: { tenantId: ids.org, name: 'planted', slug: `${RUN}-planted` } })
      )
    ).rejects.toThrow(/row-level security/i);

    const name = await admin!.workspace.findUniqueOrThrow({ where: { id: ids.orgWorkspace }, select: { name: true } });
    expect(name.name).toBe(`${RUN} private`);
  });

  test('agency B neither sees nor revokes agency A codes', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    const bList = await withTenantOn(rls!, ids.agencyB, (tx) => listInviteCodesIn(tx, ids.agencyB));
    expect(bList.find((c) => c.id === id)).toBeUndefined();
    const aList = await withTenantOn(rls!, ids.agencyA, (tx) => listInviteCodesIn(tx, ids.agencyA));
    expect(aList.find((c) => c.id === id)).toBeDefined();
    expect(JSON.stringify(aList)).not.toMatch(/[0-9a-f]{64}/); // no hash in the list
    expect(JSON.stringify(aList)).not.toMatch(/usedCount|"used/); // B-1: status, no use count

    const revokedByB = await withTenantOn(rls!, ids.agencyB, (tx) =>
      revokeInviteCodeIn(tx, { tenantId: ids.agencyB, id, revokedBy: 'intruder' })
    );
    expect(revokedByB).toBe(false);
    expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
  });

  test('the registrant cannot read codes either: no tenant scope, zero rows', async () => {
    await makeCode(ids.agencyA);
    expect(await rls!.agencyInviteCode.count()).toBe(0);
  });
});

describe('refused attempts are counted without the code', () => {
  // TASK-MULU7GVFBTRXX K-6 — an unknown code is counted on one platform-only
  // SystemAlert row (fix-agency-invite-rejection-audit.sql), never as a
  // tenant-readable AuditEvent. The counter row is shared with real attempts
  // and with tests/oauth-registration.live.test.ts, so this test holds
  // UNKNOWN_INVITE_COUNTER_LOCK from its snapshot until it has put the row back
  // exactly as it found it (TASK-MUN7B4ZIEBJML).
  const UNKNOWN_KEY = 'agency.invite.rejected.unknown';

  async function openCounter(): Promise<{ id: string; meta: unknown } | null> {
    const rows = await admin!.$queryRaw<Array<{ id: string; meta: unknown }>>`
      SELECT "id", "meta" FROM "SystemAlert"
       WHERE "level" = 'info' AND "source" = 'agency.invite' AND "resolvedAt" IS NULL
         AND "meta" ->> 'alertDedupeKey' = ${UNKNOWN_KEY}
       ORDER BY "createdAt" DESC LIMIT 1`;
    return rows[0] ?? null;
  }
  function repeats(row: { meta: unknown } | null): number {
    const n = (row?.meta as Record<string, unknown> | undefined)?.alertRepeatCount;
    return row ? (typeof n === 'number' ? n : 1) : 0;
  }

  test('a revoked and a used-up code are filed under their agency (revoked / exhausted); an unknown one leaves no tenant-readable row', async () =>
    withTestDbLock(ADMIN_URL!, UNKNOWN_INVITE_COUNTER_LOCK, async () => {
      const since = new Date(Date.now() - 1000);
      const counterBefore = await openCounter();
      try {
        const { id, code } = await makeCode(ids.agencyA);
        expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
        await withTenantOn(rls!, ids.agencyA, (tx) =>
          revokeInviteCodeIn(tx, { tenantId: ids.agencyA, id, revokedBy: ids.staff })
        );
        await noteInviteRejection(rls!, code);
        // A code past its OLD limit is live (useLimit NULL). Were a refusal noted on it (a lost
        // race), the reason is not 'exhausted' (TASK-MUM4WVYLSH9IT).
        const legacy = await makeLegacyCodePastItsLimit(ids.agencyA);
        await noteInviteRejection(rls!, legacy.code);
        // A code at its useLimit is 'exhausted' (FO-392).
        const spent = await makeCodeWithLimit(ids.agencyA, 1);
        expect(await redeemAsNewTenant(rls!, spent.code)).toBe(ids.agencyA);
        expect(await redeemAsNewTenant(rls!, spent.code)).toBeNull();
        await noteInviteRejection(rls!, spent.code);
        await noteInviteRejection(rls!, 'ZZZZ-ZZZZ-ZZZZ');

        const mine = await admin!.auditEvent.findMany({
          where: { tenantId: ids.agencyA, type: 'agency.invite.rejected', createdAt: { gte: since } },
          select: { data: true, actorId: true, target: true },
          orderBy: { createdAt: 'asc' },
        });
        expect(mine).toEqual([
          { data: { reason: 'revoked', codeId: id }, actorId: null, target: null },
          { data: { reason: 'lost_race', codeId: legacy.id }, actorId: null, target: null },
          { data: { reason: 'exhausted', codeId: spent.id }, actorId: null, target: null },
        ]);

        const orphan = await admin!.auditEvent.count({
          where: { tenantId: null, type: 'agency.invite.rejected', createdAt: { gte: since } },
        });
        expect(orphan).toBe(0);

        // Another tenant's session sees none of it.
        const seenByOrg = await withTenantOn(rls!, ids.org, (tx) =>
          tx.auditEvent.count({ where: { type: 'agency.invite.rejected', createdAt: { gte: since } } })
        );
        expect(seenByOrg).toBe(0);

        const counter = await openCounter();
        expect(counter).not.toBeNull();
        expect(repeats(counter)).toBeGreaterThanOrEqual(repeats(counterBefore) + 1);
        expect(JSON.stringify(counter!.meta)).not.toContain('ZZZZ');
      } finally {
        const now = await openCounter();
        if (now && counterBefore === null) {
          await admin!.systemAlert.delete({ where: { id: now.id } }).catch(() => {});
        } else if (now && counterBefore) {
          await admin!.systemAlert
            .update({ where: { id: counterBefore.id }, data: { meta: counterBefore.meta as object } })
            .catch(() => {});
        }
      }
    }));
});
