import { describe, it, expect } from 'vitest';
import { createDbClient } from '@/lib/db';
import {
  NO_MAIL_PROVIDER,
  SAVED_SEARCH_ALERT_QUERY,
  alertsRunReport,
  matchCountQuery,
  ownerEmailQuery,
} from '../alerts-daily';

/**
 * These assertions run against the REAL generated Prisma client, not a mock.
 *
 * That is the whole point. The bug this file locks down — `alerts-daily`
 * asking for `include: { tenant: true }` on a `SavedSearch` that has no
 * `tenant` relation — killed every 8 AM run with a PrismaClientValidationError,
 * and a mocked client would have happily accepted the same arguments and
 * reported green.
 *
 * No database is needed: Prisma validates arguments client-side, before the
 * connection is used. So an *invalid* query rejects with
 * PrismaClientValidationError, while a *valid* one gets as far as the wire and
 * rejects with a connection error instead. The port below is closed on purpose.
 */
const UNREACHABLE_DB = 'postgresql://nobody:nobody@127.0.0.1:1/does-not-exist';

/** Resolves to the error class name Prisma rejected the arguments with. */
async function rejectionKind(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'none';
  } catch (error) {
    return (error as object).constructor.name;
  }
}

describe('alerts-daily query contract', () => {
  const db = createDbClient(UNREACHABLE_DB);

  it('accepts the saved-search query — no relation is included', async () => {
    const kind = await rejectionKind(() => db.savedSearch.findMany(SAVED_SEARCH_ALERT_QUERY));

    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('still rejects the include that broke the job — the guard can see a regression', async () => {
    const kind = await rejectionKind(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.savedSearch.findMany({ where: { notify: true }, include: { tenant: true } } as any)
    );

    expect(kind).toBe('PrismaClientValidationError');
  });

  it('accepts the owner lookup keyed by the scalar tenantId', async () => {
    const kind = await rejectionKind(() => db.membership.findMany(ownerEmailQuery('tenant:1')));

    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('selects what the match-count query needs, and no relation', () => {
    expect(SAVED_SEARCH_ALERT_QUERY.select).toEqual({
      id: true,
      tenantId: true,
      name: true,
      filters: true,
      lastRunAt: true,
      createdAt: true,
    });
    expect(SAVED_SEARCH_ALERT_QUERY).not.toHaveProperty('include');
  });

  it('reads only the owner address, not the whole user row', () => {
    expect(ownerEmailQuery('tenant:1')).toEqual({
      where: { tenantId: 'tenant:1', role: 'TENANT_OWNER' },
      select: { user: { select: { email: true } } },
    });
  });
});

describe('alerts-daily match-count query', () => {
  const db = createDbClient(UNREACHABLE_DB);
  const since = new Date('2026-09-01T00:00:00Z');

  it('accepts the plain since-only query — no filter fields', async () => {
    const kind = await rejectionKind(() => db.topic.count(matchCountQuery(undefined, since)));
    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('accepts the query narrowed by q and status', async () => {
    const args = matchCountQuery({ q: 'quantum', status: ['OPEN', 'FORTHCOMING'] }, since);
    const kind = await rejectionKind(() => db.topic.count(args));
    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('treats a malformed filters value as no filter, not a crash', () => {
    expect(matchCountQuery('not-an-object', since)).toEqual({ where: { fetchedAt: { gt: since } } });
    expect(matchCountQuery({ status: [] }, since)).toEqual({ where: { fetchedAt: { gt: since } } });
  });

  it('builds the text and status constraints only when the filters carry them', () => {
    expect(matchCountQuery({ q: 'quantum' }, since)).toEqual({
      where: {
        fetchedAt: { gt: since },
        OR: [
          { title: { contains: 'quantum', mode: 'insensitive' } },
          { description: { contains: 'quantum', mode: 'insensitive' } },
        ],
      },
    });
    expect(matchCountQuery({ status: ['OPEN'] }, since)).toEqual({
      where: { fetchedAt: { gt: since }, status: { in: ['OPEN'] } },
    });
  });
});

describe('alerts-daily run report (TASK-MUMH6NZ128QZ1)', () => {
  it('a clean run is a success and raises no alert', () => {
    const { output, alert } = alertsRunReport(
      { emailsSent: 2, emailsFailed: 0, emailsSkipped: 1, errors: [] },
      3
    );
    expect(output).toEqual({
      success: true,
      totalSearches: 3,
      emailsSent: 2,
      emailsFailed: 0,
      emailsSkipped: 1,
    });
    expect(alert).toBeNull();
  });

  it('no mail provider fails the run with its reason and an error-level alert', () => {
    const errors = [{ searchId: 'ss_1', reason: NO_MAIL_PROVIDER }];
    const { output, alert } = alertsRunReport(
      { emailsSent: 0, emailsFailed: 1, emailsSkipped: 0, errors },
      1
    );
    expect(output.success).toBe(false);
    expect(output.reason).toBe(NO_MAIL_PROVIDER);
    expect(output.emailsSent).toBe(0);
    expect(output.errors).toEqual(errors);
    expect(alert?.level).toBe('error');
    expect(alert?.message).toMatch(/RESEND_API_KEY unset/);
    // No key may contain "email": recordAlert would strip it as PII.
    expect(Object.keys(alert?.meta ?? {}).filter((k) => /email/i.test(k))).toEqual([]);
    expect(alert?.meta).toMatchObject({ sent: 0, failed: 1 });
  });

  it('any other per-search failure still fails the run, at warn level', () => {
    const { output, alert } = alertsRunReport(
      { emailsSent: 1, emailsFailed: 1, emailsSkipped: 0, errors: [{ searchId: 'ss_2', reason: 'no_owner_email' }] },
      2
    );
    expect(output.success).toBe(false);
    expect(output.reason).toBe('send_failed');
    expect(alert?.level).toBe('warn');
  });
});
