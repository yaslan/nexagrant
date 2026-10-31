import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// The only recordAlert call the digest makes is the `warn` on a failed send; record it.
const recorded: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/system-alert')>()),
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    recorded.push(a);
    return { status: 'recorded' };
  }),
}));

const {
  runAlertsOpsDigest,
  needsDigest,
  groupAlerts,
  renderOpsDigest,
  resetOpsDigestWarnings,
  REPEAT_DIGEST_STEP,
  OPS_DIGEST_SOURCE,
  CANDIDATE_LIMIT,
} = await import('../alerts-ops-digest');
const { MailSendError } = await import('@/lib/email/mailer');
const { alertIdentity, buildAlertRow, ALERT_DIGESTED_AT_KEY, ALERT_DIGESTED_COUNT_KEY } = await import(
  '../system-alert'
);
const { alertsOpsDigestTask } = await import('@/lib/jobs/tasks/alerts-ops-digest');

type Row = { id: string; source: string; level: string; meta: unknown; createdAt: Date; resolvedAt: Date | null };

/**
 * An in-memory SystemAlert table that honours the DigestDbClient contract:
 * `findPending` applies the pending test BEFORE the limit (what the SQL does),
 * `stamp` merges two keys into the row's CURRENT meta (what the jsonb `||` does).
 * The SQL itself is exercised by tests/alerts-ops-digest.live.test.ts.
 */
function fakeDb(rows: Row[]) {
  const stamp = vi.fn(async ({ id, at, count }: { id: string; at: Date; count: number }) => {
    const r = rows.find((x) => x.id === id)!;
    r.meta = { ...(r.meta as Record<string, unknown> | null), [ALERT_DIGESTED_AT_KEY]: at.toISOString(), [ALERT_DIGESTED_COUNT_KEY]: count };
  });
  const findPending = vi.fn(async (args: { limit: number; excludeSource: string }) =>
    rows
      .filter((r) => r.level === 'error' && r.resolvedAt === null && r.source !== args.excludeSource && needsDigest(r))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, args.limit)
      .map((r) => ({ ...r, meta: structuredClone(r.meta) })) // a query returns a snapshot, not live rows
  );
  return { rows, stamp, findPending, db: { findPending, stamp } };
}

const row = (over: Partial<Row> & { id: string }): Row => ({
  source: 'job-queue',
  level: 'error',
  meta: null,
  createdAt: new Date('2026-10-30T05:00:00Z'),
  resolvedAt: null,
  ...over,
});

const NOW = new Date('2026-10-30T08:20:00Z');
const base = { recipient: 'ops@example.com', now: NOW, consoleUrl: 'https://nexagrant.com/tr/admin/alerts' };

beforeEach(() => {
  recorded.length = 0;
  resetOpsDigestWarnings();
  vi.restoreAllMocks();
});

