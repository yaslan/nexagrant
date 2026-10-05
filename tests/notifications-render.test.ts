import { describe, expect, test } from 'vitest';
import { createTranslator } from 'next-intl';

import en from '../messages/en.json';
import tr from '../messages/tr.json';
import { renderNotification, type NotificationTranslator } from '@/lib/notifications/render';

/**
 * TASK-MUVR2C9H3KTHQ — the bell and /notifications render text from
 * `type` + `payload` (ADR-0011 §3.1) over the real message files. `searchName`
 * is user input (se-fb, PR #51): it must come out as the same plain string,
 * and a payload of the wrong shape must give the generic text, never the raw
 * value.
 */
const tEn = createTranslator({ locale: 'en', messages: en, namespace: 'Notifications' }) as unknown as NotificationTranslator;
const tTr = createTranslator({ locale: 'tr', messages: tr, namespace: 'Notifications' }) as unknown as NotificationTranslator;

const XSS = '<img src=x onerror=alert(1)>';

describe('renderNotification — each type, EN and TR', () => {
  test('SAVED_SEARCH_MATCH', () => {
    const payload = { searchId: 's1', searchName: 'Horizon AI', matchCount: 3 };
    expect(renderNotification('SAVED_SEARCH_MATCH', payload, tEn)).toEqual({
      title: 'New match found',
      description: '3 calls matched "Horizon AI"',
      icon: 'match',
    });
    expect(renderNotification('SAVED_SEARCH_MATCH', payload, tTr)).toEqual({
      title: 'Yeni eşleşme bulundu',
      description: '3 çağrı "Horizon AI" ile eşleşti',
      icon: 'match',
    });
    expect(renderNotification('SAVED_SEARCH_MATCH', { ...payload, matchCount: 1 }, tEn).description).toBe(
      '1 call matched "Horizon AI"'
    );
    expect(renderNotification('SAVED_SEARCH_MATCH', { ...payload, matchCount: 1 }, tTr).description).toBe(
      '1 çağrı "Horizon AI" ile eşleşti'
    );
  });

  test('CREDIT_GRANTED', () => {
    expect(renderNotification('CREDIT_GRANTED', { amount: 500, source: 'monthly' }, tEn)).toEqual({
      title: 'Credits added',
      description: '500 AI credits added (Monthly grant)',
      icon: 'credit',
    });
    expect(renderNotification('CREDIT_GRANTED', { amount: 500, source: 'stripe' }, tTr)).toEqual({
      title: 'Kredi eklendi',
      description: '500 AI kredisi eklendi (Stripe)',
      icon: 'credit',
    });
    // An unknown source is not echoed back.
    expect(renderNotification('CREDIT_GRANTED', { amount: 5, source: XSS }, tEn).description).toBe(
      '5 AI credits added (another source)'
    );
  });

  test('CREDIT_EXHAUSTED', () => {
    expect(renderNotification('CREDIT_EXHAUSTED', { module: 'M4' }, tEn)).toEqual({
      title: 'Credits exhausted',
      description: 'No AI credits left for M4',
      icon: 'warning',
    });
    expect(renderNotification('CREDIT_EXHAUSTED', { module: 'M4' }, tTr)).toEqual({
      title: 'Kredi tükendi',
      description: 'M4 için AI kredisi kalmadı',
      icon: 'warning',
    });
  });

  test('EVIDENCE_EXPIRING keeps only the date part of an ISO value', () => {
    const payload = { evidenceId: 'e1', validUntil: '2026-11-30T00:00:00.000Z' };
    expect(renderNotification('EVIDENCE_EXPIRING', payload, tEn)).toEqual({
      title: 'Document expiring soon',
      description: 'Valid until 2026-11-30',
      icon: 'warning',
    });
    expect(renderNotification('EVIDENCE_EXPIRING', payload, tTr)).toEqual({
      title: 'Belge yakında sona erecek',
      description: 'Geçerli tarih: 2026-11-30',
      icon: 'warning',
    });
  });
});

describe('renderNotification — searchName stays a plain string', () => {
  test('markup in searchName comes out verbatim, as text', () => {
    const payload = { searchId: 's1', searchName: XSS, matchCount: 2 };
    const enText = renderNotification('SAVED_SEARCH_MATCH', payload, tEn);
    const trText = renderNotification('SAVED_SEARCH_MATCH', payload, tTr);
    expect(typeof enText.description).toBe('string');
    expect(enText.description).toBe(`2 calls matched "${XSS}"`);
    expect(trText.description).toBe(`2 çağrı "${XSS}" ile eşleşti`);
  });

  test('ICU syntax in searchName is not interpreted', () => {
    const name = '{matchCount} {searchName, select, other {x}}';
    expect(renderNotification('SAVED_SEARCH_MATCH', { searchName: name, matchCount: 2 }, tEn).description).toBe(
      `2 calls matched "${name}"`
    );
  });
});

describe('renderNotification — broken payload gives the generic text', () => {
  const genericEn = { title: 'Notification', description: 'You have a new notification.', icon: 'info' };
  const genericTr = { title: 'Bildirim', description: 'Yeni bir bildiriminiz var.', icon: 'info' };

  test.each([
    ['SAVED_SEARCH_MATCH', { searchName: { toString: (): string => XSS }, matchCount: 2 }],
    ['SAVED_SEARCH_MATCH', { searchName: 'ok', matchCount: '2' }],
    ['SAVED_SEARCH_MATCH', { searchName: 'ok', matchCount: Number.NaN }],
    ['SAVED_SEARCH_MATCH', { searchName: ['a'], matchCount: 2 }],
    ['CREDIT_GRANTED', { amount: '500', source: 'monthly' }],
    ['CREDIT_GRANTED', { amount: Infinity, source: 'monthly' }],
    ['CREDIT_EXHAUSTED', { module: 42 }],
    ['EVIDENCE_EXPIRING', { evidenceId: 'e1', validUntil: 'javascript:alert(1)' }],
    ['EVIDENCE_EXPIRING', { evidenceId: 'e1' }],
    ['SAVED_SEARCH_MATCH', null],
    ['SAVED_SEARCH_MATCH', 'not an object'],
    ['SAVED_SEARCH_MATCH', [1, 2]],
    ['UNKNOWN_TYPE', { searchName: 'x', matchCount: 1 }],
  ])('%s with %j', (type, payload) => {
    expect(renderNotification(type, payload, tEn)).toEqual(genericEn);
    expect(renderNotification(type, payload, tTr)).toEqual(genericTr);
  });
});
