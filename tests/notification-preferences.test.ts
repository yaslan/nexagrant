import { describe, expect, test, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import tr from '../messages/tr.json';
import en from '../messages/en.json';
import { NOTIFICATION_EVENTS, NOTIFICATION_TYPE_EVENT, eventOfType } from '@/lib/notifications/events';
import {
  DEFAULT_FREQUENCY,
  PreferenceInputSchema,
  deliveryForType,
  resolveDelivery,
  type PreferenceRow,
} from '@/lib/notifications/preferences';
import { renderDigestMail, renderInstantMail, sendNotificationEmails, type OutboxItem } from '@/lib/notifications/email-outbox';
import type { SystemTx } from '@/lib/system-scope';
import type { TenantTx } from '@/lib/db';
import type { NotificationTranslator } from '@/lib/notifications/render';

/**
 * NG-43 — the pure half of the notification centre's channel and frequency
 * choice (spec §13). The database half is tests/notification-preferences.live.test.ts.
 */

function translator(locale: 'tr' | 'en'): NotificationTranslator {
  const t = createTranslator({ locale, messages: locale === 'tr' ? tr : en, namespace: 'Notifications' });
  return t as unknown as NotificationTranslator;
}

describe('§13 event list', () => {
  test('is the spec list: nine events, in the spec order', () => {
    expect(NOTIFICATION_EVENTS).toEqual([
      'NEW_MATCHING_CALL',
      'CALL_CHANGED',
      'OUTREACH_REPLY',
      'CONTRIBUTION_OVERDUE',
      'APPROVAL_OVERDUE',
      'BUDGET_DEVIATION',
      'TASK_COLOR_CHANGED',
      'REPORT_DUE',
      'OBLIGATION_REMINDER',
    ]);
  });

  test('every stored type maps onto a §13 event or is explicitly outside it', () => {
    expect(NOTIFICATION_TYPE_EVENT).toEqual({
      SAVED_SEARCH_MATCH: 'NEW_MATCHING_CALL',
      CREDIT_GRANTED: null,
      CREDIT_EXHAUSTED: null,
      EVIDENCE_EXPIRING: 'OBLIGATION_REMINDER',
    });
    for (const event of Object.values(NOTIFICATION_TYPE_EVENT)) {
      if (event !== null) expect(NOTIFICATION_EVENTS).toContain(event);
    }
  });
});

describe('resolveDelivery: a changed preference changes the channel', () => {
  test('no row: panel INSTANT, e-mail OFF', () => {
    expect(resolveDelivery([], 'NEW_MATCHING_CALL')).toEqual({ PANEL: 'INSTANT', EMAIL: 'OFF' });
    expect(DEFAULT_FREQUENCY).toEqual({ PANEL: 'INSTANT', EMAIL: 'OFF' });
  });

  test('panel OFF + e-mail INSTANT moves the event from the bell to the mail', () => {
    const rows: PreferenceRow[] = [
      { event: 'NEW_MATCHING_CALL', channel: 'PANEL', frequency: 'OFF' },
      { event: 'NEW_MATCHING_CALL', channel: 'EMAIL', frequency: 'INSTANT' },
    ];
    expect(resolveDelivery(rows, 'NEW_MATCHING_CALL')).toEqual({ PANEL: 'OFF', EMAIL: 'INSTANT' });
    // Another event of the same user keeps the default.
    expect(resolveDelivery(rows, 'REPORT_DUE')).toEqual({ PANEL: 'INSTANT', EMAIL: 'OFF' });
  });

  test('weekly summary and instant alert are set separately', () => {
    const rows: PreferenceRow[] = [{ event: 'OBLIGATION_REMINDER', channel: 'EMAIL', frequency: 'WEEKLY' }];
    expect(deliveryForType(rows, 'EVIDENCE_EXPIRING')).toEqual({ PANEL: 'INSTANT', EMAIL: 'WEEKLY' });
    expect(deliveryForType(rows, 'SAVED_SEARCH_MATCH')).toEqual({ PANEL: 'INSTANT', EMAIL: 'OFF' });
  });

  test('a row the channel does not allow (panel WEEKLY) is ignored', () => {
    const rows: PreferenceRow[] = [{ event: 'REPORT_DUE', channel: 'PANEL', frequency: 'WEEKLY' }];
    expect(resolveDelivery(rows, 'REPORT_DUE')).toEqual({ PANEL: 'INSTANT', EMAIL: 'OFF' });
  });

  test('credits are outside §13: panel only, whatever the rows say', () => {
    const rows: PreferenceRow[] = NOTIFICATION_EVENTS.flatMap((event) => [
      { event, channel: 'PANEL' as const, frequency: 'OFF' as const },
      { event, channel: 'EMAIL' as const, frequency: 'INSTANT' as const },
    ]);
    expect(eventOfType('CREDIT_EXHAUSTED')).toBeNull();
    expect(deliveryForType(rows, 'CREDIT_EXHAUSTED')).toEqual({ PANEL: 'INSTANT', EMAIL: 'OFF' });
  });
});

describe('PreferenceInputSchema', () => {
  test('accepts the allowed combinations', () => {
    expect(PreferenceInputSchema.parse({ event: 'REPORT_DUE', channel: 'EMAIL', frequency: 'WEEKLY' })).toEqual({
      event: 'REPORT_DUE',
      channel: 'EMAIL',
      frequency: 'WEEKLY',
    });
    expect(PreferenceInputSchema.safeParse({ event: 'REPORT_DUE', channel: 'PANEL', frequency: 'OFF' }).success).toBe(true);
  });

  test.each([
    [{ event: 'REPORT_DUE', channel: 'PANEL', frequency: 'WEEKLY' }, 'panel has no weekly digest'],
    [{ event: 'SAVED_SEARCH_MATCH', channel: 'EMAIL', frequency: 'OFF' }, 'a stored type is not a §13 event'],
    [{ event: 'REPORT_DUE', channel: 'SMS', frequency: 'OFF' }, 'unknown channel'],
    [{ event: 'REPORT_DUE', channel: 'EMAIL', frequency: 'DAILY' }, 'unknown frequency'],
    [{ event: 'REPORT_DUE', channel: 'EMAIL', frequency: 'OFF', userId: 'someone-else' }, 'extra key (no user from the client)'],
    [null, 'not an object'],
  ])('rejects %j (%s)', (input, _why) => {
    void _why;
    expect(PreferenceInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('weekly digest mail', () => {
  const items: OutboxItem[] = [
    {
      id: 'b',
      type: 'EVIDENCE_EXPIRING',
      payload: { evidenceId: 'e1', validUntil: '2026-12-01T00:00:00.000Z' },
      createdAt: new Date('2026-11-10T09:00:00Z'),
    },
    {
      id: 'a',
      type: 'SAVED_SEARCH_MATCH',
      payload: { searchId: 's1', searchName: 'Horizon <b>Health</b>', matchCount: 3 },
      createdAt: new Date('2026-11-09T09:00:00Z'),
    },
  ];

  test('every item in one mail, oldest first, counted in the subject (TR and EN)', () => {
    const trMail = renderDigestMail(items, translator('tr'));
    expect(trMail.subject).toBe('Haftalık bildirim özeti: 2 bildirim');
    expect(trMail.text.indexOf('Yeni eşleşme bulundu')).toBeLessThan(trMail.text.indexOf('Belge yakında sona erecek'));
    const enMail = renderDigestMail(items, translator('en'));
    expect(enMail.subject).toBe('Weekly notification summary: 2 notifications');
  });

  test('user text is escaped in the HTML', () => {
    const mail = renderDigestMail(items, translator('tr'));
    expect(mail.html).not.toContain('<b>Health</b>');
    expect(mail.html).toContain('&lt;b&gt;Health&lt;/b&gt;');
  });

  test('instant mail: the notification title is the subject, no line break can reach the header', () => {
    const mail = renderInstantMail(items[1]!, translator('tr'));
    expect(mail.subject).toBe('Yeni eşleşme bulundu');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

// NG-43 review Ö-2: the mail went but marking it sent failed. Counted in
// `failures`, not thrown: the next recipient still gets their mail.
describe('a failed mark after an accepted send', () => {
  test('is counted in failures and the run goes on to the next recipient', async () => {
    const item = (id: string): OutboxItem & { tenantId: string } => ({
      id,
      tenantId: id === 'i1' ? 't1' : 't2',
      type: 'SAVED_SEARCH_MATCH',
      payload: { searchId: 's', searchName: 'X', matchCount: 1 },
      createdAt: new Date('2026-11-10T09:00:00Z'),
    });
    const system = {
      notificationEmailItem: {
        findMany: async () => [
          { tenantId: 't1', userId: 'u1' },
          { tenantId: 't2', userId: 'u2' },
        ],
      },
      tenant: { findMany: async () => [{ id: 't1' }, { id: 't2' }] },
    } as unknown as SystemTx;
    const marked: string[] = [];
    const tenantTx = (tenantId: string) =>
      ({
        notificationEmailItem: {
          findMany: async () => [item(tenantId === 't1' ? 'i1' : 'i2')],
          updateMany: async (args: {
            where: { id: { in: string[] }; sentAt: null };
            data?: { claimToken?: string | null; claimedAt?: Date | null };
          }) => {
            if (typeof args.data?.claimToken === 'string') return { count: 1 }; // NG-131: the claim, not the mark
            if (args.data?.claimedAt) return { count: args.where.id.in.length }; // NG-164: the lease renewal, not the mark
            expect(args.where.sentAt).toBeNull();
            if (tenantId === 't1') throw new Error('connection reset');
            marked.push(...args.where.id.in);
            return { count: args.where.id.in.length };
          },
          // The first draft deleted instead of marking; same failure there.
          deleteMany: async () => {
            if (tenantId === 't1') throw new Error('connection reset');
            return { count: 1 };
          },
        },
        membership: {
          findFirst: async () => ({ user: { email: `${tenantId}@example.com`, locale: 'tr' } }),
        },
      }) as unknown as TenantTx;
    const sent: string[] = [];
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendNotificationEmails({
      mode: 'INSTANT',
      mailer: async (m) => void sent.push(m.to),
      translatorFor: () => translator('tr'),
      systemScope: (cb) => cb(system),
      runTenant: (tenantId, cb) => cb(tenantTx(tenantId)),
    });
    errorLog.mockRestore();

    expect(sent).toEqual(['t1@example.com', 't2@example.com']);
    expect(marked).toEqual(['i2']);
    expect(result).toMatchObject({ recipients: 2, mailsSent: 2, itemsSent: 2, failures: 1 });
  });
});
