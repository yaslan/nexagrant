import { beforeEach, describe, expect, it, vi } from 'vitest';

const alerts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: Record<string, unknown>) => {
    alerts.push(a);
  }),
}));
const notConfigured = vi.fn(async () => {});
vi.mock('@/lib/email/mailer', () => ({ smtpMailer: () => null, reportMailNotConfigured: notConfigured }));

const { runNotificationEmailOutbox } = await import('./run-email-outbox');

const ok = { mode: 'INSTANT' as const, recipients: 1, mailsSent: 1, itemsSent: 1, itemsDropped: 0, failures: 0, claimLost: 0 };
const mailer = async () => {};

beforeEach(() => {
  alerts.length = 0;
  notConfigured.mockClear();
});

describe('runNotificationEmailOutbox (NG-131)', () => {
  it('a clean run writes no alert', async () => {
    const r = await runNotificationEmailOutbox({ mode: 'INSTANT', mailer, send: async () => ok });
    expect(r).toEqual(ok);
    expect(alerts).toEqual([]);
  });

  it('failures > 0 writes a warn SystemAlert with counts only', async () => {
    await runNotificationEmailOutbox({ mode: 'WEEKLY', mailer, send: async () => ({ ...ok, mode: 'WEEKLY', failures: 2 }) });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      level: 'warn',
      source: 'notification-email-weekly',
      dedupeKey: 'notification-email-weekly:failed',
      meta: { mode: 'WEEKLY', failures: 2 },
    });
  });

  it('an exception writes an error SystemAlert and is rethrown for the queue retry', async () => {
    await expect(
      runNotificationEmailOutbox({ mode: 'INSTANT', mailer, send: async () => Promise.reject(new Error('db gone')) })
    ).rejects.toThrow('db gone');
    expect(alerts).toEqual([
      { level: 'error', source: 'notification-email-instant', message: 'Notification e-mail run failed: db gone', meta: { mode: 'INSTANT' } },
    ]);
  });

  it('no SMTP: reported, nothing sent', async () => {
    const send = vi.fn();
    const r = await runNotificationEmailOutbox({ mode: 'INSTANT', mailer: null, send });
    expect(r).toEqual({ mode: 'INSTANT', skipped: 'smtp-not-configured' });
    expect(send).not.toHaveBeenCalled();
    expect(notConfigured).toHaveBeenCalledWith('notification-email-instant');
  });
});
