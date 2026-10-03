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

  // TASK-MUS7OVUMOJZP3: a request the client gave up on (or whose budget ran out)
  // kept its jobs in the process-wide queue, in front of every live request.
  test('an aborted batch leaves the queue at once, its calls in flight are aborted, and nothing it queued is ever sent', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
            once: true,
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new AbortController();
    const topics = Array.from({ length: 30 }, (_, i) => ({ title: `abort title ${i}`, description: `abort desc ${i}` }));
    const batch = translateTopicsBatch(topics, 'tr', client.signal);

    await vi.waitFor(() => expect(translationStats().queued).toBeGreaterThan(0));
    expect(translationStats().active).toBe(MAX_CONCURRENT_TRANSLATIONS);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONCURRENT_TRANSLATIONS);

    client.abort();
    // The queue empties on the abort itself, not when the slots happen to free up.
    expect(translationStats().queued).toBe(0);

    const out = await batch;
    expect(translationStats()).toMatchObject({ active: 0, queued: 0 });
    // Only the calls that already held a slot were ever sent.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONCURRENT_TRANSLATIONS);
    // Untranslated text falls back to the original.
    expect(out[29]).toEqual({ title: 'abort title 29', description: 'abort desc 29' });

    // The slots are really free: a new batch runs straight through.
    vi.stubGlobal('fetch', vi.fn(async () => reply('sonra')));
    expect(await translateText('after abort', 'tr')).toBe('sonra');
  }, 2_000);

  // crw-fb Ö-2: when a slot passes to a waiter, `wake` removes the waiter's abort
  // listener. If the signal fires before the waiter's `run` starts, the listener
  // `run` adds never fires (the signal is already aborted), so the call went out
  // anyway and held the slot until its own 3 s timeout.
  test('a waiter aborted between getting the slot and starting its call sends nothing and frees the slot', async () => {
    const holders: Array<() => void> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      if (q.startsWith('race hold')) {
        return new Promise<Response>((resolve) => holders.push(() => resolve(reply(`tr:${q}`))));
      }
      // The late call stalls until its signal fires, like a dead upstream.
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const held = Array.from({ length: MAX_CONCURRENT_TRANSLATIONS }, (_, i) => translateText(`race hold ${i}`, 'tr'));
    await vi.waitFor(() => expect(holders).toHaveLength(MAX_CONCURRENT_TRANSLATIONS));

    const client = new AbortController();
    // `wake` is the only code that removes the waiter's abort listener. Abort
    // right after it, before the waiter's continuation can run.
    const removeListener = client.signal.removeEventListener.bind(client.signal);
    let woken = false;
    client.signal.removeEventListener = ((...args: Parameters<AbortSignal['removeEventListener']>) => {
      removeListener(...args);
      if (!woken && args[0] === 'abort') {
        woken = true;
        client.abort();
      }
    }) as AbortSignal['removeEventListener'];

    const started = Date.now();
    const late = translateText('race late title', 'tr', client.signal);
    expect(translationStats().queued).toBe(1);

    holders[0]!(); // frees one slot → it passes to the late waiter → wake → abort
    expect(await late).toBe('race late title'); // untranslated fallback
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(woken).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONCURRENT_TRANSLATIONS); // the late call never went out
    expect(translationStats()).toMatchObject({ active: MAX_CONCURRENT_TRANSLATIONS - 1, queued: 0 });

    holders.slice(1).forEach((release) => release());
    await Promise.all(held);
    expect(translationStats()).toMatchObject({ active: 0, queued: 0 });
  }, 2_000);
});
