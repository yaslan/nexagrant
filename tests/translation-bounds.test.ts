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

  // İNCELEME-70 D-2 (TASK-MUNVVMJDEO932): the cap alone passed even when the
  // newest entry was the one thrown out, so a hot title never stayed cached.
  test('at the cap the oldest entry is evicted, the newest stays', async () => {
    const fetchMock = vi.fn(async () => reply('y'));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i <= TRANSLATION_CACHE_MAX_ENTRIES; i++) {
      await translateText(`evict title ${i}`, 'tr');
    }
    fetchMock.mockClear();

    // Newest-first eviction still keeps the very last entry (it drops the one
    // before it to make room), so the second newest is the one that tells.
    await translateText(`evict title ${TRANSLATION_CACHE_MAX_ENTRIES}`, 'tr');
    await translateText(`evict title ${TRANSLATION_CACHE_MAX_ENTRIES - 1}`, 'tr');
    expect(fetchMock).not.toHaveBeenCalled(); // the newest two: served from the cache

    await translateText('evict title 0', 'tr');
    expect(fetchMock).toHaveBeenCalledTimes(1); // oldest: evicted, fetched again
    expect(translationStats().cacheSize).toBe(TRANSLATION_CACHE_MAX_ENTRIES);
  });
});
