/**
 * FO-204 — when the free translation service is over quota (HTTP 429 or its
 * "MYMEMORY WARNING" text), the batch reports how many texts it could not
 * translate and gives back the English originals. The service is then left
 * alone for TRANSLATION_QUOTA_PAUSE_FIRST_MS; after the pause exactly one call
 * probes it, and a failed probe doubles the pause up to TRANSLATION_QUOTA_PAUSE_MAX_MS.
 * A text that never got a translation is not remembered as English.
 */
import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  TRANSLATION_QUOTA_PAUSE_FIRST_MS,
  resetTranslationQuotaPause,
  translateTopicsBatch,
} from '@/lib/translation';

const translatedOk = (text: string) =>
  new Response(JSON.stringify({ responseData: { translatedText: text } }), { status: 200 });
const quotaRefused = () => new Response('quota', { status: 429 });

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
    const fetchMock = vi.fn().mockResolvedValueOnce(quotaRefused()).mockResolvedValueOnce(translatedOk('gamma çevrildi'));
    vi.stubGlobal('fetch', fetchMock);

    const first = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr');
    const during = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr');
    expect(first.untranslated).toBe(1);
    expect(during.untranslated).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_FIRST_MS + 1);
    const after = await translateTopicsBatch([{ title: 'quota retry gamma' }], 'tr');

    expect(after.untranslated).toBe(0);
    expect(after.items[0]?.title).toBe('gamma çevrildi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a refusal from a call sent before the pause does not extend it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const replies: Array<(r: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => replies.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);

    const early = translateTopicsBatch([{ title: 'pause early delta' }], 'tr');
    const first = translateTopicsBatch([{ title: 'pause refused delta' }], 'tr');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const start = Date.now();

    replies[1]!(quotaRefused());
    await first;
    vi.setSystemTime(start + 30_000);
    replies[0]!(quotaRefused());
    await early;

    // 61 s after the first refusal the pause is over, the 30 s refusal notwithstanding.
    vi.setSystemTime(start + TRANSLATION_QUOTA_PAUSE_FIRST_MS + 1_000);
    const probe = translateTopicsBatch([{ title: 'pause probe delta' }], 'tr');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    replies[2]!(translatedOk('delta çevrildi'));

    expect((await probe).untranslated).toBe(0);
  });

  test('after the pause only one call probes the service; the rest wait for its answer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const replies: Array<(r: Response) => void> = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(quotaRefused())
      .mockImplementation(() => new Promise<Response>((resolve) => replies.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);

    await translateTopicsBatch([{ title: 'single probe epsilon' }], 'tr');
    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_FIRST_MS + 1);

    const a = translateTopicsBatch([{ title: 'single probe zeta' }], 'tr');
    const b = translateTopicsBatch([{ title: 'single probe eta' }], 'tr');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    replies[0]!(translatedOk('zeta çevrildi'));
    expect((await a).untranslated).toBe(0);
    expect((await b).untranslated).toBe(1);
  });

  test('a failed probe doubles the pause, and a successful one clears it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(quotaRefused())
      .mockResolvedValueOnce(quotaRefused())
      .mockResolvedValueOnce(translatedOk('theta çevrildi'));
    vi.stubGlobal('fetch', fetchMock);

    await translateTopicsBatch([{ title: 'backoff theta' }], 'tr');
    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_FIRST_MS + 1);
    await translateTopicsBatch([{ title: 'backoff theta' }], 'tr');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The second pause is twice the first: a minute later it still holds.
    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_FIRST_MS);
    await translateTopicsBatch([{ title: 'backoff theta' }], 'tr');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_FIRST_MS + 1);
    const recovered = await translateTopicsBatch([{ title: 'backoff theta' }], 'tr');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(recovered.items[0]?.title).toBe('theta çevrildi');

    // Success resets the backoff: the next outage starts again at the short pause.
    const fourth = vi.fn(async () => quotaRefused());
    vi.stubGlobal('fetch', fourth);
    await translateTopicsBatch([{ title: 'backoff iota' }], 'tr');
    vi.setSystemTime(Date.now() + TRANSLATION_QUOTA_PAUSE_FIRST_MS + 1);
    await translateTopicsBatch([{ title: 'backoff iota' }], 'tr');
    expect(fourth).toHaveBeenCalledTimes(2);
  });
});