describe('alerts-ops-digest', () => {
  it('sends nothing when there are no open error alerts', async () => {
    const t = fakeDb([row({ id: 'w', level: 'warn' }), row({ id: 'r', resolvedAt: new Date() })]);
    const mailer = vi.fn(async () => {});
    const result = await runAlertsOpsDigest({ ...base, db: t.db, mailer });
    expect(result).toEqual({ outcome: 'nothing_new', alerts: 0, stampFailures: 0 });
    expect(mailer).not.toHaveBeenCalled();
    expect(t.stamp).not.toHaveBeenCalled();
  });

  it('mails one summary for new error alerts and stamps each row', async () => {
    const t = fakeDb([
      row({ id: 'a', source: 'job-queue', meta: { alertRepeatCount: 4, alertLastSeenAt: '2026-10-30T07:00:00.000Z' } }),
      row({ id: 'b', source: 'mail', createdAt: new Date('2026-10-30T06:00:00Z') }),
      row({ id: 'c', source: 'job-queue', createdAt: new Date('2026-10-30T04:00:00Z') }),
    ]);
    const sent: Array<{ to: string; subject: string; html: string }> = [];
    const result = await runAlertsOpsDigest({ ...base, db: t.db, mailer: async (m) => void sent.push(m) });

    expect(result).toEqual({ outcome: 'sent', alerts: 3, stampFailures: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ops@example.com');
    expect(sent[0]!.subject).toBe('[FonBridge] 3 open error alerts to review');
    expect(sent[0]!.html).toContain('job-queue');
    expect(sent[0]!.html).toContain('https://nexagrant.com/tr/admin/alerts');
    // job-queue: 2 alerts standing for 4 + 1 occurrences, first seen 04:00.
    expect(groupAlerts(t.rows)[0]).toMatchObject({
      source: 'job-queue',
      alerts: 2,
      occurrences: 5,
      firstSeen: new Date('2026-10-30T04:00:00Z'),
      lastSeen: new Date('2026-10-30T07:00:00.000Z'),
    });
    for (const r of t.rows) {
      expect((r.meta as Record<string, unknown>)[ALERT_DIGESTED_AT_KEY]).toBe(NOW.toISOString());
    }
    // The stamp keeps the counter the row already had.
    expect((t.rows[0]!.meta as Record<string, unknown>).alertRepeatCount).toBe(4);
    expect((t.rows[0]!.meta as Record<string, unknown>)[ALERT_DIGESTED_COUNT_KEY]).toBe(4);
  });

  it('does not mail the same alerts twice', async () => {
    const t = fakeDb([row({ id: 'a' }), row({ id: 'b', source: 'mail' })]);
    const mailer = vi.fn(async () => {});
    await runAlertsOpsDigest({ ...base, db: t.db, mailer });
    const second = await runAlertsOpsDigest({ ...base, db: t.db, mailer });
    expect(second.outcome).toBe('nothing_new');
    expect(mailer).toHaveBeenCalledTimes(1);
  });

  it('mails a digested alert again only once its repeat counter grew by the step, and only that one', async () => {
    const t = fakeDb([row({ id: 'a' }), row({ id: 'b', source: 'mail' })]);
    const sent: Array<{ html: string }> = [];
    const mailer = async (m: { html: string }) => void sent.push(m);
    await runAlertsOpsDigest({ ...base, db: t.db, mailer });

    (t.rows[0]!.meta as Record<string, unknown>).alertRepeatCount = REPEAT_DIGEST_STEP; // 1 -> 10: below 1 + 10
    expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer })).outcome).toBe('nothing_new');

    (t.rows[0]!.meta as Record<string, unknown>).alertRepeatCount = 1 + REPEAT_DIGEST_STEP;
    const third = await runAlertsOpsDigest({ ...base, db: t.db, mailer });
    expect(third).toEqual({ outcome: 'sent', alerts: 1, stampFailures: 0 });
    expect(sent).toHaveLength(2);
    expect(sent[1]!.html).toContain('job-queue');
    expect(sent[1]!.html).not.toContain('>mail<');
    // ...and it is quiet again until the next step.
    expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer })).outcome).toBe('nothing_new');
  });

  it('a stamped row still has the identity of the next plain occurrence (dedup is not broken)', () => {
    const plain = buildAlertRow({ level: 'error', source: 'job-queue', message: 'boom', meta: { job: 'x' } });
    const stamped = {
      ...plain,
      meta: { ...plain.meta, alertRepeatCount: 3, [ALERT_DIGESTED_AT_KEY]: NOW.toISOString(), [ALERT_DIGESTED_COUNT_KEY]: 3 },
    };
    expect(alertIdentity(stamped)).toBe(alertIdentity(plain));
    // And a caller cannot forge the stamp to hide an alert from the digest.
    const forged = buildAlertRow({
      level: 'error',
      source: 's',
      message: 'm',
      meta: { [ALERT_DIGESTED_AT_KEY]: NOW.toISOString() },
    });
    expect(needsDigest({ meta: forged.meta })).toBe(true);
  });

  it('skips quietly, once, when ALERTS_OPS_EMAIL is unset', async () => {
    const t = fakeDb([row({ id: 'a' })]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mailer = vi.fn(async () => {});
    for (let i = 0; i < 3; i++) {
      expect((await runAlertsOpsDigest({ ...base, recipient: undefined, db: t.db, mailer })).outcome).toBe('no_recipient');
    }
    expect(mailer).not.toHaveBeenCalled();
    expect(t.findPending).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('ALERTS_OPS_EMAIL');
    expect(recorded).toEqual([]);
  });

  it('leaves rows unstamped when there is no mail provider, so a later run sends them', async () => {
    const t = fakeDb([row({ id: 'a' })]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer: null })).outcome).toBe('no_mail_provider');
    expect(t.stamp).not.toHaveBeenCalled();
    const mailer = vi.fn(async () => {});
    expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer })).outcome).toBe('sent');
  });

  it('an SMTP failure does not throw, writes no error alert, leaves rows unstamped and is retried next run', async () => {
    const t = fakeDb([row({ id: 'a' })]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = async () => {
      throw new MailSendError('ECONNECTION', null);
    };
    const result = await runAlertsOpsDigest({ ...base, db: t.db, mailer: failing });
    expect(result).toEqual({ outcome: 'send_failed', alerts: 0, stampFailures: 0 });
    expect(t.stamp).not.toHaveBeenCalled();
    // The failure is visible as a warn that the digest itself never selects.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ level: 'warn', source: OPS_DIGEST_SOURCE, meta: { reason: 'smtp:ECONNECTION' } });
    // A raw, non-MailSendError message (could quote the server) is not copied anywhere.
    const leaky = async () => {
      throw new Error('550 5.1.1 <someone@private.example>: user unknown');
    };
    await runAlertsOpsDigest({ ...base, db: t.db, mailer: leaky });
    expect(JSON.stringify(recorded)).not.toContain('private.example');
    // No error-level row exists, so the next digest cannot pick up its own failure.
    expect(recorded.every((r) => r.level !== 'error')).toBe(true);
    // Provider recovers: the same row goes out.
    const ok = vi.fn(async () => {});
    expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer: ok })).alerts).toBe(1);
  });

  it('never selects its own alerts', async () => {
    const t = fakeDb([row({ id: 'own', source: OPS_DIGEST_SOURCE })]);
    const mailer = vi.fn(async () => {});
    expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer })).outcome).toBe('nothing_new');
    expect(mailer).not.toHaveBeenCalled();
  });

  it('a stamp that fails after the send is counted, not thrown', async () => {
    const t = fakeDb([row({ id: 'a' })]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t.stamp.mockRejectedValueOnce(new Error('db down'));
    const result = await runAlertsOpsDigest({ ...base, db: t.db, mailer: async () => {} });
    expect(result).toEqual({ outcome: 'sent', alerts: 1, stampFailures: 1 });
  });
});

