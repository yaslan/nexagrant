/**
 * FO-204 — when the free translation service is over quota (HTTP 429 or its
 * "MYMEMORY WARNING" text), the batch reports how many texts it could not
 * translate and gives back the English originals. The service is then left
 * alone for TRANSLATION_QUOTA_PAUSE_MS, and a text that never got a translation
 * is not remembered as English.
 */
import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  TRANSLATION_QUOTA_PAUSE_MS,
  resetTranslationQuotaPause,
  translateTopicsBatch,
} from '@/lib/translation';

beforeEach(() => {
  resetTranslationQuotaPause();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('translateTopicsBatch when the service is over quota', () => {
  test('counts every untranslated text and keeps the English originals', async () => {
    const fetchMock = vi.fn(async () => new Response('quota', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await translateTopicsBatch([{ title: 'quota title alpha', description: 'quota desc alpha' }], 'tr');

    expect(out.items).toEqual([{ title: 'quota title alpha', description: 'quota desc alpha' }]);
    expect(out.untranslated).toBe(2);
    // The first refusal pauses the service, so the second text is not sent at all.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a warning text in a 200 answer is not taken as a translation', async () => {
    const warning = 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ responseData: { translatedText: warning } }), { status: 200 }))
    );

    const out = await translateTopicsBatch([{ title: 'quota warning beta' }], 'tr');

    expect(out.items[0]?.title).toBe('quota warning beta');
    expect(out.untranslated).toBe(1);
  });

  test('while paused no call goes out; after the pause a failed text is translated', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ responseData: { translatedText: 'gamma çevrildi' } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr');
    const during = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr');
    expect(first.untranslated).toBe(1);
    expect(during.untranslated).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_MS + 1);
    const after = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr');

    expect(after.untranslated).toBe(0);
    expect(after.items[0]?.title).toBe('gamma çevrildi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
