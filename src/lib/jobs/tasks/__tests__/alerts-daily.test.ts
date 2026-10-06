import { describe, it, expect } from 'vitest';
import { createDbClient } from '@/lib/db';
import {
  NO_MAIL_PROVIDER,
  SAVED_SEARCH_ALERT_QUERY,
  alertsRunReport,
  matchCountQuery,
  recipientEmailQuery,
  renderSavedSearchAlert,
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

  it('accepts the recipient lookup keyed by the scalar tenantId and userId', async () => {
    const kind = await rejectionKind(() => db.membership.findFirst(recipientEmailQuery('tenant:1', 'user:1')));

    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('selects what the match-count query and the notification need, and no relation', () => {
    expect(SAVED_SEARCH_ALERT_QUERY.select).toEqual({
      id: true,
      tenantId: true,
      // ADR-0011 K-6 a: the notification's recipient is the search's owner.
      userId: true,
      name: true,
      filters: true,
      lastRunAt: true,
      createdAt: true,
    });
    expect(SAVED_SEARCH_ALERT_QUERY).not.toHaveProperty('include');
  });

  // TASK-MUVRYPO9GTU7D: the search's own owner, and only through a membership
  // of this tenant — never the tenant's first TENANT_OWNER.
  it("mails the search's owner while a member of this tenant, reading only the address", () => {
    expect(recipientEmailQuery('tenant:1', 'user:1')).toEqual({
      where: { tenantId: 'tenant:1', userId: 'user:1' },
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
    expect(alert?.message).toMatch(/SMTP_HOST unset/);
    // No key may contain "email": recordAlert would strip it as PII.
    expect(Object.keys(alert?.meta ?? {}).filter((k) => /email/i.test(k))).toEqual([]);
    expect(alert?.meta).toMatchObject({ sent: 0, failed: 1 });
  });

  it('any other per-search failure still fails the run, at warn level', () => {
    const { output, alert } = alertsRunReport(
      { emailsSent: 1, emailsFailed: 1, emailsSkipped: 0, errors: [{ searchId: 'ss_2', reason: 'smtp:EENVELOPE:550' }] },
      2
    );
    expect(output.success).toBe(false);
    expect(output.reason).toBe('send_failed');
    expect(alert?.level).toBe('warn');
  });
});

// TASK-MUVRYPO9GTU7D: the search name is the searcher's free text.
describe('alerts-daily mail rendering', () => {
  const base = { matchCount: 3, searchId: 'ss_1', appUrl: 'https://app.example.invalid' };

  it('escapes a link and an onerror image in the name instead of rendering them', () => {
    const name = '<a href="https://evil.example/verify">Hesabınızı doğrulayın</a><img src=x onerror="alert(1)">';
    const { html } = renderSavedSearchAlert({ ...base, name });

    expect(html).not.toContain('<a href="https://evil.example');
    expect(html).not.toContain('<img');
    expect(html).toContain(
      '<strong>&lt;a href=&quot;https://evil.example/verify&quot;&gt;Hesabınızı doğrulayın&lt;/a&gt;' +
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</strong>'
    );
    // The one real link is still the app's own.
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="https://app.example.invalid/calls?search=ss_1">');
  });

  it('keeps the name on one Subject line: no CR, LF or other control characters', () => {
    const name = 'Quantum\r\nBcc: victim@example.invalid\u0000\u0085\u2028x\ty';
    const { subject } = renderSavedSearchAlert({ ...base, name });

    expect(subject).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    expect(subject).toBe('New Call Opportunities: Quantum Bcc: victim@example.invalid x y (3 new)');
  });

  // TASK-MUVSIO5F4TLHK (N-2): each separator alone, so the regex losing either
  // one leaves it in the Subject instead of hiding behind a neighbour.
  it.each([
    ['U+2028 line separator', '\u2028'],
    ['U+2029 paragraph separator', '\u2029'],
  ])('replaces a %s in the name with a space', (_label, separator) => {
    const { subject } = renderSavedSearchAlert({ ...base, name: `Quantum${separator}Bcc: x@example.invalid` });

    expect(subject).not.toContain(separator);
    expect(subject).toBe('New Call Opportunities: Quantum Bcc: x@example.invalid (3 new)');
  });

  // TASK-MUVSIO5F4TLHK (se-fb N-2): `appUrl` comes from env and `searchId` is
  // encoded, so this is defence in depth — but without it nothing failed when
  // the href escape was removed.
  it('escapes the app URL inside the href attribute', () => {
    const { html } = renderSavedSearchAlert({
      ...base,
      name: 'x',
      appUrl: 'https://app.example.invalid/" onmouseover="alert(1)',
    });

    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain(
      '<a href="https://app.example.invalid/&quot; onmouseover=&quot;alert(1)/calls?search=ss_1">'
    );
  });

  it('leaves an ordinary Turkish name as it is', () => {
    const { subject, html } = renderSavedSearchAlert({ ...base, name: 'Yeşil dönüşüm & iklim' });
    expect(subject).toBe('New Call Opportunities: Yeşil dönüşüm & iklim (3 new)');
    expect(html).toContain('<strong>Yeşil dönüşüm &amp; iklim</strong>');
  });
});
