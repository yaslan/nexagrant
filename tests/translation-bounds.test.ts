/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-1) — the free
 * translation service behind /api/cagrilar. Every title and short description
 * used to fire its own outbound call at once, and the cache grew without end.
 * Now at most MAX_CONCURRENT_TRANSLATIONS calls run across the process, and the
 * cache holds at most TRANSLATION_CACHE_MAX_ENTRIES entries.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  MAX_CONCURRENT_TRANSLATIONS,
  TRANSLATION_CACHE_MAX_ENTRIES,
  translateText,
  translateTopicsBatch,
  translationStats,
} from '@/lib/translation';

afterEach(() => {
  vi.unstubAllGlobals();
});

function reply(text: string) {
  return new Response(JSON.stringify({ responseData: { translatedText: text } }), { status: 200 });
}

describe('translation bounds', () => {
  test('outbound calls never exceed the concurrency limit, and all of them finish', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return reply(`tr:${new URL(url).searchParams.get('q')}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const topics = Array.from({ length: 60 }, (_, i) => ({ title: `concurrency title ${i}`, description: `desc ${i}` }));
    const out = await translateTopicsBatch(topics, 'tr');

    expect(fetchMock).toHaveBeenCalledTimes(120);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_TRANSLATIONS);
    expect(peak).toBeGreaterThan(1); // still parallel, just bounded
    expect(out[59]).toEqual({ title: 'tr:concurrency title 59', description: 'tr:desc 59' });
    expect(translationStats()).toMatchObject({ active: 0, queued: 0 });
  });

  test('the cache stops growing at its cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('x')));
    for (let i = 0; i < TRANSLATION_CACHE_MAX_ENTRIES + 25; i++) {
      await translateText(`cache title ${i}`, 'tr');
    }
    expect(translationStats().cacheSize).toBe(TRANSLATION_CACHE_MAX_ENTRIES);
  });
});
