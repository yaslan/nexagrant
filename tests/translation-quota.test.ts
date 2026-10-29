/**
 * FO-204 — when the free translation service is over quota (HTTP 429), the
 * batch reports each text it could not translate and gives back the English
 * originals. Nothing is cached for those texts, so a later call tries again.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import { translateTopicsBatch } from '@/lib/translation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('translateTopicsBatch when the service is over quota', () => {
  test('reports every untranslated text and keeps the English originals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })));

    const onUntranslated = vi.fn();
    const out = await translateTopicsBatch(
      [{ title: 'quota title alpha', description: 'quota desc alpha' }],
      'tr',
      undefined,
      { onUntranslated }
    );

    expect(out).toEqual([{ title: 'quota title alpha', description: 'quota desc alpha' }]);
    expect(onUntranslated).toHaveBeenCalledTimes(2);
  });

  test('a warning text in a 200 answer is not taken as a translation', async () => {
    const warning = 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ responseData: { translatedText: warning } }), { status: 200 }))
    );

    const onUntranslated = vi.fn();
    const out = await translateTopicsBatch([{ title: 'quota warning beta' }], 'tr', undefined, { onUntranslated });

    expect(out[0]?.title).toBe('quota warning beta');
    expect(onUntranslated).toHaveBeenCalledTimes(1);
  });

  test('a text that failed is retried on the next call, not remembered as English', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ responseData: { translatedText: 'gamma çevrildi' } }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = vi.fn();
    await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr', undefined, { onUntranslated: first });
    const second = vi.fn();
    const out = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr', undefined, { onUntranslated: second });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(out[0]?.title).toBe('gamma çevrildi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
