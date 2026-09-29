import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenantOn } from '@/lib/db';
import { envValue } from '../../../../../tests/helpers/dotenv';
import {
  NO_MAIL_PROVIDER,
  sendSavedSearchAlerts,
  type SavedSearchAlertRow,
  type TenantRunner,
} from '../alerts-daily';
import { MailSendError, type Mailer, type MailMessage } from '@/lib/email/mailer';
import { grantCreditsToTenants } from '../credits-monthly-grant';

/**
 * TASK-MTVR8KK92G0GA — do the two cron jobs write under the tenant they are
 * iterating, and would we notice if they did not?
 *
 * Both halves matter. Asserting the happy path through the `prisma` singleton
 * would prove nothing at all: locally that connection is the `fabrika` role,
 * SUPERUSER + BYPASSRLS, which sees and writes every tenant's rows regardless
 * of what `app.tenant_id` says. That is exactly the false green that let these
 * calls sit unwrapped in the first place. So every assertion here runs through
 * DATABASE_URL_RLS_TEST — role `fabrika_app`, NOBYPASSRLS — the same role
 * tests/rls.spec.ts and `pnpm rls:verify` use, and the same shape the
 * application runs as in production. Create it with `pnpm db:rls-role`.
 *
 * Fixtures are written with the privileged singleton; the jobs under test are
 * driven over the RLS-subject client via `withTenantOn`, which is the injection
 * point `TenantRunner` exists for.
 *
 * The disconfirmation probes are not decoration. `SavedSearch`, `Membership`
 * and `CreditLedger` each carry one `tenant_isolation` policy with both USING
 * and WITH CHECK on `"tenantId" = current_setting('app.tenant_id', true)`, so a
 * write under the wrong scope is refused by Postgres (SQLSTATE 42501) rather
 * than misfiled. Each green below is paired with a probe that makes the same
 * assertion go red, so "it passed" means something.
 */
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');

/**
 * Decided before `describe` so the whole file skips itself when there is no
 * Postgres to measure against — the way tests/rls.spec.ts and
 * tests/m9-calendar-tenant-scope.live.test.ts already do. A missing database is
 * an absent measurement, not a failing one, and reddening `pnpm gate` on every
 * machine without `docker compose up` would be the wrong alarm.
 *
 * Note what does NOT skip: when the database IS reachable, the first test
 * asserts the probe role is genuinely NOBYPASSRLS and fails hard if it is not.
 * A role that silently bypasses the policies is a false green, and that is the
 * one thing this file exists to refuse.
 */
