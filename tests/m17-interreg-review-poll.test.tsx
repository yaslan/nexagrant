// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import type { InterregAnalysisView } from '@/modules/m17/server/analyses';
import type { InterregResultView } from '@/modules/m17/result-view';

import { InterregReviewClient } from '@/app/[locale]/(app)/[workspace]/modules/interreg-review/client';

/**
 * FO-189 (crw-fb review of PR #206, finding 3) — a run this page did not start is
 * polled every 5 s. A failed look (network error) used to reject inside
 * setInterval with nothing to catch it, and a run that never ended was polled
 * forever. Pinned here: a failed look is retried on the next tick and the report
 * still arrives; after 120 looks the page stops and says so.
 */

const DOC = { fileName: 'call.md', format: 'md', pages: null, chars: 900, extractedAt: '2026-10-28T10:00:00.000Z' };

function view(status: InterregAnalysisView['status']): InterregAnalysisView {
  return {
    id: 'a1',
    status,
    assessmentKind: 'internal_pre_assessment',
    rubric: { id: 'bsb', label: 'BSB', maxRaw: 60, passRaw: 36 },
    call: DOC,
    project: { ...DOC, fileName: 'project.txt', format: 'txt' },
    textExpiresAt: null,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
  };
}

const RESULT: InterregResultView = {
  analysisId: 'a1',
  assessmentKind: 'internal_pre_assessment',
  rubricId: 'bsb',
  rawScore: 37,
  maxRaw: 60,
  score100: 62,
  passesThresholds: false,
  knockouts: [],
  reportMarkdown: '## 📊 Özet\n\nmetin',
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function renderClient() {
  return render(
    <NextIntlClientProvider locale="tr" messages={trMessages}>
      <InterregReviewClient />
    </NextIntlClientProvider>,
  );
}

/** One poll tick, then let its fetch chain settle. */
async function tick() {
  await act(async () => {
    vi.advanceTimersByTime(5_000);
  });
}

beforeEach(() => {
  // Only the interval is faked: fetch promises and React's own scheduling stay real.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('M17 screen — polling a run started elsewhere', () => {
  it('a failed look is retried on the next tick, and the report arrives', async () => {
    let looks = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/interreg-review/analyses') return json({ analyses: [view('ANALYZING')] });
      if (url === '/api/interreg-review/analyses/a1/result') return json({ result: RESULT });
      looks += 1;
      if (looks === 1) throw new TypeError('Failed to fetch');
      return json({ analysis: view('DONE') });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderClient();
    expect(await screen.findByTestId('m17-analyzing')).toBeTruthy();

    await tick(); // network error: caught, still analyzing
    expect(screen.queryByTestId('m17-report')).toBeNull();
    expect(screen.queryByTestId('m17-action-error')).toBeNull();

    await tick(); // DONE
    expect(await screen.findByTestId('m17-report')).toBeTruthy();
    expect(looks).toBe(2);

    await tick(); // the interval is gone once the run ended
    expect(looks).toBe(2);
  });

  it('stops after 120 looks and tells the user to refresh', async () => {
    let looks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/interreg-review/analyses') return json({ analyses: [view('ANALYZING')] });
        looks += 1;
        return json({ analysis: view('ANALYZING') });
      }),
    );

    renderClient();
    await screen.findByTestId('m17-analyzing');
    for (let i = 0; i < 120; i += 1) await tick();
    expect(looks).toBe(120);
    expect(screen.queryByTestId('m17-action-error')).toBeNull();

    await tick();
    expect(screen.getByTestId('m17-action-error').textContent).toBe(trMessages.InterregReview.ui.stillRunning);
    await tick();
    expect(looks).toBe(120);
  });
});