describe('alerts-ops-digest — pending selection and the stamp (FO-290)', () => {
  it('asks the database for pending rows with the limit, and excludes its own source', async () => {
    const t = fakeDb([row({ id: 'a' })]);
    await runAlertsOpsDigest({ ...base, db: t.db, mailer: async () => {} });
    expect(t.findPending).toHaveBeenCalledWith({ limit: CANDIDATE_LIMIT, excludeSource: OPS_DIGEST_SOURCE });
  });

  it('Y1: an old unstamped row is mailed even when more than the limit of newer rows are already stamped', async () => {
    const stamped = Array.from({ length: CANDIDATE_LIMIT + 5 }, (_, i) =>
      row({
        id: `s${i}`,
        source: 'noisy',
        createdAt: new Date(Date.UTC(2026, 9, 30, 6, 0, 0) + i * 1000),
        meta: { alertRepeatCount: 1, [ALERT_DIGESTED_AT_KEY]: NOW.toISOString(), [ALERT_DIGESTED_COUNT_KEY]: 1 },
      })
    );
    const old = row({ id: 'old', source: 'forgotten', createdAt: new Date('2026-10-01T00:00:00Z') });
    const t = fakeDb([...stamped, old]);
    const sent: Array<{ html: string }> = [];
    const result = await runAlertsOpsDigest({ ...base, db: t.db, mailer: async (m) => void sent.push(m) });
    expect(result).toEqual({ outcome: 'sent', alerts: 1, stampFailures: 0 });
    expect(sent[0]!.html).toContain('forgotten');
    expect(sent[0]!.html).not.toContain('noisy');
  });

  it('warns when the pending limit is hit, mails that batch, and the next run reaches the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: CANDIDATE_LIMIT + 3 }, (_, i) =>
      row({ id: `p${i}`, createdAt: new Date(Date.UTC(2026, 9, 30, 0, 0, 0) + i * 1000) })
    );
    const t = fakeDb(many);
    const first = await runAlertsOpsDigest({ ...base, db: t.db, mailer: async () => {} });
    expect(first.alerts).toBe(CANDIDATE_LIMIT);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('limit reached'))).toBe(true);
    const second = await runAlertsOpsDigest({ ...base, db: t.db, mailer: async () => {} });
    expect(second).toEqual({ outcome: 'sent', alerts: 3, stampFailures: 0 });
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('limit reached'))).toHaveLength(1);
  });

  it('Y2: a repeat that lands between the select and the stamp is not undone; the stamp carries the mailed count', async () => {
    const t = fakeDb([row({ id: 'a', meta: { alertRepeatCount: 5, alertLastSeenAt: '2026-10-30T07:00:00.000Z' } })]);
    const mailer = async () => {
      // recordAlert's dedupe branch, mid-run: 5 -> 6.
      t.rows[0]!.meta = { ...(t.rows[0]!.meta as object), alertRepeatCount: 6, alertLastSeenAt: '2026-10-30T08:19:00.000Z' };
    };
    await runAlertsOpsDigest({ ...base, db: t.db, mailer });
    const meta = t.rows[0]!.meta as Record<string, unknown>;
    expect(meta.alertRepeatCount).toBe(6);
    expect(meta.alertLastSeenAt).toBe('2026-10-30T08:19:00.000Z');
    expect(meta[ALERT_DIGESTED_COUNT_KEY]).toBe(5);
    expect(meta[ALERT_DIGESTED_AT_KEY]).toBe(NOW.toISOString());
  });

  it('warns about a missing mail provider once, not every run', async () => {
    const t = fakeDb([row({ id: 'a' })]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 3; i++) {
      expect((await runAlertsOpsDigest({ ...base, db: t.db, mailer: null })).outcome).toBe('no_mail_provider');
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('SMTP_HOST'))).toHaveLength(1);
  });
});

