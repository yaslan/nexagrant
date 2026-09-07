import { describe, it, expect } from 'vitest';
import { createDbClient } from '@/lib/db';
import { SAVED_SEARCH_ALERT_QUERY, ownerEmailQuery } from '../alerts-daily';

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

  it('selects the tenantId the owner lookup needs, and no relation', () => {
    expect(SAVED_SEARCH_ALERT_QUERY.select).toEqual({ id: true, tenantId: true, name: true });
    expect(SAVED_SEARCH_ALERT_QUERY).not.toHaveProperty('include');
  });

  it('reads only the owner address, not the whole user row', () => {
    expect(ownerEmailQuery('tenant:1')).toEqual({
      where: { tenantId: 'tenant:1', role: 'TENANT_OWNER' },
      select: { user: { select: { email: true } } },
    });
  });
});
