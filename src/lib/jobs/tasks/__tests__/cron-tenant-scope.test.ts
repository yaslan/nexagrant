import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenant, withTenantOn } from '@/lib/db';
import { envValue } from '../../../../../tests/helpers/dotenv';
import {
  NO_MAIL_PROVIDER,
  sendSavedSearchAlerts,
  type SavedSearchAlertRow,
  type TenantRunner,
} from '../alerts-daily';
import { MailSendError, type Mailer, type MailMessage } from '@/lib/email/mailer';
import { grantCreditsToTenants } from '../credits-monthly-grant';
import { requireId } from '../../../../../tests/helpers/teardown-guard';
import { skipUnlessSeeded } from '../../../../../tests/helpers/seed';
import { isCi } from '../../../../../tests/helpers/live-db-role';

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
  userId: string;
  searchId: string;
  email: string;
}

describe.skipIf(!dbReachable)('cron jobs write under the tenant they are iterating', () => {
  let rls: PrismaClient;
  let a: Fixture;
  let b: Fixture;
  let ready = false;
  let skipReason = '';
  /** Users made by single tests, removed with the rest in afterAll. */
  const extraEmails: string[] = [];

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
    return { tenantId: tenant.id, userId: user.id, searchId: search.id, email };
  }

  /** The row shape `fetch-saved-searches` hands the loop. */
  function rowFor(f: Fixture, label: string): SavedSearchAlertRow {
    return {
      id: f.searchId,
      tenantId: f.tenantId,
      userId: f.userId,
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
   * reached. So check the precondition instead of trusting it: the Topic rows
   * come from `pnpm db:seed` — without them the test is skipped locally and
   * fails in CI (tests/helpers/seed.ts).
   */
  async function assertMatchesExist(ctx: { skip: (note?: string) => void }) {
    const topics = await prisma.topic.count({ where: { fetchedAt: { gt: LONG_AGO } } });
    skipUnlessSeeded(ctx, 'cron tenant-scope test', topics > 0, 'no Topic rows, so every search would be skipped, not mailed');
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
      await prisma.savedSearch.deleteMany({ where: { tenantId: requireId(f.tenantId, 'f.tenantId') } });
      await prisma.creditLedger.deleteMany({ where: { tenantId: requireId(f.tenantId, 'f.tenantId') } });
      await prisma.notification.deleteMany({ where: { tenantId: requireId(f.tenantId, 'f.tenantId') } });
      // Membership cascades from both sides; the tenant delete takes it.
      await prisma.tenant.deleteMany({ where: { id: requireId(f.tenantId, 'f.tenantId') } });
      await prisma.user.deleteMany({ where: { email: requireId(f.email, 'f.email') } });
    }
    for (const email of extraEmails) {
      await prisma.user.deleteMany({ where: { email: requireId(email, 'email') } });
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

  it('credits-monthly-grant: a second run for the same month grants nothing (ADR-0008 §6.2)', async () => {
    expect(ready, skipReason).toBe(true);
    await prisma.creditLedger.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    const tenants = [{ id: a.tenantId }, { id: b.tenantId }];
    const run: TenantRunner = (tenantId, cb) => withTenantOn(rls, tenantId, cb);

    const first = await grantCreditsToTenants(tenants, run, '2031-05');
    expect(first).toMatchObject({ period: '2031-05', grantedCount: 2, alreadyGrantedCount: 0, failedCount: 0 });

    // A retry, a manual re-run, or the same tick in two schedulers at once.
    const [again, racing] = await Promise.all([
      grantCreditsToTenants(tenants, run, '2031-05'),
      grantCreditsToTenants(tenants, run, '2031-05'),
    ]);
    for (const r of [again, racing]) {
      expect(r).toMatchObject({ grantedCount: 0, alreadyGrantedCount: 2, failedCount: 0, totalCreditsGranted: 0 });
    }

    const rows = await prisma.creditLedger.findMany({
      where: { tenantId: { in: [a.tenantId, b.tenantId] } },
      select: { tenantId: true, grantPeriod: true, refId: true, reason: true },
      orderBy: { tenantId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.grantPeriod)).toEqual(['2031-05', '2031-05']);
    expect(rows.map((r) => r.refId)).toEqual(['monthly_grant:2031-05', 'monthly_grant:2031-05']);

    // The next month is a new grant.
    const next = await grantCreditsToTenants(tenants, run, '2031-06');
    expect(next).toMatchObject({ grantedCount: 2, alreadyGrantedCount: 0 });
    expect(await prisma.creditLedger.count({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } })).toBe(4);
  });

  it('credits-monthly-grant: rows without a grant period stay unconstrained', async () => {
    expect(ready, skipReason).toBe(true);
    // usage rows reuse refId (llm.ts: proposalId) and re-activation grants reuse
    // the subscription id (subscription-sync.ts); neither sets grantPeriod.
    await prisma.creditLedger.createMany({
      data: [
        { tenantId: a.tenantId, delta: -1, reason: 'usage:M2', refId: `${RUN}-p` },
        { tenantId: a.tenantId, delta: -1, reason: 'usage:M2', refId: `${RUN}-p` },
        { tenantId: a.tenantId, delta: 5, reason: 'monthly_grant', refId: `${RUN}-sub` },
        { tenantId: a.tenantId, delta: 5, reason: 'monthly_grant', refId: `${RUN}-sub` },
      ],
    });
    expect(await prisma.creditLedger.count({ where: { tenantId: a.tenantId, refId: { startsWith: RUN } } })).toBe(4);
  });

  it('credits-monthly-grant: a period that is not YYYY-MM is refused before any write', async () => {
    expect(ready, skipReason).toBe(true);
    await expect(grantCreditsToTenants([{ id: a.tenantId }], withTenant, '2031-13')).rejects.toThrow(/YYYY-MM/);
  });

  it('credits-monthly-grant: a month the old Inngest job granted is not granted again (İNCELEME-38 B-1)', async () => {
    expect(ready, skipReason).toBe(true);
    await prisma.creditLedger.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    // What the pre-ADR-0008 job wrote: no refId, no grantPeriod (NULL is
    // distinct to the unique key, so the key alone would let the new job in).
    // Tenant b gets the two look-alikes that must NOT count: an old-job row of
    // the month before, and an iyzico/Stripe activation grant, which shares the
    // reason but carries the payment id.
    await prisma.creditLedger.createMany({
      data: [
        { tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-07-01T06:00:03Z') },
        { tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-06-30T23:59:59Z') },
        { tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', refId: `${RUN}-pay`, createdAt: new Date('2031-07-02T09:00:00Z') },
      ],
    });
    const run: TenantRunner = (tenantId, cb) => withTenantOn(rls, tenantId, cb);

    const july = await grantCreditsToTenants([{ id: a.tenantId }, { id: b.tenantId }], run, '2031-07');
    expect(july).toMatchObject({ grantedCount: 1, alreadyGrantedCount: 1, failedCount: 0, totalCreditsGranted: 10 });

    const julyRows = (tenantId: string) =>
      prisma.creditLedger.aggregate({
        where: {
          tenantId,
          reason: 'monthly_grant',
          createdAt: { gte: new Date('2031-07-01T00:00:00Z'), lt: new Date('2031-08-01T00:00:00Z') },
        },
        _sum: { delta: true },
      });
    expect((await julyRows(a.tenantId))._sum.delta).toBe(10);
    // b: the activation grant plus this job's own July grant.
    expect(await prisma.creditLedger.count({ where: { tenantId: b.tenantId, grantPeriod: '2031-07' } })).toBe(1);
  });

  /**
   * The migration's backfill UPDATEs, in file order, as the file runs them on
   * re-apply. Comment lines are dropped first so the header cannot match.
   */
  const backfill = async () => {
    const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/credit-ledger-grant-period.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const updates = sql
      .split(';')
      .map((st) => st.trim())
      .filter((st) => st.startsWith('UPDATE "CreditLedger"'));
    expect(updates.length, 'the backfill statements are gone from the migration').toBeGreaterThan(0);
    for (const st of updates) await prisma.$executeRawUnsafe(st);
  };

  it('credit-ledger-grant-period.sql: the backfill stamps old job rows only, once per month, and re-runs clean', async () => {
    expect(ready, skipReason).toBe(true);
    await prisma.creditLedger.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    await prisma.creditLedger.createMany({
      data: [
        // A retried old run: two rows in December; only the first is stamped.
        { id: `${RUN}-dec1`, tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-12-01T06:00:02Z') },
        { id: `${RUN}-dec2`, tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-12-01T06:00:09Z') },
        // November already has a stamped row: the old one stays NULL, no key clash.
        { id: `${RUN}-nov-old`, tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-11-01T06:00:03Z') },
        { id: `${RUN}-nov-new`, tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', refId: 'monthly_grant:2031-11', grantPeriod: '2031-11', createdAt: new Date('2031-11-01T06:00:05Z') },
        // The new job's own row after a rollback (DROP COLUMN) and re-apply:
        // its month comes back from the refId (İNCELEME-44 N-1).
        { id: `${RUN}-oct-new`, tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', refId: 'monthly_grant:2031-10', createdAt: new Date('2031-10-01T06:00:05Z') },
        // A month that is stamped already: the unstamped job row stays NULL
        // rather than clash with the key.
        { id: `${RUN}-oct-b-set`, tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', grantPeriod: '2031-10', createdAt: new Date('2031-10-01T06:00:03Z') },
        { id: `${RUN}-oct-b-new`, tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', refId: 'monthly_grant:2031-10', createdAt: new Date('2031-10-01T06:00:05Z') },
        // Both jobs granted August (the old one ran after a rollback): the
        // new job's row takes the month, the old one stays NULL.
        { id: `${RUN}-aug-b-old`, tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-08-01T06:00:03Z') },
        { id: `${RUN}-aug-b-new`, tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', refId: 'monthly_grant:2031-08', createdAt: new Date('2031-08-01T06:00:05Z') },
        // An activation grant: same reason, has a payment id, never stamped.
        { id: `${RUN}-pay`, tenantId: b.tenantId, delta: 10, reason: 'monthly_grant', refId: `${RUN}-pay`, createdAt: new Date('2031-12-03T10:00:00Z') },
      ],
    });
    const periods = async () =>
      Object.fromEntries(
        (
          await prisma.creditLedger.findMany({
            where: { id: { startsWith: RUN } },
            select: { id: true, grantPeriod: true },
          })
        ).map((r) => [r.id.slice(RUN.length + 1), r.grantPeriod])
      );
    const expected = { dec1: '2031-12', dec2: null, 'nov-old': null, 'nov-new': '2031-11', 'oct-new': '2031-10', 'oct-b-set': '2031-10', 'oct-b-new': null, 'aug-b-old': null, 'aug-b-new': '2031-08', pay: null };

    await backfill();
    expect(await periods()).toEqual(expected);
    await backfill();
    expect(await periods()).toEqual(expected);

    // The key now covers December: the new job's insert for it is a no-op.
    const { count } = await prisma.creditLedger.createMany({
      data: [{ tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', refId: 'monthly_grant:2031-12', grantPeriod: '2031-12' }],
      skipDuplicates: true,
    });
    expect(count).toBe(0);
  });

  it('credit-ledger-grant-period.sql: rollback, re-apply and a re-run of the same month add no second grant (İNCELEME-44 N-1)', async () => {
    expect(ready, skipReason).toBe(true);
    await prisma.creditLedger.deleteMany({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } });
    // September is the old Inngest job's, October the new job's own.
    await prisma.creditLedger.create({
      data: { tenantId: a.tenantId, delta: 10, reason: 'monthly_grant', createdAt: new Date('2031-09-01T06:00:03Z') },
    });
    const run: TenantRunner = (tenantId, cb) => withTenantOn(rls, tenantId, cb);
    expect(await grantCreditsToTenants([{ id: a.tenantId }], run, '2031-10')).toMatchObject({ grantedCount: 1 });

    // The header's rollback drops the column; re-applying adds it back empty.
    // What that leaves on these rows is every grantPeriod NULL.
    await prisma.$executeRaw`UPDATE "CreditLedger" SET "grantPeriod" = NULL WHERE "tenantId" = ${a.tenantId}`;
    await backfill();

    const stamped = await prisma.creditLedger.findMany({
      where: { tenantId: a.tenantId, reason: 'monthly_grant' },
      select: { grantPeriod: true },
    });
    expect(stamped.map((r) => r.grantPeriod).sort()).toEqual(['2031-09', '2031-10']);

    // The same month again: a manual enqueue, --force, a retry or two workers.
    const again = await grantCreditsToTenants([{ id: a.tenantId }], run, '2031-10');
    expect(again).toMatchObject({ grantedCount: 0, alreadyGrantedCount: 1, totalCreditsGranted: 0 });
    // The job's rows carry the run's clock, not the period, so count by refId.
    const october = await prisma.creditLedger.aggregate({
      where: { tenantId: a.tenantId, reason: 'monthly_grant', refId: 'monthly_grant:2031-10' },
      _sum: { delta: true },
    });
    expect(october._sum.delta).toBe(10);
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

  it('alerts-daily: every search advances lastRunAt under its own tenant', async (ctx) => {
    expect(ready, skipReason).toBe(true);

    await assertMatchesExist(ctx);
    const runner = recordingRunner();
    const mail = recordingMailer();
    const result = await sendSavedSearchAlerts(
      [rowFor(a, 'a'), rowFor(b, 'b')],
      runner.run,
      mail.send
    );

    expect(result.errors).toEqual([]);
    expect(result.emailsFailed).toBe(0);

    // Three scopes per search — the owner lookup, the notification write
    // (ADR-0011) and the `lastRunAt` write — and every one of them the tenant
    // of the search being processed. A run that reached for a stale id, or
    // skipped the wrapper, cannot produce this.
    expect(runner.scopes).toEqual([a.tenantId, a.tenantId, a.tenantId, b.tenantId, b.tenantId, b.tenantId]);
    // Each search's owner got one SAVED_SEARCH_MATCH, readable through RLS
    // under that tenant only.
    for (const [f, other] of [[a, b], [b, a]] as const) {
      const mine = await withTenantOn(rls, f.tenantId, (tx) =>
        tx.notification.findMany({ where: { userId: { in: [a.userId, b.userId] } }, select: { userId: true, type: true } })
      );
      expect(mine).toEqual([{ userId: f.userId, type: 'SAVED_SEARCH_MATCH' }]);
      expect(mine.some((n) => n.userId === other.userId)).toBe(false);
    }
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

  it('alerts-daily: a stale tenant id fails the search rather than touching the other tenant', async (ctx) => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist(ctx);
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

    // Search B is looked up under tenant A's scope: the search row itself is
    // invisible there, so it fails before it can mail or write anything —
    // rather than reading its owner's invisible membership as "left the
    // tenant" and quietly skipping.
    expect(result.emailsFailed).toBe(1);
    expect(result.emailsSkipped).toBe(0);
    expect(result.errors).toEqual([
      { searchId: b.searchId, reason: 'saved search not visible under its own tenant scope' },
    ]);

    expect((await lastRunOf(a.searchId))!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    expect(await lastRunOf(b.searchId)).toEqual(LONG_AGO);
  });

  // TASK-MUVSIO5F4TLHK (N-1): the test above proves the guard under RLS, where
  // the scope does the hiding. On a BYPASSRLS role the scope hides nothing, so
  // a row handed in with the wrong tenant would pass a guard keyed by id alone,
  // its owner's membership would not be found under that tenant, and the
  // search would be skipped as "the searcher left" instead of failing.
  it('alerts-daily: on a BYPASSRLS role, a row carrying the wrong tenant still fails the search', async (ctx) => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist(ctx);
    await resetLastRun();

    const [role] = await prisma.$queryRawUnsafe<Array<{ rolbypassrls: boolean; rolsuper: boolean }>>(
      'select rolbypassrls, rolsuper from pg_roles where rolname = current_user'
    );
    if (!role?.rolbypassrls && !role?.rolsuper) {
      const reason = 'the privileged client does not bypass RLS here, so there is nothing for this case to measure';
      if (isCi()) {
        throw new Error(`alerts-daily BYPASSRLS role test: refusing to skip in CI — ${reason} ("Prepare database" in ci.yml does).`);
      }
      console.warn(`alerts-daily BYPASSRLS role test skipped: ${reason}`);
      ctx.skip(reason);
    }

    // Honest runner (scope = the tenant it was given) over the bypassing role;
    // the mismatch is in the row: search B, handed in as tenant A's.
    const bypass: TenantRunner = (tenantId, callback) => withTenantOn(prisma, tenantId, callback);
    const mail = recordingMailer();
    const result = await sendSavedSearchAlerts([{ ...rowFor(b, 'b'), tenantId: a.tenantId }], bypass, mail.send);

    expect(mail.sent).toEqual([]);
    expect(result.emailsSkipped).toBe(0);
    expect(result.emailsFailed).toBe(1);
    expect(result.errors).toEqual([
      { searchId: b.searchId, reason: 'saved search not visible under its own tenant scope' },
    ]);
    expect(await lastRunOf(b.searchId)).toEqual(LONG_AGO);
  });

  // TASK-MUVRYPO9GTU7D: the mail used to go to the tenant's first owner
  // whoever's search it was, carrying the searcher's free-text name.
  it("alerts-daily: mails the search's own owner, and no one once they have left the tenant", async (ctx) => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist(ctx);

    const member = await prisma.user.create({ data: { email: `${RUN}-member@example.invalid`, name: 'Member' } });
    const leaver = await prisma.user.create({ data: { email: `${RUN}-leaver@example.invalid`, name: 'Leaver' } });
    extraEmails.push(member.email, leaver.email);
    await prisma.membership.create({ data: { tenantId: a.tenantId, userId: member.id, role: 'MEMBER' } });
    // `leaver` has no membership: removing a member leaves their searches behind.
    const searchOf = (userId: string, label: string) =>
      prisma.savedSearch.create({
        data: { tenantId: a.tenantId, userId, name: `${label} ${RUN}`, filters: {}, notify: true, lastRunAt: LONG_AGO },
      });
    const mine = await searchOf(member.id, 'member');
    const orphan = await searchOf(leaver.id, 'leaver');
    const row = (s: { id: string; userId: string; name: string }): SavedSearchAlertRow => ({
      id: s.id,
      tenantId: a.tenantId,
      userId: s.userId,
      name: s.name,
      filters: {},
      lastRunAt: LONG_AGO,
      createdAt: LONG_AGO,
    });

    const mail = recordingMailer();
    const result = await sendSavedSearchAlerts([row(mine), row(orphan)], recordingRunner().run, mail.send);

    expect(result.errors).toEqual([]);
    expect(mail.sent.map((m) => m.to)).toEqual([member.email]);
    expect(mail.sent.map((m) => m.to)).not.toContain(a.email);
    expect(result).toMatchObject({ emailsSent: 1, emailsSkipped: 1, emailsFailed: 0 });
    // Checked, not failed: the orphan does not come back every morning.
    expect((await lastRunOf(orphan.id))!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
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
  it('alerts-daily: with no mail provider, nothing is counted sent and lastRunAt stays put', async (ctx) => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist(ctx);
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
    // Owner lookup and notification write (ADR-0011: the notification does
    // not need a mail provider) — no `lastRunAt` write was attempted for either.
    expect(runner.scopes).toEqual([a.tenantId, a.tenantId, b.tenantId, b.tenantId]);
    expect(await lastRunOf(a.searchId)).toEqual(LONG_AGO);
    expect(await lastRunOf(b.searchId)).toEqual(LONG_AGO);
  });

  it('alerts-daily: a send the provider refuses fails that search and keeps its matches', async (ctx) => {
    expect(ready, skipReason).toBe(true);
    await assertMatchesExist(ctx);
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