describe('renderOpsDigest', () => {
  it('carries source, level, counts, first/last seen and the link; never message or meta', () => {
    const rows = [
      { id: 'a', source: 'job-queue', level: 'error', createdAt: new Date('2026-10-30T01:00:00Z'), meta: { alertRepeatCount: 3 } },
    ];
    const { subject, html } = renderOpsDigest({
      groups: groupAlerts(rows),
      alertCount: 1,
      consoleUrl: 'https://nexagrant.com/tr/admin/alerts',
    });
    expect(subject).toBe('[FonBridge] 1 open error alert to review');
    for (const part of ['job-queue', 'error', '2026-10-30T01:00:00.000Z', 'https://nexagrant.com/tr/admin/alerts']) {
      expect(html).toContain(part);
    }
    expect(html).not.toMatch(/@[a-z0-9-]+\.[a-z]/i); // no e-mail address of anyone
  });

  it('escapes a source name and lists at most 25 groups', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      source: i === 0 ? '<img src=x onerror=1>' : `src-${i}`,
      level: 'error',
      createdAt: new Date('2026-10-30T01:00:00Z'),
      meta: null,
    }));
    const { html } = renderOpsDigest({ groups: groupAlerts(rows), alertCount: 30, consoleUrl: 'https://nexagrant.com/tr/admin/alerts' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('and 5 more sources');
  });
});

describe('alerts-ops-digest job', () => {
  it('is a registered graphile task that skips (success) without a recipient', async () => {
    const noop = () => {};
    const helpers = {
      job: { id: '1', attempts: 1, max_attempts: 3 },
      logger: { info: noop, warn: noop, error: noop, debug: noop },
    } as unknown as JobHelpers;
    // vitest.setup leaves ALERTS_OPS_EMAIL unset, so the run is the "no recipient" branch.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(alertsOpsDigestTask({}, helpers)).resolves.toBeUndefined();
  });
});