const dbReachable =
  RLS_URL !== undefined &&
  (await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (!dbReachable) {
  console.warn(
    'cron tenant-scope test skipped: needs Postgres and DATABASE_URL_RLS_TEST ' +
      '(`docker compose up -d` then `pnpm db:rls-role`).'
  );
}

/** Every row this file creates carries it, so cleanup can never over-reach. */
const RUN = `tvr8kk-${Date.now()}`;

/** Older than every Topic in any database, so the match count is non-zero. */
const LONG_AGO = new Date('2000-01-01T00:00:00Z');

interface Fixture {
  tenantId: string;
  searchId: string;
  email: string;
}

describe.skipIf(!dbReachable)('cron jobs write under the tenant they are iterating', () => {
  let rls: PrismaClient;
  let a: Fixture;
  let b: Fixture;
  let ready = false;
  let skipReason = '';

  /**
   * `withTenant`'s contract over the role the policies actually apply to, plus
   * the tenant id of every scope it was asked to open.
   *
   * The recording is not diagnostics — it is the assertion that survives a
   * SUPERUSER connection. Locally the `prisma` singleton bypasses RLS, so code
   * that reverted to a bare `prisma.creditLedger.create` would still write the
   * right row to the right tenant and every outcome assertion below would stay
   * green. What it could not do is open a tenant scope. So the tests check the
   * scopes as well as the rows: no scope, no pass.
   */
  function recordingRunner(): { run: TenantRunner; scopes: string[] } {
    const scopes: string[] = [];
    return {
      scopes,
      run: (tenantId, callback) => {
        scopes.push(tenantId);
        return withTenantOn(rls, tenantId, callback);
      },
    };
  }

  async function makeTenant(label: string): Promise<Fixture> {
    const tenant = await prisma.tenant.create({
      data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'SME' },
    });
    const email = `${RUN}-${label}@example.invalid`;
    const user = await prisma.user.create({ data: { email, name: `Owner ${label}` } });
    await prisma.membership.create({
      data: { tenantId: tenant.id, userId: user.id, role: 'TENANT_OWNER' },
    });
    const search = await prisma.savedSearch.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        name: `Search ${label} ${RUN}`,
        filters: {},
        notify: true,
        lastRunAt: LONG_AGO,
      },
    });
    return { tenantId: tenant.id, searchId: search.id, email };
  }

  /** The row shape `fetch-saved-searches` hands the loop. */
  function rowFor(f: Fixture, label: string): SavedSearchAlertRow {
    return {
      id: f.searchId,
      tenantId: f.tenantId,
      name: `Search ${label} ${RUN}`,
      filters: {},
      lastRunAt: LONG_AGO,
      createdAt: LONG_AGO,
    };
  }

  /** Credit rows visible to `tenantId` — through RLS, so this is what that tenant can see. */
  function ledgerFor(tenantId: string) {
    return withTenantOn(rls, tenantId, (tx) =>
      tx.creditLedger.findMany({
        where: { reason: 'monthly_grant' },
        select: { tenantId: true, delta: true },
      })
    );
  }

  function lastRunOf(searchId: string) {
    return prisma.savedSearch
      .findUniqueOrThrow({ where: { id: searchId }, select: { lastRunAt: true } })
      .then((r) => r.lastRunAt);
  }

  /** A mailer that accepts everything and remembers who it was asked to mail. */
  function recordingMailer(): { send: Mailer; sent: MailMessage[] } {
    const sent: MailMessage[] = [];
    return { sent, send: async (m) => void sent.push(m) };
  }

  /**
   * The no-provider tests below only mean something if the searches HAVE
   * matches: with zero matches the job skips the send and advances
   * `lastRunAt` on purpose, and "lastRunAt did not move" would never be
   * reached. So assert the precondition instead of trusting it.
   */
  async function assertMatchesExist() {
    const topics = await prisma.topic.count({ where: { fetchedAt: { gt: LONG_AGO } } });
    expect(topics, 'no Topic rows locally — every search would be skipped, not mailed').toBeGreaterThan(0);
  }

  async function resetLastRun() {
    await prisma.savedSearch.updateMany({
      where: { id: { in: [a.searchId, b.searchId] } },
      data: { lastRunAt: LONG_AGO },
    });
  }

  beforeAll(async () => {
    try {
      await prisma.$connect();
      rls = createDbClient(RLS_URL!);
      await rls.$connect();
      a = await makeTenant('a');
      b = await makeTenant('b');
      ready = true;
    } catch (error) {
      skipReason = `database unavailable: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`cron tenant-scope test skipped: ${skipReason}`);
    }
  });

  afterAll(async () => {
    // Written with the privileged role, and narrowed to this run's marker only.
    for (const f of [a, b]) {
      if (!f) continue;
      await prisma.savedSearch.deleteMany({ where: { tenantId: f.tenantId } });
      await prisma.creditLedger.deleteMany({ where: { tenantId: f.tenantId } });
      // Membership cascades from both sides; the tenant delete takes it.
      await prisma.tenant.deleteMany({ where: { id: f.tenantId } });
      await prisma.user.deleteMany({ where: { email: f.email } });
    }
    await rls?.$disconnect();
    await prisma.$disconnect();
  });

  it('is measuring through a role the policies actually apply to', async () => {
    expect(ready, skipReason).toBe(true);
    const [role] = await rls.$queryRawUnsafe<Array<{ rolname: string; rolbypassrls: boolean }>>(
      'select rolname, rolbypassrls from pg_roles where rolname = current_user'
    );
    expect(role?.rolbypassrls, 'the probe role bypasses RLS — this suite would prove nothing').toBe(
      false
    );
  });

  it('credits-monthly-grant: each ledger row lands in the tenant of its own iteration', async () => {
    expect(ready, skipReason).toBe(true);

    const runner = recordingRunner();
    const result = await grantCreditsToTenants(
      [{ id: a.tenantId }, { id: b.tenantId }],
      runner.run
    );

    expect(result.errors ?? []).toEqual([]);
    expect(result.grantedCount).toBe(2);
    expect(result.failedCount).toBe(0);

    // One scope per iteration, each one this iteration's own tenant and in
    // order — an unwrapped write would leave this empty.
    expect(runner.scopes).toEqual([a.tenantId, b.tenantId]);

    // Read back through RLS: what each tenant can see is what it was written.
    const seenByA = await ledgerFor(a.tenantId);
    const seenByB = await ledgerFor(b.tenantId);

    expect(seenByA).toEqual([{ tenantId: a.tenantId, delta: 10 }]);
    expect(seenByB).toEqual([{ tenantId: b.tenantId, delta: 10 }]);
    // The point of the whole slice: neither tenant can reach the other's grant.
    expect(seenByA.map((r) => r.tenantId)).not.toContain(b.tenantId);
    expect(seenByB.map((r) => r.tenantId)).not.toContain(a.tenantId);
  });

  it('credits-monthly-grant: a stale tenant id is refused by the database, not misfiled', async () => {
    expect(ready, skipReason).toBe(true);
    await prisma.creditLedger.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });

    // The closure-capture bug, made concrete: the scope lags one iteration
    // behind the row being written. Iteration A is still correct (nothing has
    // gone stale yet); iteration B writes tenant B's row under tenant A's scope.
    let previous = a.tenantId;
    const stale: TenantRunner = (tenantId, callback) => {
      const useThis = previous;
      previous = tenantId;
      return withTenantOn(rls, useThis, callback);
    };

    const result = await grantCreditsToTenants([{ id: a.tenantId }, { id: b.tenantId }], stale);

    expect(result.grantedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors?.[0]?.tenantId).toBe(b.tenantId);
    expect(result.errors?.[0]?.message).toMatch(/row-level security/i);

    // And the refusal is total: tenant B got no row anywhere, under any scope.
    expect(await ledgerFor(b.tenantId)).toEqual([]);
    const everywhere = await prisma.creditLedger.findMany({
      where: { tenantId: { in: [a.tenantId, b.tenantId] } },
      select: { tenantId: true },
    });
    expect(everywhere).toEqual([{ tenantId: a.tenantId }]);
  });

  it('alerts-daily: every search advances lastRunAt under its own tenant', async () => {
    expect(ready, skipReason).toBe(true);

    await assertMatchesExist();
    const runner = recordingRunner();
    const mail = recordingMailer();
    const result = await sendSavedSearchAlerts(
      [rowFor(a, 'a'), rowFor(b, 'b')],
      runner.run,
      mail.send
    );

    expect(result.errors).toEqual([]);
    expect(result.emailsFailed).toBe(0);

    // Two scopes per search — the owner lookup and the `lastRunAt` write — and
    // every one of them the tenant of the search being processed. A run that
    // reached for a stale id, or skipped the wrapper, cannot produce this.
    expect(runner.scopes).toEqual([a.tenantId, a.tenantId, b.tenantId, b.tenantId]);
    // Each owner was mailed once, and only after the mailer accepted it was
    // the search counted as sent.
    expect(mail.sent.map((m) => m.to)).toEqual([a.email, b.email]);
    expect(result.emailsSent).toBe(2);

    for (const f of [a, b]) {
      const lastRunAt = await lastRunOf(f.searchId);
      expect(lastRunAt, 'lastRunAt did not advance').not.toBeNull();
      expect(lastRunAt!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    }
  });

  it('alerts-daily: a stale tenant id fails the search rather than touching the other tenant', async () => {
    expect(ready, skipReason).toBe(true);
    await prisma.savedSearch.updateMany({
      where: { id: { in: [a.searchId, b.searchId] } },
      data: { lastRunAt: LONG_AGO },
    });

    let previous = a.tenantId;
    const stale: TenantRunner = (tenantId, callback) => {
      const useThis = previous;
      previous = tenantId;
      return withTenantOn(rls, useThis, callback);
    };

    const mail = recordingMailer();
    const result = await sendSavedSearchAlerts([rowFor(a, 'a'), rowFor(b, 'b')], stale, mail.send);
    expect(mail.sent.map((m) => m.to)).toEqual([a.email]);

    // Search B is looked up under tenant A's scope, so its owner membership is
    // invisible and the search fails before it can mail or write anything.
    expect(result.emailsFailed).toBe(1);
    expect(result.errors).toEqual([{ searchId: b.searchId, reason: 'no_owner_email' }]);

    expect((await lastRunOf(a.searchId))!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    expect(await lastRunOf(b.searchId)).toEqual(LONG_AGO);
  });

  it('alerts-daily: the lastRunAt write itself is refused under a foreign scope', async () => {
    expect(ready, skipReason).toBe(true);
    // The probe above stops at the owner lookup, so it never reaches the two
    // `savedSearch.update` calls. This one aims straight at them: the update
    // the job performs, run under the other tenant's scope, must not succeed.
    await expect(
      withTenantOn(rls, b.tenantId, (tx) =>
        tx.savedSearch.update({ where: { id: a.searchId }, data: { lastRunAt: new Date() } })
      )
    ).rejects.toThrow();
  });
  // TASK-MUMH6NZ128QZ1 — no mail provider used to mean "count it as sent and
  // move lastRunAt past the matches", so they were never mailed at all.
  it('alerts-daily: with no mail provider, nothing is counted sent and lastRunAt stays put', async () => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist();
    await resetLastRun();

    const runner = recordingRunner();
    const result = await sendSavedSearchAlerts([rowFor(a, 'a'), rowFor(b, 'b')], runner.run, null);

    expect(result.emailsSent).toBe(0);
    expect(result.emailsSkipped).toBe(0);
    expect(result.emailsFailed).toBe(2);
    expect(result.errors).toEqual([
      { searchId: a.searchId, reason: NO_MAIL_PROVIDER },
      { searchId: b.searchId, reason: NO_MAIL_PROVIDER },
    ]);
    // Owner lookups only — no `lastRunAt` write was attempted for either.
    expect(runner.scopes).toEqual([a.tenantId, b.tenantId]);
    expect(await lastRunOf(a.searchId)).toEqual(LONG_AGO);
    expect(await lastRunOf(b.searchId)).toEqual(LONG_AGO);
  });

  it('alerts-daily: a send the provider refuses fails that search and keeps its matches', async () => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist();
    await resetLastRun();

    // A refuses (what smtpMailer throws on a 550), B goes through.
    const refusingForA: Mailer = async (m) => {
      if (m.to === a.email) throw new MailSendError('EENVELOPE', 550);
    };
    const result = await sendSavedSearchAlerts(
      [rowFor(a, 'a'), rowFor(b, 'b')],
      recordingRunner().run,
      refusingForA
    );

    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(1);
    expect(result.errors).toEqual([{ searchId: a.searchId, reason: 'smtp:EENVELOPE:550' }]);
    expect(await lastRunOf(a.searchId)).toEqual(LONG_AGO);
    expect((await lastRunOf(b.searchId))!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
  });
});
