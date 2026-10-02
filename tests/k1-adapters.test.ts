import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Adapters raise SystemAlerts on drift/failure; keep the DB out of unit tests.
const systemAlertCreate = vi.fn().mockResolvedValue({});
vi.mock('../src/lib/db', () => ({
  prisma: { systemAlert: { create: (...args: unknown[]) => systemAlertCreate(...args) } },
}));

import { SediaAdapter } from '../src/lib/adapters/sedia';
import { EurostarsAdapter } from '../src/lib/adapters/eurostars';
import { TubitakAdapter } from '../src/lib/adapters/tubitak';
import {
  computeAgeInDays,
  detectLumpSum,
  detectTwoStage,
  EU_EEA_CH,
  inferEligibilityFromText,
} from '../src/lib/adapters/schemas/common';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const sediaFixture = () => JSON.parse(fixture('sedia-search.json'));

/** `now` is pinned so every age/status assertion is deterministic. */
const NOW = new Date('2026-09-06T12:00:00Z');

function mockFetchJson(payload: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
}

function mockFetchText(body: string, ok = true, status = 200, statusText = 'OK') {
  return vi.fn().mockResolvedValue({ ok, status, statusText, text: async () => body });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  systemAlertCreate.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('K1 normalization helpers', () => {
  it('computeAgeInDays returns today − callDate, and null when the date is unknown', () => {
    expect(computeAgeInDays('2026-09-01T00:00:00Z', NOW)).toBe(5);
    // A call that has not opened yet is negative, not clamped to 0.
    expect(computeAgeInDays('2026-12-08T00:00:00Z', NOW)).toBe(-93);
    expect(computeAgeInDays(null, NOW)).toBeNull();
    expect(computeAgeInDays('not-a-date', NOW)).toBeNull();
  });

  it('infers EU/EEA/CH-only eligibility and leaves other text untouched', () => {
    const eligible = inferEligibilityFromText('Participation is limited to EU/EEA/CH only.');
    expect(eligible?.restricted).toBe('EU_EEA_CH_ONLY');
    expect(eligible?.eligibleCountries).toEqual([...EU_EEA_CH]);

    expect(inferEligibilityFromText('Open to all associated countries.')).toBeNull();
  });

  it('detects lump sum and two-stage flags from free text', () => {
    expect(detectLumpSum('HORIZON Lump Sum grant')).toBe(true);
    expect(detectLumpSum('HORIZON RIA')).toBe(false);
    expect(detectTwoStage('two-stage')).toBe(true);
    expect(detectTwoStage('single-stage')).toBe(false);
  });
});

describe('SediaAdapter.normalizeResult', () => {
  const adapter = new SediaAdapter();
  const raw = () => sediaFixture().results[0];

  it('extracts callId, deadline, flags, eligibleCountries and ageInDays', () => {
    const topic = adapter.normalizeResult(raw(), NOW);

    expect(topic.identifier).toBe('HORIZON-MSCA-2027-COFUND-01-01');
    expect(topic.callIdentifier).toBe('HORIZON-MSCA-2027-COFUND-01');
    expect(topic.status).toBe('FORTHCOMING');

    // budgetOverview deadline dates win, normalized to 17:00 Brussels.
    expect(topic.deadlines).toEqual([
      { stage: 1, at: '2027-04-06T17:00:00.000Z', tz: 'Europe/Brussels' },
    ]);
    expect(topic.nextDeadlineAt).toBe('2027-04-06T17:00:00.000Z');

    expect(topic.isTwoStage).toBe(false);
    expect(topic.plannedOpeningDate).toBe('2026-12-08T00:00:00.000Z');
    expect(topic.ageInDays).toBe(-93);

    // "limited to EU/EEA/CH only" lives in topicConditions.
    expect(topic.eligibility.restricted).toBe('EU_EEA_CH_ONLY');
    expect(topic.eligibility.eligibleCountries).toEqual([...EU_EEA_CH]);

    // description comes from the search payload — no per-topic round-trip.
    expect(topic.description).toContain('Expected Outcome');
    expect(topic.description).not.toContain('<p');
  });

  it('is deterministic — the same payload normalizes to the same topic', () => {
    expect(adapter.normalizeResult(raw(), NOW)).toEqual(adapter.normalizeResult(raw(), NOW));
  });

  it('survives a result with no deadline, no budget and no conditions', () => {
    const topic = adapter.normalizeResult(
      { metadata: { identifier: ['X-1'], title: ['Bare topic'], status: ['31094502'] } },
      NOW
    );
    expect(topic.identifier).toBe('X-1');
    expect(topic.status).toBe('OPEN');
    expect(topic.deadlines).toEqual([]);
    expect(topic.nextDeadlineAt).toBeNull();
    expect(topic.ageInDays).toBeNull();
    expect(topic.eligibility.eligibleCountries).toEqual([]);
  });
});

describe('SediaAdapter.fetchSediaTopics', () => {
  it('returns ok with topics for a well-formed payload', async () => {
    globalThis.fetch = mockFetchJson(sediaFixture()) as unknown as typeof fetch;

    const result = await new SediaAdapter().fetchSediaTopics({ maxPages: 1, pageSize: 1 });

    expect(result.status).toBe('ok');
    expect(result.topicsProcessed).toBe(1);
    expect(result.schemaDrift).toEqual([]);
  });

  it('reports { status: error, reason, topicsProcessed: 0 } instead of throwing', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const result = await new SediaAdapter().fetchSediaTopics({ maxPages: 1 });

    expect(result.status).toBe('error');
    expect(result.topicsProcessed).toBe(0);
    expect(result.topics).toEqual([]);
    expect(result.reason).toContain('ECONNREFUSED');
  });

  it('raises a SystemAlert when the upstream envelope changes shape', async () => {
    // `totalResults` gone and `results` renamed — a real contract break.
    globalThis.fetch = mockFetchJson({ hits: [] }) as unknown as typeof fetch;

    const result = await new SediaAdapter().fetchSediaTopics({ maxPages: 1 });

    expect(result.schemaDrift.length).toBeGreaterThan(0);
    expect(systemAlertCreate).toHaveBeenCalled();
    const alert = systemAlertCreate.mock.calls[0]![0] as {
      data: { level: string; source: string; message: string };
    };
    expect(alert.data.level).toBe('warn');
    expect(alert.data.source).toBe('sedia_adapter');
    expect(alert.data.message).toContain('API schema change detected');
  });

  // TASK-MUPVLWSIPC5WU: the calls page asks for the page a person is on.
  it('starts at startPage, asks SEDIA for that page number and reports it back', async () => {
    const fetchMock = mockFetchJson(sediaFixture());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new SediaAdapter().searchSedia({ startPage: 3, maxPages: 1, pageSize: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('pageSize=20&pageNumber=3');
    expect(result.pageNumber).toBe(3);
    expect(result.totalResults).toBe(sediaFixture().totalResults);
  });

  it('skips a result whose required metadata is missing, and records the drift', async () => {
    const payload = sediaFixture();
    delete payload.results[0].metadata.identifier;
    globalThis.fetch = mockFetchJson(payload) as unknown as typeof fetch;

    const result = await new SediaAdapter().fetchSediaTopics({ maxPages: 1 });

    expect(result.topicsProcessed).toBe(0);
    expect(result.schemaDrift.join(' ')).toContain('metadata.identifier');
  });
});

describe('EurostarsAdapter', () => {
  it('parses call number and deadline from the live card markup', () => {
    const topics = new EurostarsAdapter().parseCallsFromHtml(
      fixture('eurostars-calls.html'),
      NOW
    );

    const ids = topics.map((t) => t.identifier);
    expect(ids).toContain('EUROSTARS-CALL-11');
    expect(ids).toContain('EUROSTARS-CALL-12');

    const call11 = topics.find((t) => t.identifier === 'EUROSTARS-CALL-11')!;
    expect(call11.nextDeadlineAt).toBe('2026-09-10T17:00:00.000Z');
    expect(call11.deadlines[0]!.tz).toBe('Europe/Brussels');
    expect(call11.status).toBe('OPEN');
    // No single-country restriction for a EUREKA consortium call.
    expect(call11.eligibility.eligibleCountries).toEqual([]);
  });

  it('reports an error envelope when the page is blocked', async () => {
    globalThis.fetch = mockFetchText('', false, 403, 'Forbidden') as unknown as typeof fetch;

    const result = await new EurostarsAdapter().fetchEurostarsTopics();

    expect(result.status).toBe('error');
    expect(result.topicsProcessed).toBe(0);
    expect(result.reason).toContain('403');
    expect(systemAlertCreate).toHaveBeenCalled();
  });

  it('flags schema drift when a 200 page yields no recognizable call', async () => {
    globalThis.fetch = mockFetchText('<html><body>nothing here</body></html>') as unknown as typeof fetch;

    const result = await new EurostarsAdapter().fetchEurostarsTopics();

    expect(result.status).toBe('ok');
    expect(result.topicsProcessed).toBe(0);
    expect(result.schemaDrift.length).toBe(1);
  });
});

describe('TubitakAdapter', () => {
  it('parses programme codes and names from the support catalogue', () => {
    const topics = new TubitakAdapter().parseCallsFromHtml(
      fixture('tubitak-programmes.html'),
      NOW
    );

    expect(topics.length).toBeGreaterThan(3);

    const p1001 = topics.find((t) => t.identifier === 'TUBITAK-1001')!;
    expect(p1001).toBeDefined();
    expect(p1001.title).toContain('1001');
    expect(p1001.sourceUrl).toContain('tubitak.gov.tr');
    // TÜBİTAK programmes are bound to Türkiye.
    expect(p1001.eligibility.restricted).toBe('TR');
    expect(p1001.eligibility.eligibleCountries).toEqual(['TR']);
    // The catalogue carries no dates — the programme is not in a call window.
    expect(p1001.status).toBe('FORTHCOMING');
  });

  it('does not emit duplicate programme ids', () => {
    const topics = new TubitakAdapter().parseCallsFromHtml(
      fixture('tubitak-programmes.html'),
      NOW
    );
    expect(new Set(topics.map((t) => t.identifier)).size).toBe(topics.length);
  });

  it('reports an error envelope when the page 404s', async () => {
    globalThis.fetch = mockFetchText('', false, 404, 'Not Found') as unknown as typeof fetch;

    const result = await new TubitakAdapter().fetchTubitakTopics();

    expect(result.status).toBe('error');
    expect(result.topicsProcessed).toBe(0);
    expect(result.reason).toContain('404');
  });
});
