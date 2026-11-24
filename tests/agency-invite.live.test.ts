import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
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
import { skipOrFailOnMissingDbObject } from './helpers/require-db-object';
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

/** Codes have no use limit (TASK-MUM4WVYLSH9IT): only an end date. */
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
 * column keeps its old value, and nothing may read it any more.
 */
async function makeLegacyCodePastItsLimit(agency: string): Promise<{ id: string; code: string }> {
  const created = await makeCode(agency);
  await admin!.agencyInviteCode.update({ where: { id: created.id }, data: { maxUses: 6, usedCount: 9 } });
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
    skipOrFailOnMissingDbObject(SUITE, skipReason);
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

  // TASK-MUM4WVYLSH9IT (leed-fb 29.09): no use limit. A code that is neither
  // expired nor revoked works every time, so a refusal can never mean "used up".
  test('no use limit: a live code works N times in a row, and the counter keeps count', async () => {
    const { id, code } = await makeCode(ids.agencyA);
    const N = 30;
    for (let i = 0; i < N; i++) expect(await redeemAsNewTenant(rls!, code)).toBe(ids.agencyA);
    expect(await usedCount(id)).toBe(N);
    const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id }, select: { maxUses: true } });
    expect(row.maxUses).toBeNull(); // a new code writes no limit
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

  test('a revoked code is filed under its agency; no "exhausted" reason; an unknown one leaves no tenant-readable row', async () =>
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
        // A code past its old limit is live. Were a refusal noted on it (a lost
        // race), the reason is not 'exhausted' (TASK-MUM4WVYLSH9IT).
        const legacy = await makeLegacyCodePastItsLimit(ids.agencyA);
        await noteInviteRejection(rls!, legacy.code);
        await noteInviteRejection(rls!, 'ZZZZ-ZZZZ-ZZZZ');

        const mine = await admin!.auditEvent.findMany({
          where: { tenantId: ids.agencyA, type: 'agency.invite.rejected', createdAt: { gte: since } },
          select: { data: true, actorId: true, target: true },
          orderBy: { createdAt: 'asc' },
        });
        expect(mine).toEqual([
          { data: { reason: 'revoked', codeId: id }, actorId: null, target: null },
          { data: { reason: 'lost_race', codeId: legacy.id }, actorId: null, target: null },
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
